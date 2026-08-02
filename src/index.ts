#!/usr/bin/env -S npx tsx
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

    console.log(`Fetching page URLs for Chapter ${selectedChapter.chapter}...`);
    const pageUrls = await source.getPages(selectedChapter.id);

    if (!pageUrls || pageUrls.length === 0) {
      console.log("No page URLs found for this chapter.");
      return;
    }

    const destDir = `/tmp/manga-cli/weebcentral/${selectedChapter.id}`;
    console.log(`Downloading ${pageUrls.length} pages...`);

    let viewPromise: Promise<void> | null = null;

    const downloadPromise = downloadPagesProgressive(
      pageUrls,
      destDir,
      () => {
        console.log(`[DEBUG] index.ts onThreshold callback triggered! Launching viewChapterProgressive...`);
        viewPromise = viewChapterProgressive(destDir, downloadPromise);
      },
      50
    );

    const downloadedFiles = await downloadPromise;

    if (!viewPromise) {
      // If full cache hit or threshold did not fire separately before completion
      console.log(`[DEBUG] Cache hit or instant completion. Launching standard viewChapter...`);
      viewPromise = viewChapter(destDir);
    }

    await viewPromise;
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error(`Error: ${errorMsg}`);
  }
}

main();
