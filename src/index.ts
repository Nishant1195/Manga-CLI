#!/usr/bin/env -S npx tsx
import * as readline from "readline";
import { WeebCentralSource } from "./sources/weebcentral";
import { downloadPages } from "./download";
import { viewChapter } from "./viewer";
import { selectFromList } from "./select";

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

    const destDir = `/tmp/manga-cli/${selectedChapter.id}`;
    console.log(`Downloading ${pageUrls.length} pages...`);

    await downloadPages(pageUrls, destDir);

    await viewChapter(destDir);
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error(`Error: ${errorMsg}`);
  }
}

main();
