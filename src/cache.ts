import * as fs from "fs";
import * as path from "path";

export function cleanExpiredCache(
  baseDir: string = "/tmp/manga-cli/weebcentral",
  maxAgeDays: number = 3,
  persistCache: boolean = false
): void {
  if (persistCache) {
    return;
  }

  try {
    if (!fs.existsSync(baseDir)) {
      return;
    }

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const folderPath = path.join(baseDir, entry.name);

      try {
        const files = fs.readdirSync(folderPath);

        if (files.length === 0) {
          // Delete empty folder
          fs.rmSync(folderPath, { recursive: true, force: true });
          deletedCount++;
          continue;
        }

        let newestMtime = 0;
        for (const file of files) {
          const filePath = path.join(folderPath, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs > newestMtime) {
              newestMtime = stat.mtimeMs;
            }
          } catch {
            // Ignore stat error for individual file
          }
        }

        if (newestMtime > 0 && newestMtime < cutoffMs) {
          fs.rmSync(folderPath, { recursive: true, force: true });
          deletedCount++;
        }
      } catch {
        // Skip permission errors or issue reading individual folder
      }
    }

    if (deletedCount > 0) {
      console.log(`Cleared ${deletedCount} expired cached chapter(s).`);
    }
  } catch {
    // Top level fallback: skip cleanup if baseDir cannot be accessed
  }
}
