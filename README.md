# Manga-CLI

A lightweight, terminal-first manga and manhwa reader for Linux desktop environments.

`manga-cli` provides an ad-free, resource-efficient alternative to web browser reading by orchestrating search, interactive selection, and parallel chapter downloads via a TypeScript CLI, then handing off to a custom GTK4 standalone Python reader window.

---

## Why Manga-CLI?

Reading manga on web browsers often involves heavy ad scripts, intrusive pop-ups, slow page rendering, and high memory overhead from full browser engines. `manga-cli` was built to deliver a clean, distraction-free reading environment:

- **Resource Efficient**: Avoids running a full web browser engine (like Chromium or Electron), making it ideal for low-resource hardware or low-power laptops.
- **Zero Ads**: Scrapes image URLs directly, skipping all ad servers, trackers, and redirect loops.
- **Terminal Native**: Integrates seamlessly with terminal workflows via `fzf` fuzzy selection.
- **Fast Handoff**: Starts displaying content progressive-style as soon as ~50% of the chapter pages are fetched.

---

## Architecture Overview

The system intentionally decouples the CLI orchestrator from the graphical reader using a process-handoff pattern, similar in spirit to how `ani-cli` hands off video playback to `mpv`:

```
+------------------------------------------+
|            Node.js / TS CLI              |
|  - Search & Cheerio Scraping             |
|  - fzf Chapter Selection                 |
|  - Parallel Progressive Downloader       |
|  - JSON History & Config Management      |
+------------------------------------------+
                     |
                     | Spawns child process (python3 reader/reader.py)
                     v
+------------------------------------------+
|            Python GTK4 Reader            |
|  - Standalone Gtk.ApplicationWindow      |
|  - Continuous Folder Polling (1s timer)  |
|  - Aspect-Ratio Calculated Image Box     |
|  - Keybinding Event Controller           |
+------------------------------------------+
                     |
                     | File-based Signals (.chapter-nav-signal & .last-read-page)
                     v
+------------------------------------------+
|          Signal File Handoff             |
|  - Reads ".last-read-page" on close      |
|  - Reads ".chapter-nav-signal" (next/prev)|
|  - CLI loops to next/prev chapter cleanly|
+------------------------------------------+
```

### Project Structure

```text
manga-cli/
├── reader/
│   └── reader.py            # Standalone GTK4 Python reader application
├── src/
│   ├── index.ts             # CLI entry point, argument parsing & main execution loop
│   ├── cli/
│   │   ├── health.ts        # 10-point system diagnostic tool (--health / --doctor)
│   │   └── select.ts        # fzf selection interface wrapper
│   ├── core/
│   │   ├── cache.ts         # Automated 3-day chapter cache expiration sweeper
│   │   ├── cache.test.ts    # Cache sweeper unit tests
│   │   ├── config.ts        # Persistent JSON config management (~/.config/manga-cli/)
│   │   ├── config.test.ts  # Config management unit tests
│   │   ├── download.ts      # Parallel progressive page fetcher
│   │   ├── download.test.ts# Downloader threshold unit tests
│   │   ├── history.ts       # Reading history tracking (~/.local/share/manga-cli/)
│   │   └── viewer.ts        # Process orchestrator spawning reader/reader.py
│   └── sources/
│       ├── types.ts         # Common MangaSource interfaces
│       └── weebcentral.ts   # WeebCentral HTML scraper implementation
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

---

## Key Features

- **WeebCentral Scraper**: Scrapes series searches, chapter lists, and full-resolution page images.
- **Fuzzy Selection**: Integrated `fzf` prompt for fast manga and chapter filtering.
- **Parallel Progressive Downloader**: Fetches pages using configurable concurrency (default: 5) and opens the reader at 50% download completion while remaining pages fetch in the background.
- **Standalone GTK4 Reader**: Scrollable native window with dark mode, interactive zoom (`+`/`-`), horizontal panning (`Left`/`Right`), and seamless live-polling image appending.
- **In-Reader Navigation**: Press `]` for next chapter or `[` for previous chapter directly inside the reader without returning to the terminal menu.
- **Reading History & Resume**: Tracks the most recently read manga, chapter, and exact page number across sessions (`manga-cli --continue`).
- **Persistent Configuration**: Change settings via `manga-cli --setup <key> <value>` (concurrency, cache persistence, full download waiting).
- **Environment Diagnostics**: Built-in `manga-cli --health` (or `manga-cli --doctor`) command verifying Node version, system binaries, GTK4 bindings, script compilation, filesystem permissions, and live network scraping selectors.
- **Automated Cache Expiry**: Sweeps `/tmp/manga-cli/weebcentral/` on startup and purges chapter folders unmodified for > 3 days.

---

## Requirements

The diagnostic command (`manga-cli --health`) automatically validates all system requirements:

- **Node.js**: `v18.0.0` or higher (required for native `fetch`).
- **Python**: `python3` with GTK4 PyGObject bindings (`python-gobject` and `gtk4`).
- **System Utilities**: `fzf` on system `PATH`.
- **Operating System**: Linux desktop environments (X11 or Wayland).

---

## Installation

A one-line curl installer is planned. Currently, install manually by cloning the repository:

```bash
git clone https://github.com/your-username/manga-cli.git
cd manga-cli
npm install
```

To link `manga-cli` as a global command on your system:

```bash
npm link
```

---

## Usage Guide

### Basic Commands

```bash
# Search and read a manga
manga-cli "Solo Leveling"

# Resume reading the most recent manga at the last-read chapter & page
manga-cli --continue

# Run environment health diagnostic
manga-cli --health

# Configuration setup commands
manga-cli --setup show
manga-cli --setup concurrency 8
manga-cli --setup persistCache true
manga-cli --setup waitForFullDownload false
```

### In-Reader Keyboard Controls

| Key | Action |
| :--- | :--- |
| **`Mouse Scroll`** / **`Trackpad`** | Scroll vertically through chapter pages (native `Gtk.ScrolledWindow`) |
| **`+`** / **`=`** / **`KP_Add`** | Zoom in (+10% width, up to 3.0x max) |
| **`-`** / **`KP_Subtract`** | Zoom out (-10% width, down to 0.5x min) |
| **`Left` / `Right` Arrow** | Pan horizontally across zoomed images (+/- 80px) |
| **`]`** | Save position, close reader, and open **Next Chapter** |
| **`[`** | Save position, close reader, and open **Previous Chapter** |
| **`q`** | Save position and **Quit** to terminal |

---

## Interesting Technical Challenges & Solutions

### 1. GTK4 Image-Scaling & Container Sizing
- **The Problem**: Placing multiple `Gtk.Picture` widgets inside a vertical `Gtk.Box` within a `Gtk.ScrolledWindow` caused GTK's layout engine to collapse every image into a tiny 83px thumbnail strip.
- **Root Cause**: `Gtk.Picture` defaults to `can-shrink = True`. Inside a scroll container with infinite vertical room, GTK asked each picture for its minimum height. Because images could shrink, GTK compressed all 40+ pages into the visible viewport height without expanding scroll boundaries.
- **The Solution**: Setting `picture.set_can_shrink(False)` prevented height compression. To avoid pixel distortion, `reader.py` queries uncompressed image dimensions via `GdkPixbuf.Pixbuf.get_file_info()` before rendering and explicitly sets aspect-ratio calculated size requests (`picture.set_size_request(target_width, target_height)`).

### 2. Geometry Mismatch in Resume-Page Calculation
- **The Problem**: Saving the active page on exit and resuming via `--continue` resulted in the reader opening ~2 pages ahead of where the user stopped scrolling.
- **Root Cause**: GTK4 window allocations return `0px` for `self.get_width()` inside `__init__()` prior to `win.present()`. Initial picture heights were calculated using a fallback width of `900px`. However, once window presentation finished, the usable viewport allocated to `795px`. The 13% geometry mismatch (`900` vs `795`) accumulated a ~2 page error offset by page 15.
- **The Solution**: Updated `get_container_base_width()` to fallback to `795px` prior to presentation, matching the exact post-presentation viewport geometry and guaranteeing 100% mathematical alignment between save and resume steps.

### 3. Smooth Boundary UX for Chapter Navigation
- **The Problem**: Hitting `]` on the latest chapter or `[` on the first chapter could crash or abruptly kick the user out of the reading session.
- **The Solution**: Implemented boundary detection inside `src/index.ts`'s reading loop. Hitting `]` on the last chapter logs `"Already at the latest chapter."` and re-opens the reader loop on the same chapter without exiting, letting the user continue reading uninterrupted.

---

## Testing

The project uses [Vitest](https://vitest.dev/) for automated unit testing focused on pure business logic:

```bash
npm test
```

### Scope & Mocking Strategy:
- **`src/config.test.ts`**: Tests configuration loading, merging defaults, key validation, and input parsing. Uses `vi.mock("fs")` to keep tests isolated in RAM without modifying `~/.config/manga-cli/config.json`.
- **`src/cache.test.ts`**: Tests 3-day folder expiration math, retention of recent chapters, and `persistCache` flag bypass using mocked file timestamps.
- **`src/download.test.ts`**: Tests progressive threshold firing (50% callback) and `waitForFullDownload` 100% threshold enforcement using `vi.stubGlobal("fetch")`.
- *Note*: Live network scraping and GTK window rendering are deliberately excluded from unit tests to avoid brittle external dependencies; those layers are validated via `manga-cli --health` and manual end-to-end verification.

---

## Known Limitations

- **Single Source**: Currently relies solely on WeebCentral for search and image extraction. If WeebCentral alters its HTML layout or endpoints, `manga-cli --health` will flag selector mismatches until scraper rules are updated.
- **Approximate Resume Position**: Position tracking saves and restores the active manga + chapter + top edge of the active page file, not the exact sub-pixel vertical scroll offset within that page.
- **Resize Position Drift**: If a user resizes the GTK window while zoomed in, pictures dynamically recalculate target heights, which may shift the exact vertical scroll position slightly.
- **Scope**: Designed as a personal/portfolio CLI tool focused on Linux terminal workflows.

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
