// HentaiDB — custom-source-v1 Node bundle for hentaidb.xyz.
// Data-only extension: the app owns all UI; this bundle serves JSON.
// Exposes two verticals, dispatched by sourceId:
//   • "hentaidb"        → anime (kind=watch), fed by the /cat video catalog.
//   • "hentaidb-comics" → comics (kind=read),  fed by /api/comics.
// See extension/capabilities/custom-source.md.

import {
  getCatalog,
  homeSections,
  searchSeries,
  videoFilterSchema,
  seriesInfo,
  episodeSources,
  resolveEpisodeId,
  type SearchFilters,
  type CustomMediaCard,
  type SourceResult,
  type InfoResult,
} from './client';
import {
  comicsHome,
  comicsSearch,
  comicInfo,
  comicRead,
  type ComicInfoResult,
  type ComicReadResult,
} from './comics';

type Filters = Record<string, string | string[] | undefined> & { tags?: string[] };

const COMICS_ID = 'hentaidb-comics';
const isComics = (sourceId: string) => sourceId === COMICS_ID;

export class HentaiDBBundle {
  async customHome(sourceId: string) {
    if (isComics(sourceId)) return comicsHome();
    const [sections, cat] = await Promise.all([homeSections(), getCatalog()]);
    return { sections, filters: videoFilterSchema(cat) };
  }

  async customSearch(
    sourceId: string,
    query: string,
    page = 1,
    filters?: Filters,
  ): Promise<{ results: CustomMediaCard[]; hasNextPage: boolean }> {
    const p = Number(page) || 1;
    if (isComics(sourceId)) {
      return comicsSearch(query, p, { tags: filters?.tags });
    }
    return searchSeries(query, p, filters as SearchFilters | undefined);
  }

  async customInfo(sourceId: string, id: string): Promise<InfoResult | ComicInfoResult> {
    return isComics(sourceId) ? comicInfo(id) : seriesInfo(id);
  }

  async customWatch(
    _sourceId: string,
    id: string,
    episodeId?: string,
  ): Promise<{ sources: SourceResult[] }> {
    const watchId = resolveEpisodeId(id, episodeId);
    return { sources: await episodeSources(watchId) };
  }

  async customRead(
    _sourceId: string,
    id: string,
    chapterId?: string,
  ): Promise<ComicReadResult> {
    return comicRead(chapterId || id);
  }

  // Optional liveness probe (manifest apiServer.healthPath).
  async health(): Promise<{ ok: true }> {
    return { ok: true };
  }
}

export default HentaiDBBundle;
