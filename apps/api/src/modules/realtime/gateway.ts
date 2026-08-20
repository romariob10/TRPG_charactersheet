import { randomUUID } from "node:crypto";
import {
  realtimeClientMessageSchema,
  realtimeServerMessageSchema,
  type RealtimeServerMessage,
} from "@mycharacter/contracts";
import type { Database } from "@mycharacter/database";
import type { Kysely } from "kysely";
import { AppError } from "../../errors.js";
import type { Actor } from "../../plugins/auth.js";
import type { RealtimeBus } from "../../realtime/realtime-bus.js";
import { CharacterService } from "../characters/service.js";

const maximumMessageBytes = 64 * 1024;
const defaultHeartbeatMs = 15_000;

interface Subscription {
  unsubscribe: () => void;
  fieldId: string | null;
}

interface Connection {
  id: string;
  actor: Actor;
  socket: RealtimeSocket;
  lastHeartbeat: number;
  subscriptions: Map<string, Subscription>;
}

export class RealtimeGateway {
  private readonly characters: CharacterService;
  private readonly connections = new Map<RealtimeSocket, Connection>();
  private readonly presence = new Map<string, Map<string, Connection>>();
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private readonly bus: RealtimeBus;
  private readonly heartbeatMs: number;

  constructor(
    database: Kysely<Database>,
    bus: RealtimeBus,
    heartbeatMs = defaultHeartbeatMs,
  ) {
    this.characters = new CharacterService(database);
    this.bus = bus;
    this.heartbeatMs = heartbeatMs;
    this.heartbeatTimer = setInterval(() => this.expireConnections(), heartbeatMs);
    this.heartbeatTimer.unref();
  }

  connect(socket: RealtimeSocket, actor: Actor | null): void {
    if (!actor) {
      this.send(socket, errorMessage("AUTH_REQUIRED", "Authentication is required."));
      socket.close(4401, "Authentication required");
      return;
    }
    const connection: Connection = {
      id: randomUUID(),
      actor,
      socket,
      lastHeartbeat: Date.now(),
      subscriptions: new Map(),
    };
    this.connections.set(socket, connection);
    socket.on("message", (data) => void this.onMessage(connection, data));
    socket.on("close", () => this.disconnect(connection));
    socket.on("error", () => this.disconnect(connection));
  }

  close(): void {
    clearInterval(this.heartbeatTimer);
    for (const connection of this.connections.values()) {
      connection.socket.close(1001, "Server shutting down");
      this.disconnect(connection);
    }
  }

  private async onMessage(connection: Connection, raw: RealtimeRawData): Promise<void> {
    if (rawByteLength(raw) > maximumMessageBytes) {
      this.send(
        connection.socket,
        errorMessage("REALTIME_MESSAGE_TOO_LARGE", "Realtime message is too large."),
      );
      connection.socket.close(4409, "Message too large");
      return;
    }

    let input: unknown;
    try {
      input = JSON.parse(rawToString(raw));
    } catch {
      this.invalidMessage(connection);
      return;
    }
    const parsed = realtimeClientMessageSchema.safeParse(input);
    if (!parsed.success) {
      this.invalidMessage(connection);
      return;
    }

    connection.lastHeartbeat = Date.now();
    const message = parsed.data;
    if (message.type === "heartbeat") return;
    if (message.type === "unsubscribe") {
      this.unsubscribe(connection, message.characterId);
      return;
    }
    if (message.type === "focus") {
      const subscription = connection.subscriptions.get(message.characterId);
      if (!subscription) {
        this.send(
          connection.socket,
          errorMessage("REALTIME_NOT_SUBSCRIBED", "Subscribe before sending focus."),
        );
        return;
      }
      subscription.fieldId = message.fieldId;
      this.broadcastPresenceSnapshot(message.characterId);
      return;
    }
    await this.subscribe(connection, message.characterId);
  }

  private async subscribe(connection: Connection, characterId: string): Promise<void> {
    if (connection.subscriptions.has(characterId)) return;
    let character;
    try {
      character = await this.characters.get(connection.actor.userId, characterId);
    } catch (error) {
      if (!(error instanceof AppError) || ![403, 404].includes(error.statusCode)) {
        this.send(
          connection.socket,
          errorMessage("REALTIME_INTERNAL_ERROR", "The subscription could not be created."),
        );
        connection.socket.close(1011, "Subscription failed");
        return;
      }
      this.send(
        connection.socket,
        errorMessage(
          "REALTIME_SUBSCRIPTION_FORBIDDEN",
          "The character subscription is not allowed.",
        ),
      );
      return;
    }

    const sendEvent = (event: import("../../realtime/realtime-bus.js").RealtimeEvent) =>
      this.send(connection.socket, event);
    const unsubscribeCharacter = this.bus.subscribe(characterId, sendEvent);
    const unsubscribeTemplate = this.bus.subscribeTemplate(
      character.templateId,
      sendEvent,
    );
    connection.subscriptions.set(characterId, {
      unsubscribe: () => {
        unsubscribeCharacter();
        unsubscribeTemplate();
      },
      fieldId: null,
    });
    const members = this.presence.get(characterId) ?? new Map<string, Connection>();
    this.presence.set(characterId, members);

    this.send(connection.socket, {
      protocolVersion: 1,
      type: "subscribed",
      characterId,
      connectionId: connection.id,
      revision: character.revision,
    });
    this.send(connection.socket, {
      protocolVersion: 1,
      type: "presence.snapshot",
      characterId,
      members: [...members.values(), connection].map((member) =>
        this.presenceMember(member, characterId),
      ),
    });
    for (const member of members.values()) {
      this.send(member.socket, {
        protocolVersion: 1,
        type: "presence.joined",
        characterId,
        member: this.presenceMember(connection, characterId),
      });
    }
    members.set(connection.id, connection);
  }

  private unsubscribe(connection: Connection, characterId: string): void {
    const subscription = connection.subscriptions.get(characterId);
    if (!subscription) return;
    subscription.unsubscribe();
    connection.subscriptions.delete(characterId);
    const members = this.presence.get(characterId);
    members?.delete(connection.id);
    for (const member of members?.values() ?? []) {
      this.send(member.socket, {
        protocolVersion: 1,
        type: "presence.left",
        characterId,
        connectionId: connection.id,
      });
    }
    if (members?.size === 0) this.presence.delete(characterId);
  }

  private disconnect(connection: Connection): void {
    if (!this.connections.delete(connection.socket)) return;
    for (const characterId of [...connection.subscriptions.keys()]) {
      this.unsubscribe(connection, characterId);
    }
  }

  private expireConnections(): void {
    const cutoff = Date.now() - this.heartbeatMs * 2;
    for (const connection of this.connections.values()) {
      if (connection.lastHeartbeat < cutoff) {
        connection.socket.close(4408, "Heartbeat timeout");
        this.disconnect(connection);
      }
    }
  }

  private broadcastPresenceSnapshot(characterId: string): void {
    const members = this.presence.get(characterId);
    if (!members) return;
    const message: RealtimeServerMessage = {
      protocolVersion: 1,
      type: "presence.snapshot",
      characterId,
      members: [...members.values()].map((member) =>
        this.presenceMember(member, characterId),
      ),
    };
    for (const member of members.values()) this.send(member.socket, message);
  }

  private presenceMember(connection: Connection, characterId: string) {
    return {
      connectionId: connection.id,
      userId: connection.actor.userId,
      username: connection.actor.username,
      displayName: connection.actor.displayName ?? null,
      fieldId: connection.subscriptions.get(characterId)?.fieldId ?? null,
    };
  }

  private invalidMessage(connection: Connection): void {
    this.send(
      connection.socket,
      errorMessage("REALTIME_MESSAGE_INVALID", "Realtime message is invalid."),
    );
    connection.socket.close(4400, "Invalid message");
  }

  private send(socket: RealtimeSocket, message: RealtimeServerMessage): void {
    if (socket.readyState !== 1) return;
    const validated = realtimeServerMessageSchema.parse(message);
    socket.send(JSON.stringify(validated));
  }
}

function errorMessage(code: string, message: string): RealtimeServerMessage {
  return { protocolVersion: 1, type: "error", code, message };
}

/* eslint-disable no-unused-vars -- Parameter names document the WebSocket contract. */
interface RealtimeSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: RealtimeRawData) => void): unknown;
  on(event: "close" | "error", listener: () => void): unknown;
}
/* eslint-enable no-unused-vars */

type RealtimeRawPart = { byteLength: number; toString(): string };
type RealtimeRawData = RealtimeRawPart | RealtimeRawPart[];

function rawByteLength(raw: RealtimeRawData): number {
  if (Array.isArray(raw)) return raw.reduce((total, item) => total + item.byteLength, 0);
  return raw.byteLength;
}

function rawToString(raw: RealtimeRawData): string {
  return Array.isArray(raw) ? raw.map((item) => item.toString()).join("") : raw.toString();
}
