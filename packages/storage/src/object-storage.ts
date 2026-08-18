import type { Readable } from "node:stream";

export interface ObjectStat {
  size: number;
  modifiedAt: Date;
}

export interface OpenedObject extends ObjectStat {
  path: string;
  stream: Readable;
}

export interface ObjectRange {
  start?: number;
  end?: number;
}

export interface ObjectStorage {
  put(_key: string, _bytes: Uint8Array): Promise<ObjectStat>;
  stat(_key: string): Promise<ObjectStat>;
  open(_key: string, _range?: ObjectRange): Promise<OpenedObject>;
  delete(_key: string): Promise<void>;
}
