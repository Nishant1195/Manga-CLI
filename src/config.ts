import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface Config {
  concurrency: number;
  persistCache: boolean;
  waitForFullDownload: boolean;
}

export const DEFAULT_CONFIG: Config = {
  concurrency: 5,
  persistCache: false,
  waitForFullDownload: false,
};

const CONFIG_FILE_PATH = path.join(
  os.homedir(),
  ".config/manga-cli/config.json"
);

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const data = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
      const userConfig = JSON.parse(data);
      return {
        ...DEFAULT_CONFIG,
        ...userConfig,
      };
    }
  } catch (err) {
    // If parse error or read error, fallback to defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Config): void {
  const dir = path.dirname(CONFIG_FILE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), "utf8");
}

export function updateConfigValue(key: string, value: string): Config {
  const validKeys = ["concurrency", "persistCache", "waitForFullDownload"];
  if (!validKeys.includes(key)) {
    throw new Error(
      `Invalid config key "${key}". Valid keys are: ${validKeys.join(", ")}`
    );
  }

  const currentConfig = loadConfig();

  if (key === "concurrency") {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) {
      throw new Error(`Invalid value for concurrency: "${value}". Must be a positive integer.`);
    }
    currentConfig.concurrency = num;
  } else if (key === "persistCache") {
    const lower = value.trim().toLowerCase();
    if (lower !== "true" && lower !== "false") {
      throw new Error(`Invalid value for persistCache: "${value}". Must be "true" or "false".`);
    }
    currentConfig.persistCache = lower === "true";
  } else if (key === "waitForFullDownload") {
    const lower = value.trim().toLowerCase();
    if (lower !== "true" && lower !== "false") {
      throw new Error(`Invalid value for waitForFullDownload: "${value}". Must be "true" or "false".`);
    }
    currentConfig.waitForFullDownload = lower === "true";
  }

  saveConfig(currentConfig);
  return currentConfig;
}
