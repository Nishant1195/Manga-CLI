import * as fs from "fs";
import * as path from "path";

function formatSpeed(bytes: number, ms: number): string {
  if (ms <= 0) return "0 KB/s";
  const bytesPerSec = (bytes / ms) * 1000;
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${Math.round(bytesPerSec / 1024)} KB/s`;
}

const DEFAULT_HEADERS = {
  Referer: "https://weebcentral.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
};

export async function downloadPages(
  urls: string[],
  destDir: string,
  headers: Record<string, string> = DEFAULT_HEADERS
): Promise<string[]> {
  if (!urls || urls.length === 0) {
    return [];
  }

  // Ensure output directory exists
  fs.mkdirSync(destDir, { recursive: true });

  const total = urls.length;
  const padLength = Math.max(3, String(total).length);

  // Compute expected filenames & extensions
  const expectedPaths: string[] = urls.map((url, idx) => {
    const parsedUrl = new URL(url);
    let ext = path.extname(parsedUrl.pathname);
    if (!ext) {
      ext = ".jpg";
    }
    const filename = `${String(idx + 1).padStart(padLength, "0")}${ext}`;
    return path.join(destDir, filename);
  });

  // Basic caching check: if all expected files already exist, return them directly
  const allCached = expectedPaths.every((filePath) => fs.existsSync(filePath));
  if (allCached) {
    console.log(`Using cached pages (${total}/${total}).`);
    return expectedPaths;
  }

  const downloadedPaths: string[] = new Array(total);
  const failedUrls: { index: number; url: string; error: string }[] = [];
  let completedCount = 0;
  let totalBytesDownloaded = 0;
  const CONCURRENCY = 20;
  const overallStartTime = Date.now();

  const downloadSingle = async (index: number, url: string) => {
    const targetPath = expectedPaths[index];

    if (fs.existsSync(targetPath)) {
      downloadedPaths[index] = targetPath;
      completedCount++;
      process.stdout.write(
        `\rDownloading pages: ${completedCount}/${total}           `
      );
      return;
    }

    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      totalBytesDownloaded += arrayBuffer.byteLength;

      fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
      downloadedPaths[index] = targetPath;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      failedUrls.push({ index: index + 1, url, error: errorMsg });
    } finally {
      completedCount++;
      process.stdout.write(
        `\rDownloading pages: ${completedCount}/${total}           `
      );
    }
  };

  // Process in concurrent batches of CONCURRENCY (5)
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls
      .slice(i, i + CONCURRENCY)
      .map((url, idx) => downloadSingle(i + idx, url));
    await Promise.all(batch);
  }

  // End carriage return line
  process.stdout.write("\n");

  const totalElapsedMs = Date.now() - overallStartTime;
  const avgSpeedStr = formatSpeed(totalBytesDownloaded, totalElapsedMs);
  const validDownloaded = downloadedPaths.filter(Boolean);

  if (failedUrls.length > 0) {
    console.warn(
      `Downloaded ${validDownloaded.length}/${total} pages (${failedUrls.length} failed) (${avgSpeedStr} avg).`
    );
  } else {
    console.log(
      `Downloaded ${validDownloaded.length}/${total} pages (${avgSpeedStr} avg).`
    );
  }

  return validDownloaded;
}
