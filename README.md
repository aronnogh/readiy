# Read Mode — a reading companion for Chrome

Read Mode takes a page you are trying to read and turns it into something you can actually
read: a new tab with a dark surface, large serif type, one comfortable column, and nothing
else — no navigation, no sidebars, no cookie banners, no autoplay, no ads.

It works two ways, both from the toolbar popup:

- **Open selection** — read only the part you highlighted.
- **Open whole page** — read the entire page, with its images, tables, code and figures
  intact. Nothing is dropped.

Built as a Manifest V3 extension with no build step: plain HTML, CSS and JavaScript.

---

## Contents

1. [What it does](#what-it-does)
2. [Install](#install)
3. [Using Read Mode](#using-read-mode)
4. [Inside the reading tab](#inside-the-reading-tab)
5. [How pages are captured](#how-pages-are-captured)
6. [File formats](#file-formats)
7. [Design system](#design-system)
8. [Privacy and permissions](#privacy-and-permissions)
9. [Troubleshooting](#troubleshooting)
10. [Project layout](#project-layout)
11. [Technical notes](#technical-notes)
12. [Limitations](#limitations)

---

## What it does

| Requirement | How Read Mode meets it |
| --- | --- |
| Read a selection in a new tab, conveniently | Highlight text → popup → **Open selection**. Only the highlighted portion opens, keeping bold, italics, links and inline images. |
| An option to open the whole page in a new tab without missing content | **Open whole page** captures the full document body — text, headings, lists, tables, images, figures, code, video, canvas charts — and renders it as a reading copy. Unrenderable file types open in Chrome's own viewer instead. |
| Big, dark, serif reading UI | 21px serif body type (adjustable 17–32px), 1.72 line height, `#141218` dark surface, serif headings at 32px+. |
| Material 3 / Material You extension UI | Baseline M3 dark tokens, 26px-radius filled and tonal buttons, 44px round icon buttons, pill-shaped chips, state layers and M3 elevation — big, clean and minimal. |

**Good for:** long articles, documentation, essay sites, newsletters, forum threads, PDF-free
web reading, reading in the evening, and reading with tired eyes.

---

## Install

Read Mode is loaded as an unpacked extension (it is not on the Chrome Web Store).

1. Open `chrome://extensions` in Chrome, Edge, Brave or another Chromium browser.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this project folder — the one containing `manifest.json`.
5. Pin **Read Mode** to the toolbar (puzzle-piece icon → pin) so the button is always visible.

Requires Chrome 116 or newer (for `chrome.storage.session` and current `chrome.scripting`
behaviour).

To update after editing files: press the reload arrow on the extension's card in
`chrome://extensions`. Already-open reading tabs keep working; only new captures use the new code.

---

## Using Read Mode

### Read a selection

1. Highlight the text you want on any web page.
2. Click the **Read Mode** toolbar button.
3. Choose **Open selection**.

The selected fragment opens in a new tab, formatted as prose. If you highlight across several
paragraphs, headings and list items inside the selection come along; so do inline emphasis,
links and images.

If nothing is selected, the popup tells you so — "Select some text first, then open Read Mode." —
and does nothing else.

Selections inside iframes also work: the extractor runs in every frame of the tab and returns the
first frame that actually has a selection.

### Read a whole page

1. Open the page you want to read.
2. Click the **Read Mode** toolbar button.
3. Choose **Open whole page**.

You get the entire readable document, in order, with page chrome removed (see
[How pages are captured](#how-pages-are-captured)).

### When a page cannot be read

- **Browser-internal pages** (`chrome://`, `edge://`, `about:`, extension pages, the Web Store's
  protected pages, view-source) cannot be scripted by any extension. The popup says
  "Browser pages can't be read. Try a normal web page."
- **PDFs, office documents, archives, ebooks, audio and video** are not forced through the reader.
  **Open whole page** opens them in a new tab using Chrome's native viewer, so you get the real
  file rather than a degraded copy.
- **If extraction fails for any reason**, Read Mode opens the original URL in a new tab instead.
  The failure mode is always "you still get the page", never "you get nothing".

---

## Inside the reading tab

The reading tab is where the extension earns its name.

### The app bar

A sticky, frosted bar at the top holds everything:

| Control | Effect |
| --- | --- |
| **A−** | Smaller text: 17 → 32px in seven steps (17, 19, 21, 23, 26, 29, 32). |
| **A+** | Larger text, same steps. |
| **Wide / Narrow** | Switches the column between a comfortable ~68-character measure and a roomy 88-character measure. The label shows what you will get, and the button stays pressed while wide. |
| **Original** | Opens the source page in a new tab (hidden for non-web sources). |

Text size and width are saved in `chrome.storage.local`, so every future reading tab opens at
your preferred size.

### The document

- **Meta line** — a badge saying **Selection** or **Whole page**, plus the site name and an
  estimated length ("1,240 words · 5 min", at ~230 words per minute).
- **Title** — large serif title. If the captured content already starts with an identical
  heading, the duplicate is dropped so the title is not printed twice.
- **Body** — the content itself, at your chosen size, with generous spacing, visible link
  underlines in lavender, quoted passages set off with a rule, tables that scroll horizontally
  instead of breaking the layout, and images that never exceed the column width.
- **Plain-text mode** — a page that is one big `<pre>` block (how Chrome renders `.txt` and plain
  `.md` files) is detected by line length and punctuation density and re-set as wrapped serif
  prose instead of monospace code.
- **Footer** — "Open the original page" link back to the source.

### Empty and expired states

Reading copies live in `chrome.storage.session`, which Chrome clears when the browser closes. If
you open an old reading tab after restarting the browser (or reload one whose copy has been
evicted), you get a calm explanation — "This reading copy expired" — and instructions to capture
the page again, rather than a broken page or a blank screen.

Links inside a reading copy open in a new tab with `rel="noreferrer noopener"`, so following a
reference never navigates your reading tab away. In-page `#anchor` links are stripped: they point
at the original page's scroll positions, which no longer exist in the copy.

---

## How pages are captured

Extraction is deliberately conservative about what it *keeps* and aggressive about what it
*strips*.

### Kept

The whole `document.body`, including:

- headings, paragraphs, lists, blockquotes, tables, `<figure>`/`<figcaption>`, `<details>`,
  `<pre>` and `<code>`
- `<img>` with `src`, `alt`, `width`, `height`, `title`
- `<video>`/`<audio>`/`<source>`/`<track>` with `controls` and `poster`
- inline `<svg>` graphics
- `<button>` and `<form>` text labels — only `input`, `select` and `textarea` are dropped, so
  wording in genuine controls is lost but no rendered label is
- canvas charts, captured as PNG images (see below)

### Removed

- **Invisible nodes.** Every element is checked against its own *computed* style: if the browser
  reports `display: none` or `visibility: hidden`, the node and its subtree are dropped. This is
  what removes cookie bars, modals, closed menus and hidden mobile duplicates. The walk runs over
  the live tree and the clone in lockstep, backwards through child lists to keep indexes aligned.
- **Executable nodes.** `<script>`, `<noscript>`, `<style>`, `<link>`, `<meta>`, `<base>`,
  `<iframe>`, `<object>`, `<embed>`, `<template>`, `<svg>`-embedded scripts and similar.
- **All presentation attributes.** `class`, `style`, `id`, `data-*`, `role`, `aria-*`, event
  handlers, `contenteditable`, and every other attribute not explicitly allowed. This is the step
  that stops the source site's CSS from fighting the reader's typography — no 9px gray text, no
  dark-on-dark blocks, no sticky junk.

### Rewritten

- **URLs are made absolute** against the document base, so images and links still resolve from
  `chrome-extension://` origin.
- **Lazy images are resolved.** If `src` is missing or is a 1×1 placeholder GIF/PNG, the best
  candidate among `data-src`, `data-original`, `data-lazy-src`, `data-actualsrc` and
  `data-orig-file` is promoted to `src`. Images whose source cannot be resolved at all are
  dropped rather than left broken.
- **Canvases become images.** Chart and graph libraries draw into `<canvas>`; those pixels are
  exported to a PNG data URL and replaced with an `<img>`, so charts survive the copy. Canvases
  above 6 million pixels are skipped (they would blow the storage quota) and removed.
- **Anchor links** are neutralised (see above).

### Second pass in the reader

Because the reader inserts HTML that came from an arbitrary page, it hardens the fragment again
before rendering: any `on*` handler, `javascript:` or `data:text/html` URL, and `srcdoc` is
removed, and `script`/`style`/`iframe`/`object`/`embed`/`link`/`meta`/`base`/`input`/`select`/`textarea`
elements are deleted (their surrounding text is kept). Manifest V3's default
`script-src 'self'` policy is a third layer: inline scripts in injected content cannot execute
even if one slipped through.

Read Mode never modifies the page you are reading. It injects a function, reads the DOM, and
returns data.

---

## File formats

**Open whole page** handles these two ways.

**Rendered as a reading copy**

| Format | Behaviour |
| --- | --- |
| HTML pages | Full reading copy. |
| `.txt`, `.md`, `.log` served as text | Chrome wraps them in one `<pre>`; Read Mode re-sets prose as serif text, and leaves genuine code/preformatted content in monospace. |
| Pages with images, figures, tables, video, canvas charts | Preserved as described above. |
| Pages with lazy-loaded images | Resolved to real image URLs. |

**Opened directly in a new tab (Chrome's own viewer)**

`pdf`, `doc`/`docx`, `xls`/`xlsx`, `ppt`/`pptx`, `odt`/`ods`/`odp`, `epub`, `rtf`, `zip`, `rar`,
`7z`, `tar`, `gz`, `dmg`, `exe`, `msi`, `apk`, and media: `mp4`, `m4v`, `mov`, `webm`, `mkv`,
`mp3`, `wav`, `ogg`, `flac`.

Those formats cannot be represented faithfully in an HTML reading view, so Read Mode hands them
to the browser instead of pretending. The rule is simple: **nothing is lost**.

---

## Design system

The UI follows Material 3 (Material You), dark theme, baseline purple scheme.

**Colour tokens** (in `theme.css`, consumed as `--md-*`):

| Token | Value | Used for |
| --- | --- | --- |
| `--md-primary` | `#d0bcff` | Filled button, accents, link colour |
| `--md-on-primary` | `#381e72` | Text on filled button |
| `--md-primary-container` | `#4f378b` | Selection and emphasis surfaces |
| `--md-surface` | `#141218` | Page background |
| `--md-surface-container` | `#211f26` | Cards, chips, icon buttons |
| `--md-surface-container-high` | `#2b2930` | Raised states |
| `--md-on-surface` | `#e6e0e9` | Body text |
| `--md-on-surface-variant` | `#cac4d0` | Meta text, hints |
| `--md-outline` | `#938f99` | Pill borders |

**Type:** Roboto/system sans for UI chrome, a Georgia-led serif stack for reading, and a mono
stack for code blocks.

**Shape and motion:** 26px-radius action buttons, 16–20px cards, fully rounded pills and icon
buttons, M3 standard easing, and hover/press state layers rather than hard colour swaps.

**Sizing:** the popup is a fixed 360px sheet with two 76px-tall actions; the reader scales its
type and measure with the viewport and drops the wordmark under 640px.

---

## Privacy and permissions

Read Mode has no servers, no analytics, no telemetry and no network calls of its own. Everything
happens on your machine.

```json
"permissions": ["activeTab", "scripting", "storage"]
```

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Grants access to the current tab **only** after you click the toolbar button, and only until that tab navigates. Read Mode cannot read any page you have not explicitly asked it to read, and it requests no broad `host_permissions`. |
| `scripting` | To inject `extract.js` into the tab you asked for, at the moment you ask. There is no persistent content script running on every page. |
| `storage` | To hand the captured copy to the reading tab, and to remember your text size and width. |

Captured content is stored locally in `chrome.storage.session` under a random id (falling back to
`chrome.storage.local` if session storage is unavailable). Session storage is cleared when
Chrome exits; the extension keeps at most the 12 most recent copies and prunes older ones. Only
the reading tab you opened holds the id, in its URL.

No content, URL or usage data leaves your browser.

---

## Troubleshooting

**The popup says "Select some text first".**
The selection was lost before the popup opened (some sites clear it on focus change). Select the
text again and click the icon once more.

**"Browser pages can't be read."**
Chrome forbids extensions from scripting `chrome://` pages, the Web Store, and other extensions'
pages. Open a normal web page.

**The reading copy is missing images.**
Some images are rendered through canvas, CSS backgrounds or scripts that need the original
origin. Canvas content is captured; pure CSS `background-image` decoration is not, by design —
it is usually chrome rather than content.

**A page rendered as almost nothing.**
Some sites render their article only after client-side navigation or inside a shadow DOM
boundary. If the capture comes back empty, Read Mode opens the original page instead.

**"This reading copy expired."**
Reading copies last for the browser session. Re-capture the page.

**The icon is missing from the toolbar.**
Pin it: click the puzzle-piece icon and pin **Read Mode**.

**Text looks too small or too large.**
Use **A−** / **A+**. The choice is remembered for every reading tab. To reset, open the extension's
options via `chrome://extensions` → Details → Clear data, or run
`chrome.storage.local.remove(["reader:size","reader:wide"])`.

---

## Project layout

```
read-mode/
├── manifest.json     MV3 manifest: permissions, popup, icons, service worker
├── background.js     Service worker: capture scheduling, format routing, storage, tab opening
├── extract.js        Injected on demand: reads and sanitises the page into a payload
├── popup.html        Material 3 popup markup
├── popup.css         Popup styling
├── popup.js          Popup actions and status messages
├── reader.html       Reading tab markup
├── reader.css        Reading typography and layout
├── reader.js         Payload loading, rendering, hardening, size/width controls
├── theme.css         Shared Material 3 dark tokens and type stacks
├── icons/            16, 32, 48 and 128px icons
└── README.md
```

### How a click flows

```
toolbar click
   └─ popup.js  ──message("read-mode:selection" | "read-mode:page")──▶ background.js
        background.js: reject restricted URLs
                       route PDF/doc/media straight to a new tab
                       executeScript(extract.js)  →  __readMode.selection() / .page()
                             │  (all frames first, then main frame)
                             ▼
                       payload { kind, title, url, site, html, text, words }
                             │
                       chrome.storage.session["read:<uuid>"] = payload
                             │
                       chrome.tabs.create("reader.html?id=<uuid>")
                             ▼
                       reader.js: load payload → harden → render
                                  apply saved size/width
```

`extract.js` is a plain script that assigns `window.__readMode`; `background.js` never uses
`eval`, and re-injection is idempotent, so pressing the button twice (or after reloading the
extension) always works.

### Editing the extension

There is no build step, no bundler and no dependencies. Edit a file, press the reload arrow in
`chrome://extensions`, and click Read Mode again. `node --check <file>.js` is enough to catch
syntax errors; `manifest.json` must stay valid JSON.

---

## Technical notes

- **Payload shape**: `{ kind: "selection" | "page", title, url, site, html, text, words, capturedAt }`.
  `text` is the plain-text rendering, kept to 20,000 characters for word counts and the reader's
  plain-text fallback.
- **Storage keys**: `read:<uuid>` for content (session, with a local fallback), `read:index` for
  the pruning index, `reader:size` and `reader:wide` for preferences.
- **Capture target order**: all frames, then the main frame. The first non-null payload wins, so a
  selection inside an iframe or a same-process subframe is found without extra permission
  requests.
- **Word count** counts letter/number runs (Unicode aware), and reading time is
  `round(words / 230)` minutes, minimum one.
- **Duplicate titles**: if the first `h1`/`h2` in the captured content normalises to the same text
  as the page title, the standalone title is suppressed.
- **Timing**: extraction is synchronous DOM work in the page; a large page costs a few hundred
  milliseconds. The popup shows no spinner because the new tab takes focus and Chrome closes the
  popup as soon as it does.

---

## Limitations

- Not usable on browser-internal pages, the Chrome Web Store, or other extensions' pages —
  a Chrome platform restriction, not a bug.
- Shadow DOM content and CSS background imagery are not captured; canvas renderings are.
- Video and audio are carried over as elements pointing at their original sources, so they need
  the original site to remain reachable (and DRM-protected streams will not play).
- Reading copies are per-session; they do not survive a browser restart.
- No sync, no highlighting, no annotations, no export — this version is a reader, not a library.
