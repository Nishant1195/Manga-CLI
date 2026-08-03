import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import { downloadPagesProgressive } from "./download";

vi.mock("fs");

describe("src/download.ts - threshold logic", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined as any);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })
    );
  });

  it("should fire onThreshold() when completedCount reaches the specified percentage (50%) of total pages", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/page${i + 1}.jpg`);
    const onThreshold = vi.fn();

    await downloadPagesProgressive(
      urls,
      "/tmp/test-dest",
      onThreshold,
      50,
      2, // concurrency = 2
      false
    );

    expect(onThreshold).toHaveBeenCalledTimes(1);
  });

  it("should enforce effective 100% threshold when waitForFullDownload is true", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/page${i + 1}.jpg`);

    let completedAtThresholdCall = -1;
    let totalCompletedDuringRun = 0;

    const mockFetch = vi.fn().mockImplementation(async () => {
      totalCompletedDuringRun++;
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    const onThreshold = vi.fn().mockImplementation(() => {
      completedAtThresholdCall = totalCompletedDuringRun;
    });

    await downloadPagesProgressive(
      urls,
      "/tmp/test-dest",
      onThreshold,
      50, // thresholdPercent parameter set to 50, but waitForFullDownload is true
      2,
      true // waitForFullDownload = true
    );

    expect(onThreshold).toHaveBeenCalledTimes(1);
    expect(completedAtThresholdCall).toBe(10);
  });
});
