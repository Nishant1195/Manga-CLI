import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

const READER_SCRIPT_PATH = path.resolve(__dirname, "../../reader/reader.py");

export async function viewChapter(
  dir: string,
  startPage?: string
): Promise<void> {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}`);
  }

  const args = [READER_SCRIPT_PATH, dir];
  if (startPage) {
    args.push("--start-page", startPage);
  }

  return new Promise<void>((resolve, reject) => {
    const readerProc = spawn("python3", args, {
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
  _allPagesDownloadedPromise: Promise<string[]>,
  startPage?: string
): Promise<void> {
  return viewChapter(dir, startPage);
}
