import { realtimeServerMessageSchema } from "@mycharacter/contracts";
import { Client } from "pg";
import type { RealtimeBus } from "./realtime-bus.js";

const channel = "mycharacter_catalog_progress";

export class CatalogProgressBridge {
  private readonly client: Client;
  private readonly bus: RealtimeBus;

  constructor(databaseUrl: string, bus: RealtimeBus) {
    this.client = new Client({ connectionString: databaseUrl });
    this.bus = bus;
  }

  async start(): Promise<void> {
    this.client.on("notification", (notification) => {
      if (notification.channel !== channel || !notification.payload) return;
      try {
        const payload = JSON.parse(notification.payload) as Record<string, unknown>;
        const event = realtimeServerMessageSchema.safeParse({
          protocolVersion: 1,
          type: "catalog.progress",
          templateId: payload.templateId,
          status: payload.status,
          progress:
            typeof payload.progress === "number"
              ? payload.progress / 100
              : undefined,
        });
        if (event.success && event.data.type === "catalog.progress") {
          this.bus.publish(event.data);
        }
      } catch {
        // Ignore malformed database notifications; the HTTP fallback remains active.
      }
    });
    await this.client.connect();
    await this.client.query(`LISTEN ${channel}`);
  }

  async stop(): Promise<void> {
    await this.client.end();
  }
}
