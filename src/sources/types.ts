export interface MangaSearchResult {
  id: string;
  title: string;
}

export interface ChapterSearchResult {
  id: string;
  chapter: string;
  title: string;
}

export interface MangaSource {
  name: string;
  search(query: string): Promise<MangaSearchResult[]>;
  getChapters(mangaId: string): Promise<ChapterSearchResult[]>;
  getPages(chapterId: string): Promise<string[]>;
}
