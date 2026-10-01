# HentaiDB — Tatakai Custom Source

A data-only `custom-source-v1` extension for **https://hentaidb.xyz/**. It adds
two isolated verticals to Tatakai — a **watch** source and a **comics/read**
source — with home sections, full-catalog search, tag + group filters, series
info and multi-server video resolution. It never touches the built-in anime
watchlist or manga readlist.

## What it does

| Method | Vertical | Behaviour |
| --- | --- | --- |
| `customHome` | watch / read | Popular, Recently Added, 4K, Uncensored, Movies, plus top tag rows. Ships a filter schema (tags + grouped dropdowns) the custom page renders. |
| `customSearch` | watch / read | Scored match over title / keywords / studio / tags across the whole catalog, paginated, with tag + group filters. |
| `customInfo` | watch / read | Type, year, studio, status, episode/chapter count, quality, censorship, subtitle/dub flags and tag list, plus synopsis; one entry per episode/chapter. |
| `customWatch` | watch | Every mirror/server for the episode (sub and dub), grouped by server and ordered highest-quality-first, with embedded subtitle tracks. |
| `customRead` | read | Ordered page image URLs for a comic/doujin chapter. |

The `hentaidb` source is `kind: "watch"`; `hentaidb-comics` is `kind: "read"`.
Multiple servers per episode are returned so the watch page can render a server
switcher and fail over between mirrors.

## How it works

hentaidb.xyz has **no server-side search API** — the entire catalog ships to the
browser, and each episode's streams are embedded in its watch page.

- `src/client.ts` discovers the catalog, fetches and decodes the compact rows,
  caches the result, and runs search/filtering in-process.
- Episode resolution fetches the watch page and maps `src`/`dub` entries to
  `SourceResult[]`, tagged with their server so the host can group them.
- `src/comics.ts` serves the comics/read vertical from the site's comics
  endpoints and page data.

All hentaidb media (MP4/WebP/VTT) is public and header-free, so sources carry
`headers: {}` — the host serves them directly without the local proxy.

## Build

```bash
npm install
npm run build
```

Produces `dist/bundle.js` and `dist/hentaidb.kai` (sideloadable). The manifest
is marked `sideloaded: true` so its `apiServer` namespace mounts and the
extension runs with full privileges on any Tatakai build.

## Install (sideload)

Download `hentaidb.kai` from the [latest release](https://github.com/Snozxyx/HentaiDB/releases)
and sideload it from Tatakai → Extensions → Install from file. This signature-free
build installs on the public app.

## Signing (optional)

```bash
npm run sign
```

Builds, then signs `bundle.js` with Ed25519 and emits:

- `dist/hentaidb-signed.kai` — manifest carries a base64 `signature`; the
  `sideloaded` flag is dropped so the loader takes the **verified** trust path.
- `dist/public-key.pem` — the SPKI public key to verify against.
- `keys/private.pem` — the private key (gitignored; keep it to re-sign future
  releases, or supply your own via `TATAKAI_EXT_PRIVATE_KEY`).

A signed `.kai` only installs on a Tatakai build launched with the matching
public key, because the stock app ships a placeholder key:

```bash
TATAKAI_EXT_PUBLIC_KEY="$(cat dist/public-key.pem)" <launch Tatakai>
```

Without that env var the signature fails to verify and install is rejected —
use the signature-free `hentaidb.kai` for the public app.

## Permissions

`network:domain:hentaidb.xyz` — the only host it contacts.
