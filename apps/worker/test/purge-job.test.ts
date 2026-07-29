import { describe, expect, it, vi } from "vitest";
import { purgeTrash, type PurgeDependencies } from "../src/jobs/purge.js";

describe("trash purge worker", () => {
  it("deletes only records older than thirty days and records file intent first", async () => {
    const cutoff = new Date("2026-06-01T00:00:00.000Z");
    const dependencies: PurgeDependencies = {
      markEligibleFilesDeleting: vi.fn().mockResolvedValue([
        { id: "file-1", storageKey: "templates/aa/file.pdf" },
      ]),
      deleteObject: vi.fn().mockResolvedValue(undefined),
      removePurgedMetadata: vi.fn().mockResolvedValue(undefined),
    };

    const result = await purgeTrash(dependencies, cutoff);

    expect(dependencies.markEligibleFilesDeleting).toHaveBeenCalledWith(cutoff);
    expect(dependencies.deleteObject).toHaveBeenCalledWith("templates/aa/file.pdf");
    expect(dependencies.removePurgedMetadata).toHaveBeenCalledWith("file-1", cutoff);
    expect(result.files).toBe(1);
  });

  it("keeps metadata when object deletion must be retried", async () => {
    const dependencies: PurgeDependencies = {
      markEligibleFilesDeleting: vi.fn().mockResolvedValue([
        { id: "file-1", storageKey: "templates/aa/file.pdf" },
      ]),
      deleteObject: vi.fn().mockRejectedValue(new Error("disk busy")),
      removePurgedMetadata: vi.fn().mockResolvedValue(undefined),
    };

    await expect(purgeTrash(dependencies, new Date())).rejects.toThrow("disk busy");
    expect(dependencies.removePurgedMetadata).not.toHaveBeenCalled();
  });
});
