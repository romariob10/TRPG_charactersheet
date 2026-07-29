import type {
  CharacterChangesResponse,
  CharacterEditorData,
  FieldChangedEvent,
  RealtimeServerMessage,
} from "@mycharacter/contracts";

interface RealtimeClientOptions {
  characterId: string;
  initialRevision: number;
  onFieldChanged: (event: FieldChangedEvent) => void;
  onSnapshot: (character: CharacterEditorData) => void;
  onPresence: (count: number) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export class LocalRealtimeClient {
  private socket: WebSocket | null = null;
  private revision: number;
  private reconnectDelay = 500;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private stopped = false;
  private catchingUp = false;
  private buffered: FieldChangedEvent[] = [];
  private readonly presenceIds = new Set<string>();

  constructor(private readonly options: RealtimeClientOptions) {
    this.revision = options.initialRevision;
  }

  start(): void {
    this.stopped = false;
    this.connect();
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    this.socket?.close(1000, "Editor closed");
    this.socket = null;
  }

  focus(fieldId: string | null): void {
    this.send({
      protocolVersion: 1,
      type: "focus",
      characterId: this.options.characterId,
      fieldId,
    });
  }

  private connect(): void {
    if (this.stopped || !navigator.onLine) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime`);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.reconnectDelay = 500;
      this.options.onConnectionChange?.(true);
      this.send({
        protocolVersion: 1,
        type: "subscribe",
        characterId: this.options.characterId,
        afterRevision: this.revision,
      });
      this.startHeartbeat();
      void this.catchUp().catch(() => socket.close());
    });
    socket.addEventListener("message", (event) => this.onMessage(event.data));
    socket.addEventListener("close", () => this.reconnect());
    socket.addEventListener("error", () => socket.close());
  }

  private async catchUp(): Promise<void> {
    this.catchingUp = true;
    try {
      const response = await fetch(
        `/api/characters/${this.options.characterId}/changes?afterRevision=${this.revision}`,
        { credentials: "same-origin" },
      );
      if (!response.ok) throw new Error(`Realtime catch-up failed (${response.status}).`);
      const result = parseChangesResponse(await response.json());
      if (result.mode === "snapshot") {
        const character = result.character as CharacterEditorData;
        this.options.onSnapshot(character);
        this.revision = character.revision;
      } else {
        for (const change of result.changes) this.apply(change);
        this.revision = Math.max(this.revision, result.revision);
      }
      for (const change of this.buffered.sort((a, b) => a.revision - b.revision)) {
        this.apply(change);
      }
    } finally {
      this.buffered = [];
      this.catchingUp = false;
    }
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const message = parseServerMessage(json);
    if (!message) return;
    if (message.type === "field.changed") {
      if (this.catchingUp) this.buffered.push(message);
      else this.apply(message);
    } else if (message.type === "presence.snapshot") {
      this.presenceIds.clear();
      for (const member of message.members) this.presenceIds.add(member.connectionId);
      this.options.onPresence(this.presenceIds.size);
    } else if (message.type === "presence.joined") {
      this.presenceIds.add(message.member.connectionId);
      this.options.onPresence(this.presenceIds.size);
    } else if (message.type === "presence.left") {
      this.presenceIds.delete(message.connectionId);
      this.options.onPresence(this.presenceIds.size);
    }
  }

  private apply(change: FieldChangedEvent): void {
    if (change.revision <= this.revision) return;
    this.revision = change.revision;
    this.options.onFieldChanged(change);
  }

  private reconnect(): void {
    this.socket = null;
    this.stopHeartbeat();
    this.presenceIds.clear();
    this.options.onPresence(1);
    this.options.onConnectionChange?.(false);
    if (this.stopped || this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (document.visibilityState !== "visible") return;
    this.heartbeatTimer = window.setInterval(
      () => this.send({ protocolVersion: 1, type: "heartbeat" }),
      10_000,
    );
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      this.send({ protocolVersion: 1, type: "heartbeat" });
      this.startHeartbeat();
    } else {
      this.stopHeartbeat();
    }
  };

  private readonly onOnline = (): void => {
    if (!this.socket && this.reconnectTimer === null) this.connect();
  };

  private readonly onOffline = (): void => {
    this.socket?.close();
  };

  private send(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}

function parseServerMessage(value: unknown): RealtimeServerMessage | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("protocolVersion" in value) ||
    value.protocolVersion !== 1 ||
    !("type" in value) ||
    typeof value.type !== "string"
  ) {
    return null;
  }
  return value as RealtimeServerMessage;
}

function parseChangesResponse(value: unknown): CharacterChangesResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("mode" in value) ||
    (value.mode !== "changes" && value.mode !== "snapshot")
  ) {
    throw new Error("Realtime catch-up response is invalid.");
  }
  return value as CharacterChangesResponse;
}
