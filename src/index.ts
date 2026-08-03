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
import { loadConfig, updateConfigValue } from "./config";

function printSetupHelp() {
  console.log("Usage:");
  console.log("  manga-cli --setup show              Show current configuration");
  console.log("  manga-cli --setup <key> <value>     Update configuration setting");
  console.log("");
  console.log("Valid Keys:");
  console.log("  concurrency <number>        Download concurrency limit (e.g. 5, 8, 10)");
  console.log("  persistCache <true|false>   Prevent automatic 3-day cache cleanup");
  console.log("  waitForFullDownload <true|false> Open reader only after 100% download");
}

async function handleSetup(): Promise<boolean> {
  const setupIndex = process.argv.indexOf("--setup");
  if (setupIndex === -1) {
    return false;
  }

  const subArg1 = process.argv[setupIndex + 1];
  const subArg2 = process.argv[setupIndex + 2];

  if (!subArg1 || subArg1 === "help") {
    printSetupHelp();
    return true;
  }

  if (subArg1 === "show") {
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
    return true;
  }

  if (subArg1 && subArg2) {
    try {
      const updatedConfig = updateConfigValue(subArg1, subArg2);
      const val = (updatedConfig as any)[subArg1];
      console.log(`Updated ${subArg1} to ${val}`);
    } catch (err: any) {
      console.error(`Error: ${err?.message || String(err)}`);
      printSetupHelp();
    }
    return true;
  }

  printSetupHelp();
  return true;
}

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
    if (await handleSetup()) {
      return;
    }

    const config = loadConfig();

    cleanExpiredCache("/tmp/manga-cli/weebcentral", 3, config.persistCache);

    const isContinueFlag = process.argv.includes("--continue");
    const source = WeebCentralSource;

    let mangaId: string;
    let mangaTitle: string;
    let chapters: any[] = [];
    let currentChapterIndex: number = 0;
    let resumeStartPage: string | undefined = undefined;

    if (isContinueFlag) {
      const recent = getMostRecentlyRead();
      if (!recent) {
        console.log("No reading history yet — search for a manga first.");
        return;
      }

      console.log(`Resuming "${recent.mangaTitle}" (${recent.chapterLabel})...`);
      mangaId = recent.mangaId;
      mangaTitle = recent.mangaTitle;
      resumeStartPage = recent.lastPageFile;

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

      const pageUrls = await source.getPages(activeChapter.id);

      if (!pageUrls || pageUrls.length === 0) {
        console.log("No page URLs found for this chapter.");
        break;
      }

      const destDir = `/tmp/manga-cli/weebcentral/${activeChapter.id}`;
      console.log(`Downloading ${pageUrls.length} pages...`);

      let viewPromise: Promise<void> | null = null;
      const startPage = resumeStartPage;
      resumeStartPage = undefined; // Reset after initial resume

      const downloadPromise = downloadPagesProgressive(
        pageUrls,
        destDir,
        () => {
          viewPromise = viewChapterProgressive(destDir, downloadPromise, startPage);
        },
        50,
        config.concurrency,
        config.waitForFullDownload
      );

      await downloadPromise;

      if (!viewPromise) {
        // If full cache hit or instant completion
        viewPromise = viewChapter(destDir, startPage);
      }

      await viewPromise;

      // Check for .last-read-page file written by reader.py on close
      const lastPageFile = path.join(destDir, ".last-read-page");
      let activeLastPage: string | undefined = undefined;

      if (fs.existsSync(lastPageFile)) {
        try {
          activeLastPage = fs.readFileSync(lastPageFile, "utf8").trim();
          fs.unlinkSync(lastPageFile);
        } catch {
          // Ignore read/unlink error
        }
      }

      // Record updated reading history including the active page
      saveHistoryEntry(mangaId, mangaTitle, activeChapter.id, chapterLabel, activeLastPage);

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
