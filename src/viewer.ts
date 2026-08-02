import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const FEH_CONFIG_DIR = "/tmp/manga-cli/feh_config";

function ensureFehKeysConfig(): string {
  const fehDir = path.join(FEH_CONFIG_DIR, "feh");
  fs.mkdirSync(fehDir, { recursive: true });
  const keysPath = path.join(fehDir, "keys");

  // feh keys config syntax: action key1 key2 ...
  const keysConfigContent = [
    "next_img n space Right",
    "prev_img p BackSpace Left",
    "quit q Escape",
  ].join("\n");

  fs.writeFileSync(keysPath, keysConfigContent, "utf8");
  return FEH_CONFIG_DIR;
}

export async function viewChapter(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter((file) => !file.startsWith("."));

  if (files.length === 0) {
    console.log(`No images found in directory: ${dir}`);
    return;
  }

  const xdgConfigHome = ensureFehKeysConfig();

  return new Promise<void>((resolve, reject) => {
    // -F: Fullscreen
    // -Z: Auto zoom to fit screen
    // -.: Scale down large images
    // -S filename: Sort by filename
    const fehProc = spawn(
      "feh",
      ["-F", "-Z", "-.", "-S", "filename", "--", "."],
      {
        cwd: dir,
        stdio: "inherit",
        env: {
          ...process.env,
          XDG_CONFIG_HOME: xdgConfigHome,
        },
      }
    );

    fehProc.on("error", (err) => {
      console.error("Failed to start feh process:", err.message);
      reject(err);
    });

    fehProc.on("close", () => {
      resolve();
    });
  });
}
