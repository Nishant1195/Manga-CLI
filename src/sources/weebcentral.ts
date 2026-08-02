import * as cheerio from "cheerio";
import {
  MangaSource,
  MangaSearchResult,
  ChapterSearchResult,
} from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const WeebCentralSource: MangaSource = {
  name: "weebcentral",

  async search(query: string): Promise<MangaSearchResult[]> {
    try {
      const url = `https://weebcentral.com/search/data?author=&text=${encodeURIComponent(
        query
      )}&sort=Best+Match&order=Ascending&official=Any&anime=Any&adult=Any&status=Any&type=Any`;

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const results: MangaSearchResult[] = [];
      const seenIds = new Set<string>();

      $("a[href*='/series/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        // Match series ID e.g. https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece
        const match = href.match(/\/series\/([A-Z0-9]+)/);
        if (match && match[1]) {
          const id = match[1];
          if (!seenIds.has(id)) {
            seenIds.add(id);

            // Find title text from inside the card or from image alt
            let title = $(el).find("img[alt$='cover']").attr("alt") || "";
            if (title.endsWith(" cover")) {
              title = title.replace(/\s+cover$/i, "");
            }
            if (!title) {
              title = $(el).text().trim();
            }
            // Clean up multi-line text if title contains whitespace
            title = title.replace(/\s+/g, " ").trim();

            if (title) {
              results.push({ id, title });
            }
          }
        }
      });

      return results;
    } catch (error) {
      console.error(`Failed to search manga on WeebCentral for query "${query}":`, error);
      throw error;
    }
  },

  async getChapters(mangaId: string): Promise<ChapterSearchResult[]> {
    try {
      const url = `https://weebcentral.com/series/${mangaId}/full-chapter-list`;

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const chapters: ChapterSearchResult[] = [];

      $("a[href*='/chapters/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const match = href.match(/\/chapters\/([A-Z0-9]+)/);
        if (match && match[1]) {
          const id = match[1];
          const rawText = $(el).find("span.grow span").first().text().trim() || $(el).text().trim();
          
          // Extract chapter number from text e.g. "Chapter 1189" -> "1189"
          const chMatch = rawText.match(/Chapter\s+([\d.]+)/i);
          const chapterNum = chMatch ? chMatch[1] : rawText;

          chapters.push({
            id,
            chapter: chapterNum,
            title: rawText,
          });
        }
      });

      // WeebCentral lists newest chapters first; reverse to ascending order
      return chapters.reverse();
    } catch (error) {
      console.error(`Failed to fetch chapters from WeebCentral for manga ID "${mangaId}":`, error);
      throw error;
    }
  },

  async getPages(chapterId: string): Promise<string[]> {
    try {
      const url = `https://weebcentral.com/chapters/${chapterId}/images?reading_style=long_strip`;

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const pageUrls: string[] = [];

      $("section#chapter-images img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && src.startsWith("http")) {
          pageUrls.push(src);
        }
      });

      return pageUrls;
    } catch (error) {
      console.error(`Failed to fetch page URLs from WeebCentral for chapter ID "${chapterId}":`, error);
      throw error;
    }
  },
};
