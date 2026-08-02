import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

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

export async function viewChapter(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const files = fs.readdirSync(dir).filter((file) => !file.startsWith("."));
  if (files.length === 0) {
    console.log(`No images found in directory: ${dir}`);
    return;
  }

  await spawnFeh(dir);
}

export async function viewChapterProgressive(
  dir: string,
  allPagesDownloadedPromise: Promise<string[]>
): Promise<void> {
  console.log(`[DEBUG] viewChapterProgressive called for dir: ${dir}`);

  if (!fs.existsSync(dir)) {
    console.log(`Directory does not exist yet for progressive viewing: ${dir}`);
  }

  // 1. Launch feh on initial batch of pages available right now
  await spawnFeh(dir);

  // 2. Wait for full download to finish if not already done
  const allDownloadedFiles = await allPagesDownloadedPromise;

  // 3. Check last viewed file
  const lastViewed = getLastViewedPage(dir);
  console.log(`[DEBUG] Batch 1 feh closed. Last viewed file: ${lastViewed}`);

  if (lastViewed && allDownloadedFiles.length > 0) {
    // Find files in directory sorted
    const sortedFiles = fs
      .readdirSync(dir)
      .filter((file) => !file.startsWith("."))
      .sort();

    const lastIdx = sortedFiles.indexOf(lastViewed);
    if (lastIdx !== -1 && lastIdx < sortedFiles.length - 1) {
      const nextFile = sortedFiles[lastIdx + 1];
      console.log(`[DEBUG] Relaunching feh starting at next page: ${nextFile}`);
      await spawnFeh(dir, nextFile);
    }
  }

  // Clean up .last-viewed state file
  try {
    const lastViewedFile = path.join(dir, ".last-viewed");
    if (fs.existsSync(lastViewedFile)) {
      fs.unlinkSync(lastViewedFile);
    }
  } catch {
    // Ignore cleanup error
  }
}
