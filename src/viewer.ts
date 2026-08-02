import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const READER_SCRIPT_PATH = path.resolve(__dirname, "../reader/reader.py");

export async function viewChapter(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  return new Promise<void>((resolve, reject) => {
    const readerProc = spawn("python3", [READER_SCRIPT_PATH, dir], {
      stdio: "inherit",
    });

    readerProc.on("error", (err) => {
      console.error("Failed to start GTK4 Python reader process:", err.message);
      reject(err);
    });

    readerProc.on("close", () => {
      resolve();
    });
  });
}

export async function viewChapterProgressive(
  dir: string,
  _allPagesDownloadedPromise: Promise<string[]>
): Promise<void> {
  // Since reader.py polls the directory every 1s and appends new images
  // automatically while preserving scroll position, we directly spawn viewChapter!
  return viewChapter(dir);
}

/*
 ============================================================================
 UNUSED / LEGACY FEH VIEWER IMPLEMENTATION (Preserved for Fallback Capability)
 ============================================================================

const FEH_CONFIG_DIR = "/tmp/manga-cli/feh_config";

function ensureFehKeysConfig(): string {
  const fehDir = path.join(FEH_CONFIG_DIR, "feh");
  fs.mkdirSync(fehDir, { recursive: true });
  const keysPath = path.join(fehDir, "keys");

  const keysConfigContent = [
    "next_img n space Right",
    "prev_img p BackSpace Left",
    "quit q Escape",
  ].join("\n");

  fs.writeFileSync(keysPath, keysConfigContent, "utf8");
  return FEH_CONFIG_DIR;
}

export function getLastViewedPage(dir: string): string | null {
  const lastViewedFile = path.join(dir, ".last-viewed");
  try {
    if (fs.existsSync(lastViewedFile)) {
      const content = fs.readFileSync(lastViewedFile, "utf8").trim();
      if (content) {
        return path.basename(content);
      }
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

function spawnFeh(dir: string, startAtFile?: string): Promise<void> {
  const xdgConfigHome = ensureFehKeysConfig();
  const lastViewedPath = path.join(dir, ".last-viewed");

  const fehArgs = [
    "--info",
    `echo %F > '${lastViewedPath}'`,
    "-F",
    "-Z",
    "-.",
    "-S",
    "filename",
  ];

  if (startAtFile) {
    fehArgs.push("--start-at", startAtFile);
  }

  fehArgs.push("--", ".");

  return new Promise<void>((resolve, reject) => {
    const fehProc = spawn("feh", fehArgs, {
      cwd: dir,
      stdio: "inherit",
      env: {
        ...process.env,
        XDG_CONFIG_HOME: xdgConfigHome,
      },
    });

    fehProc.on("error", (err) => {
      console.error("Failed to start feh process:", err.message);
      reject(err);
    });

    fehProc.on("close", () => {
      resolve();
    });
  });
}
*/
