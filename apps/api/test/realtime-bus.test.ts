import { describe, expect, it } from "vitest";
import { LocalRealtimeBus } from "../src/realtime/local-realtime-bus.js";

describe("LocalRealtimeBus", () => {
  it("delivers topic messages to active subscribers", () => {
    const bus = new LocalRealtimeBus();
    const received: any[] = [];

    const unsubscribe = bus.subscribeTopic("user:123:notifications", (data) => {
      received.push(data);
    });

    bus.publishTopic("user:123:notifications", { type: "test", title: "Hello" });
    expect(received.length).toBe(1);
    expect(received[0]).toEqual({ type: "test", title: "Hello" });

    unsubscribe();
    bus.publishTopic("user:123:notifications", { type: "test2" });
    expect(received.length).toBe(1);
  });
});
