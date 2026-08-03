#!/usr/bin/env -S npx tsx
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { WeebCentralSource } from "./sources/weebcentral";
import { downloadPagesProgressive } from "./download";
import { viewChapterProgressive, viewChapter } from "./viewer";
import { selectFromList } from "./select";
import { cleanExpiredCache } from "./cache";
import { saveHistoryEntry, getMostRecentlyRead } from "./history";

async function askSearchTerm(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve) => {
    rl.question("Enter manga search term: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  try {
    cleanExpiredCache();

    const isContinueFlag = process.argv.includes("--continue");
    const source = WeebCentralSource;

    let mangaId: string;
    let mangaTitle: string;
    let chapters: any[] = [];
    let currentChapterIndex: number = 0;

    if (isContinueFlag) {
      const recent = getMostRecentlyRead();
      if (!recent) {
        console.log("No reading history yet — search for a manga first.");
        return;
      }

      console.log(`Resuming "${recent.mangaTitle}" (${recent.chapterLabel})...`);
      mangaId = recent.mangaId;
      mangaTitle = recent.mangaTitle;

      console.log(`Fetching chapters for "${mangaTitle}"...`);
      chapters = await source.getChapters(mangaId);

      if (!chapters || chapters.length === 0) {
        console.log("No chapters available for this manga.");
        return;
      }

      currentChapterIndex = chapters.findIndex((c) => c.id === recent.chapterId);
      if (currentChapterIndex === -1) {
        currentChapterIndex = 0;
      }
    } else {
      let query = process.argv.filter((arg) => !arg.startsWith("--"))[2];

      if (!query || !query.trim()) {
        query = await askSearchTerm();
      }

      if (!query) {
        console.log("No search term provided. Exiting.");
        return;
      }

      console.log(`Searching for "${query}"...`);
      const mangaResults = await source.search(query);

      if (!mangaResults || mangaResults.length === 0) {
        console.log(`No manga found matching "${query}".`);
        return;
      }

      const selectedManga = await selectFromList(
        mangaResults.map((m) => ({ label: m.title, value: m }))
      );

      if (!selectedManga) {
        console.log("No selection made, exiting.");
        return;
      }

      mangaId = selectedManga.id;
      mangaTitle = selectedManga.title;

      console.log(`Fetching chapters for "${mangaTitle}"...`);
      chapters = await source.getChapters(mangaId);

      if (!chapters || chapters.length === 0) {
        console.log("No chapters available for this manga.");
        return;
      }

      const selectedChapter = await selectFromList(
        chapters.map((c) => ({
          label: `Chapter ${c.chapter}${c.title ? " - " + c.title : ""}`,
          value: c,
        }))
      );

      if (!selectedChapter) {
        console.log("No selection made, exiting.");
        return;
      }

      currentChapterIndex = chapters.findIndex((c) => c.id === selectedChapter.id);
      if (currentChapterIndex === -1) {
        currentChapterIndex = 0;
      }
    }

    // Main chapter reading loop for seamless next/prev navigation
    while (true) {
      const activeChapter = chapters[currentChapterIndex];
      const chapterLabel = `Chapter ${activeChapter.chapter}${
        activeChapter.title ? " - " + activeChapter.title : ""
      }`;

      console.log(`\nOpening ${chapterLabel}...`);

      // Update reading history on every chapter open
      saveHistoryEntry(mangaId, mangaTitle, activeChapter.id, chapterLabel);

      const pageUrls = await source.getPages(activeChapter.id);

      if (!pageUrls || pageUrls.length === 0) {
        console.log("No page URLs found for this chapter.");
        break;
      }

      const destDir = `/tmp/manga-cli/weebcentral/${activeChapter.id}`;
      console.log(`Downloading ${pageUrls.length} pages...`);

      let viewPromise: Promise<void> | null = null;

      const downloadPromise = downloadPagesProgressive(
        pageUrls,
        destDir,
        () => {
          viewPromise = viewChapterProgressive(destDir, downloadPromise);
        },
        50
      );

      await downloadPromise;

      if (!viewPromise) {
        // If full cache hit or instant completion
        viewPromise = viewChapter(destDir);
      }

      await viewPromise;

      // Check for navigation signal file written by reader.py
      const signalFile = path.join(destDir, ".chapter-nav-signal");
      let navSignal: string | null = null;

      if (fs.existsSync(signalFile)) {
        try {
          navSignal = fs.readFileSync(signalFile, "utf8").trim();
          fs.unlinkSync(signalFile);
        } catch {
          // Ignore read/unlink error
        }
      }

      if (navSignal === "next") {
        if (currentChapterIndex < chapters.length - 1) {
          currentChapterIndex++;
        } else {
          console.log("Already at the latest chapter.");
        }
      } else if (navSignal === "prev") {
        if (currentChapterIndex > 0) {
          currentChapterIndex--;
        } else {
          console.log("Already at the first chapter.");
        }
      } else {
        // User quit normally via 'q' or window close button
        console.log("Exiting reader.");
        break;
      }
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error(`Error: ${errorMsg}`);
  }
}

main();
