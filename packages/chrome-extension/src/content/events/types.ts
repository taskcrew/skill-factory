import type { RecordedEvent } from "@shared/types";

export type EventEmitter = (event: RecordedEvent) => void;

export interface EventHandler {
  attach(): void;
  detach(): void;
}
