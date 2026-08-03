import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import { cleanExpiredCache } from "./cache";

vi.mock("fs");

describe("src/cache.ts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should identify a folder as expired and delete it when its newest file's mtime is older than maxAgeDays", () => {
    const baseDir = "/tmp/manga-cli/weebcentral";
    const expiredFolder = "expired_ch_1";
    const folderPath = `${baseDir}/${expiredFolder}`;

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockImplementation((targetPath: any, opts?: any) => {
      if (targetPath === baseDir) {
        return [{ name: expiredFolder, isDirectory: () => true }] as any;
      }
      if (targetPath === folderPath) {
        return ["001.png"] as any;
      }
      return [] as any;
    });

    const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
    vi.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: fourDaysAgo } as any);
    vi.spyOn(fs, "rmSync").mockImplementation(() => undefined as any);

    cleanExpiredCache(baseDir, 3, false);

    expect(fs.rmSync).toHaveBeenCalledWith(folderPath, {
      recursive: true,
      force: true,
    });
  });

  it("should NOT delete a folder when its newest file was recently modified", () => {
    const baseDir = "/tmp/manga-cli/weebcentral";
    const recentFolder = "recent_ch_1";
    const folderPath = `${baseDir}/${recentFolder}`;

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockImplementation((targetPath: any, opts?: any) => {
      if (targetPath === baseDir) {
        return [{ name: recentFolder, isDirectory: () => true }] as any;
      }
      if (targetPath === folderPath) {
        return ["001.png"] as any;
      }
      return [] as any;
    });

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    vi.spyOn(fs, "statSync").mockReturnValue({ mtimeMs: oneHourAgo } as any);
    vi.spyOn(fs, "rmSync").mockImplementation(() => undefined as any);

    cleanExpiredCache(baseDir, 3, false);

    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it("should do nothing at all when persistCache is true, even with expired folders present", () => {
    const baseDir = "/tmp/manga-cli/weebcentral";
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue([]);
    vi.spyOn(fs, "rmSync").mockImplementation(() => undefined as any);

    cleanExpiredCache(baseDir, 3, true);

    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(fs.rmSync).not.toHaveBeenCalled();
  });

  it("should handle a missing/nonexistent baseDir gracefully without throwing", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    expect(() => cleanExpiredCache("/nonexistent/path", 3, false)).not.toThrow();
    expect(fs.existsSync).toHaveBeenCalledWith("/nonexistent/path");
  });
});
