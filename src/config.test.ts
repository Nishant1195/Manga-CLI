import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import {
  loadConfig,
  updateConfigValue,
  DEFAULT_CONFIG,
} from "./config";

vi.mock("fs");

describe("src/config.ts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("updateConfigValue() - concurrency validation", () => {
    it("should reject negative numbers, zero, and non-numeric strings for concurrency", () => {
      expect(() => updateConfigValue("concurrency", "-5")).toThrow(
        /Invalid value for concurrency/
      );
      expect(() => updateConfigValue("concurrency", "0")).toThrow(
        /Invalid value for concurrency/
      );
      expect(() => updateConfigValue("concurrency", "abc")).toThrow(
        /Invalid value for concurrency/
      );
    });

    it("should accept valid positive integers for concurrency", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined as any);

      const config = updateConfigValue("concurrency", "8");
      expect(config.concurrency).toBe(8);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe("updateConfigValue() - boolean flags validation", () => {
    it("should parse true/false strings into booleans for persistCache and waitForFullDownload", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any);
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined as any);

      const config1 = updateConfigValue("persistCache", "true");
      expect(config1.persistCache).toBe(true);

      const config2 = updateConfigValue("waitForFullDownload", "false");
      expect(config2.waitForFullDownload).toBe(false);
    });

    it("should reject invalid non-boolean strings for boolean flags", () => {
      expect(() => updateConfigValue("persistCache", "yes")).toThrow(
        /Invalid value for persistCache/
      );
      expect(() => updateConfigValue("waitForFullDownload", "1")).toThrow(
        /Invalid value for waitForFullDownload/
      );
    });
  });

  describe("updateConfigValue() - unknown keys", () => {
    it("should throw an error for unknown config keys", () => {
      expect(() => updateConfigValue("unknownKey", "123")).toThrow(
        /Invalid config key "unknownKey"/
      );
    });
  });

  describe("loadConfig() - merging defaults", () => {
    it("should merge a partial/incomplete config object with default values", () => {
      const partialJson = JSON.stringify({ concurrency: 10 });
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(partialJson);

      const config = loadConfig();
      expect(config).toEqual({
        concurrency: 10,
        persistCache: DEFAULT_CONFIG.persistCache,
        waitForFullDownload: DEFAULT_CONFIG.waitForFullDownload,
      });
    });
  });
});
