#!/usr/bin/env -S npx tsx
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { WeebCentralSource } from "./sources/weebcentral";
import { downloadPagesProgressive } from "./download";
import { viewChapterProgressive, viewChapter } from "./viewer";
import { selectFromList } from "./select";
import { cleanExpiredCache } from "./cache";

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

    let query = process.argv[2];

    if (!query || !query.trim()) {
      query = await askSearchTerm();
    }

    if (!query) {
      console.log("No search term provided. Exiting.");
      return;
    }

    const source = WeebCentralSource;

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

    console.log(`Fetching chapters for "${selectedManga.title}"...`);
    const chapters = await source.getChapters(selectedManga.id);

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

    let currentChapterIndex = chapters.findIndex(
      (c) => c.id === selectedChapter.id
    );
    if (currentChapterIndex === -1) {
      currentChapterIndex = 0;
    }

    // Main chapter reading loop for seamless next/prev navigation
    while (true) {
      const activeChapter = chapters[currentChapterIndex];
      console.log(
        `\nOpening Chapter ${activeChapter.chapter}${
          activeChapter.title ? " - " + activeChapter.title : ""
        }...`
      );

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
