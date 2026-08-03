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

export async function downloadPagesProgressive(
  urls: string[],
  destDir: string,
  onThreshold?: () => void,
  thresholdPercent: number = 50,
  concurrency: number = 5,
  waitForFullDownload: boolean = false,
  headers: Record<string, string> = DEFAULT_HEADERS
): Promise<string[]> {
  if (!urls || urls.length === 0) {
    return [];
  }

  fs.mkdirSync(destDir, { recursive: true });

  const effectiveThresholdPercent = waitForFullDownload ? 100 : thresholdPercent;

  const total = urls.length;
  const padLength = Math.max(3, String(total).length);
  const thresholdCount = Math.ceil((total * effectiveThresholdPercent) / 100);

  const expectedPaths: string[] = urls.map((url, idx) => {
    const parsedUrl = new URL(url);
    let ext = path.extname(parsedUrl.pathname);
    if (!ext) {
      ext = ".jpg";
    }
    const filename = `${String(idx + 1).padStart(padLength, "0")}${ext}`;
    return path.join(destDir, filename);
  });

  const allCached = expectedPaths.every((filePath) => fs.existsSync(filePath));
  if (allCached) {
    console.log(`Using cached pages (${total}/${total}).`);
    return expectedPaths;
  }

  const downloadedPaths: string[] = new Array(total);
  const failedUrls: { index: number; url: string; error: string }[] = [];
  let completedCount = 0;
  let totalBytesDownloaded = 0;
  let thresholdFired = false;
  const activeConcurrency = Math.max(1, concurrency);
  const overallStartTime = Date.now();

  const downloadSingle = async (index: number, url: string) => {
    const targetPath = expectedPaths[index];

    if (fs.existsSync(targetPath)) {
      downloadedPaths[index] = targetPath;
      completedCount++;
      checkThreshold();
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
      checkThreshold();
      process.stdout.write(
        `\rDownloading pages: ${completedCount}/${total}           `
      );
    }
  };

  const checkThreshold = () => {
    if (
      !thresholdFired &&
      completedCount >= thresholdCount &&
      onThreshold
    ) {
      thresholdFired = true;
      onThreshold();
    }
  };

  for (let i = 0; i < urls.length; i += activeConcurrency) {
    const batch = urls
      .slice(i, i + activeConcurrency)
      .map((url, idx) => downloadSingle(i + idx, url));
    await Promise.all(batch);
  }

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

export async function downloadPages(
  urls: string[],
  destDir: string,
  concurrency: number = 5,
  headers: Record<string, string> = DEFAULT_HEADERS
): Promise<string[]> {
  return downloadPagesProgressive(
    urls,
    destDir,
    undefined,
    100,
    concurrency,
    true,
    headers
  );
}
