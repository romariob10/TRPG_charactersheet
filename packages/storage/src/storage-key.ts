const STORAGE_KEY_PATTERN =
  /^(templates|exports)\/[0-9a-f]{2}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

export function assertStorageKey(key: string): void {
  if (!STORAGE_KEY_PATTERN.test(key)) {
    throw new StorageError("INVALID_STORAGE_KEY", "The storage key is invalid.");
  }
}

export class StorageError extends Error {
  public readonly code: StorageErrorCode;
  public readonly cause?: unknown;

  public constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.cause = cause;
  }
}

export type StorageErrorCode =
  | "INVALID_STORAGE_KEY"
  | "STORAGE_NOT_FOUND"
  | "STORAGE_WRITE_FAILED"
  | "STORAGE_FULL";
