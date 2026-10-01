// hentaidb.xyz comics (doujin) client — the extension's second vertical.
// Comics are a flat catalog served by /api/comics; each comic is a single
// book read via /comics/<slug>/read (window.CXR.pages). All /cm/ images are
// public and header-free (resizable via /i/<w>/cm/...), so no proxy is needed.

import {
  BASE,
  getText,
  sliceObject,
  decodeEntities,
  cleanTitle,
  abs,
  imageUrl,
  type CustomMediaCard,
} from './client';

const PAGE = 60; // matches the site's own data-chunk
const TAGS_TTL_MS = 6 * 60 * 60 * 1000;

interface ComicRow {
  k: string; s: string; t: string; a: string; n: number; y: number; c: string;
}
interface ComicsResponse { total: number; o: number; rows: ComicRow[] }

export interface ComicFilterSchema {
  tags?: string[];
  groups?: { key: string; label: string; options: { value: string; label: string }[] }[];
}

function comicCard(r: ComicRow): CustomMediaCard {
  const bits = [r.a, r.y ? String(r.y) : ''].filter(Boolean);
  return {
    id: r.s,
    title: cleanTitle(r.t),
    image: imageUrl(r.c, 360),
    subtitle: bits.join(' · ') || undefined,
    badge: r.n ? `${r.n}p` : undefined,
  };
}

async function fetchComics(params: Record<string, string | number>): Promise<ComicsResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null) qs.set(k, String(v));
  }
  const j = JSON.parse(await getText(`${BASE}/api/comics?${qs.toString()}`));
  return { total: j.total || 0, o: j.o || 0, rows: Array.isArray(j.rows) ? j.rows : [] };
}
// __REST__

// Comic tag vocabulary — scraped once from the /comics page's chip list
// (data-n="<tag>") and cached. The /api/comics `tag` param matches these.
let tagCache: { at: number; tags: string[] } | null = null;
async function comicTags(): Promise<string[]> {
  if (tagCache && Date.now() - tagCache.at < TAGS_TTL_MS) return tagCache.tags;
  try {
    const h = await getText(`${BASE}/comics`);
    const tags = [...new Set([...h.matchAll(/data-n="([^"]+)"/g)].map((m) => decodeEntities(m[1])))];
    tagCache = { at: Date.now(), tags };
    return tags;
  } catch {
    return tagCache?.tags || [];
  }
}

export async function comicsHome(): Promise<{
  sections: { title: string; items: CustomMediaCard[] }[];
  filters?: ComicFilterSchema;
}> {
  const tags = await comicTags();
  const featured = tags.slice(0, 4);
  const [latest, ...rows] = await Promise.all([
    fetchComics({ o: 0, n: PAGE }),
    ...featured.map((t) => fetchComics({ o: 0, n: 24, tag: t })),
  ]);

  const sections: { title: string; items: CustomMediaCard[] }[] = [];
  const push = (title: string, list: ComicRow[]) => {
    const items = list.map(comicCard);
    if (items.length) sections.push({ title, items });
  };
  push('Latest Comics', latest.rows.slice(0, 30));
  featured.forEach((t, i) => push(t.replace(/\b\w/g, (c) => c.toUpperCase()), rows[i]?.rows || []));

  return { sections, filters: { tags: tags.slice(0, 60) } };
}

export async function comicsSearch(
  query: string,
  page = 1,
  filters?: { tags?: string[] },
): Promise<{ results: CustomMediaCard[]; hasNextPage: boolean }> {
  const q = String(query || '').trim();
  const tag = filters?.tags && filters.tags.length ? filters.tags[0] : '';
  const o = (Math.max(1, page) - 1) * PAGE;
  const res = await fetchComics({ o, n: PAGE, q, tag });
  return { results: res.rows.map(comicCard), hasNextPage: res.o + res.rows.length < res.total };
}
// __REST2__

export interface ComicInfoResult {
  id: string;
  title: string;
  image?: string;
  description?: string;
  meta?: Record<string, string>;
  entries: { id: string; label: string; number?: number }[];
}

// Info is derived from the comic's JSON-LD Book payload (window.HSVP) on the
// /comics/<slug> page, enriched with the og:description blurb.
export async function comicInfo(slug: string): Promise<ComicInfoResult> {
  let html = '';
  try {
    html = await getText(`${BASE}/comics/${encodeURIComponent(slug)}`);
  } catch {
    return { id: slug, title: cleanTitle(slug.replace(/-[0-9a-f]{6,}$/, '').replace(/[-~]/g, ' ')), entries: [] };
  }

  let hsvp: Record<string, unknown> = {};
  try {
    hsvp = JSON.parse(sliceObject(html, html.indexOf('window.HSVP')));
  } catch {
    /* fall back to bare metadata below */
  }

  const authorRaw = hsvp.author;
  const authors = Array.isArray(authorRaw)
    ? authorRaw.map((a) => (a && typeof a === 'object' ? (a as { name?: string }).name : String(a))).filter(Boolean)
    : [];
  const genre = Array.isArray(hsvp.genre) ? (hsvp.genre as unknown[]).map(String).filter(Boolean) : [];
  const pages = Number(hsvp.numberOfPages) || 0;

  const meta: Record<string, string> = {};
  if (authors.length) meta['Author'] = authors.join(', ');
  if (hsvp.datePublished) meta['Year'] = String(hsvp.datePublished);
  if (pages) meta['Pages'] = String(pages);
  if (hsvp.inLanguage) meta['Language'] = String(hsvp.inLanguage).toUpperCase();
  if (genre.length) meta['Tags'] = genre.join(', ');

  const og = html.match(/<meta property="og:description" content="([^"]*)"/i);
  const description = og ? decodeEntities(og[1]) : '';
  const title = cleanTitle(
    (hsvp.name as string) || slug.replace(/-[0-9a-f]{6,}$/, '').replace(/[-~]/g, ' '),
  );
  const image = hsvp.image ? abs(String(hsvp.image)) : undefined;

  return {
    id: slug,
    title,
    image,
    description,
    meta,
    entries: [{ id: slug, label: pages ? `Read · ${pages} pages` : 'Read', number: 1 }],
  };
}

export interface ComicReadResult {
  pages: { pageNumber: number; imageUrl: string; headers?: Record<string, string> }[];
}

// Reader pages come from window.CXR.pages on /comics/<slug>/read — ordered
// /cm/ image paths. Public images load directly in <img>, so no headers.
export async function comicRead(slug: string): Promise<ComicReadResult> {
  const html = await getText(`${BASE}/comics/${encodeURIComponent(slug)}/read`);
  let cxr: { pages?: unknown } = {};
  try {
    cxr = JSON.parse(sliceObject(html, html.indexOf('window.CXR')));
  } catch {
    return { pages: [] };
  }
  const list = Array.isArray(cxr.pages) ? (cxr.pages as string[]) : [];
  return { pages: list.map((p, i) => ({ pageNumber: i + 1, imageUrl: abs(p) })) };
}
