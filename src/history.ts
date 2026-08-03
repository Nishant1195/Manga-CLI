import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface HistoryEntry {
  mangaId: string;
  mangaTitle: string;
  chapterId: string;
  chapterLabel: string;
  timestamp: number;
}

const HISTORY_FILE_PATH = path.join(
  os.homedir(),
  ".local/share/manga-cli/history.json"
);

export function loadHistory(): Record<string, HistoryEntry> {
  try {
    if (fs.existsSync(HISTORY_FILE_PATH)) {
      const data = fs.readFileSync(HISTORY_FILE_PATH, "utf8");
      return JSON.parse(data) || {};
    }
  } catch (err) {
    // If invalid JSON or read error, return empty history
  }
  return {};
}

export function saveHistoryEntry(
  mangaId: string,
  mangaTitle: string,
  chapterId: string,
  chapterLabel: string
): void {
  try {
    const history = loadHistory();
    history[mangaId] = {
      mangaId,
      mangaTitle,
      chapterId,
      chapterLabel,
      timestamp: Date.now(),
    };

    const dir = path.dirname(HISTORY_FILE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(history, null, 2), "utf8");
  } catch (err: any) {
    console.warn(`Warning: Could not save reading history: ${err?.message || String(err)}`);
  }
}

export function getMostRecentlyRead(): HistoryEntry | null {
  const history = loadHistory();
  const entries = Object.values(history);
  if (entries.length === 0) {
    return null;
  }
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries[0];
}

export function getHistoryEntry(mangaId: string): HistoryEntry | null {
  const history = loadHistory();
  return history[mangaId] || null;
}
