import type {
  CatalogProgressEvent,
  FieldChangedEvent,
} from "@mycharacter/contracts";

export type RealtimeEvent = FieldChangedEvent | CatalogProgressEvent;
// eslint-disable-next-line no-unused-vars -- Function type parameter documents the event.
export type RealtimeListener = (event: RealtimeEvent) => void;

/* eslint-disable no-unused-vars -- Interface parameter names document the bus contract. */
export interface RealtimeBus {
  publish(event: RealtimeEvent): void;
  subscribe(characterId: string, listener: RealtimeListener): () => void;
  subscribeTemplate(templateId: string, listener: RealtimeListener): () => void;
}
/* eslint-enable no-unused-vars */
