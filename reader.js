const SIZES = [17, 19, 21, 23, 26, 29, 32];
const DEFAULT_SIZE = 21;

const els = {
  doc: document.querySelector(".doc"),
  kind: document.getElementById("kind"),
  site: document.getElementById("site"),
  length: document.getElementById("length"),
  title: document.getElementById("title"),
  content: document.getElementById("content"),
  original: document.getElementById("original"),
  source: document.getElementById("source"),
  empty: document.getElementById("empty"),
  emptyTitle: document.getElementById("empty-title"),
  emptyText: document.getElementById("empty-text")
};

const state = { size: DEFAULT_SIZE, wide: false };

start();

async function start() {
  bindControls();
  await restorePreferences();

  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    showEmpty("Nothing to read yet", "Open Read Mode from the toolbar, then choose a selection or a whole page.");
    return;
  }

  const payload = await loadPayload(id);
  if (!payload) {
    showEmpty(
      "This reading copy expired",
      "Reading copies live only for the browser session. Open Read Mode again from the page you want to read."
    );
    return;
  }

  render(payload);
}

async function loadPayload(id) {
  const key = "read:" + id;
  try {
    const result = await chrome.storage.session.get(key);
    if (result && result[key]) return result[key];
  } catch {
    /* fall through */
  }
  try {
    const result = await chrome.storage.local.get(key);
    if (result && result[key]) return result[key];
  } catch {
    /* fall through */
  }
  return null;
}

function render(payload) {
  const words = payload.words || countWords(payload.text || "");
  const minutes = Math.max(1, Math.round(words / 230));

  document.title = payload.title ? payload.title + " — Read Mode" : "Read Mode";
  els.kind.textContent = payload.kind === "selection" ? "Selection" : "Whole page";
  els.site.textContent = payload.site || "this page";
  els.length.textContent = words ? words.toLocaleString() + " words · " + minutes + " min" : "";

  els.content.innerHTML = payload.html || "";
  harden(els.content);

  const showTitle = Boolean(payload.title) && !duplicatesTitle(els.content, payload.title);
  els.title.textContent = showTitle ? payload.title : "";
  els.title.hidden = !showTitle;

  markPlainText(els.content);
  externalizeLinks(els.content);

  const isWeb = /^https?:/i.test(payload.url || "");
  for (const link of [els.original, els.source]) {
    if (isWeb) {
      link.href = payload.url;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  }

  els.doc.hidden = false;
  els.empty.hidden = true;

  if (!(payload.html || "").trim()) {
    showEmpty("This selection was empty", "Select a larger portion of the page and try again.");
  }
}

// Belt and braces: the extractor already strips these, but the reader inserts
// third-party HTML, so nothing executable may survive.
function harden(root) {
  root.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const isHandler = name.startsWith("on");
      const isScriptUrl = (name === "href" || name === "src") && /^\s*(javascript|data:text\/html)/i.test(attribute.value);
      if (isHandler || isScriptUrl || name === "srcdoc") element.removeAttribute(attribute.name);
    }
  });
  root.querySelectorAll("script,style,iframe,object,embed,link,meta,base,input,select,textarea").forEach((element) =>
    element.remove()
  );
}

function duplicatesTitle(root, title) {
  const first = root.querySelector("h1,h2");
  if (!first) return false;
  return normalize(first.textContent) === normalize(title);
}

function normalize(text) {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

// A lone <pre> block is how Chrome renders .txt / .md pages. If it reads like
// prose, present it as text rather than as code.
function markPlainText(root) {
  const blocks = Array.from(root.children);
  if (blocks.length !== 1) return;
  const only = blocks[0];
  if (only.tagName !== "PRE") return;

  const text = only.textContent || "";
  const lines = text.split("\n").filter((line) => line.trim());
  if (!lines.length) return;

  const averageLine = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
  const punctuation = (text.match(/[.,;:!?]/g) || []).length / Math.max(1, text.length);

  if (averageLine > 38 && punctuation > 0.004) only.classList.add("is-plain");
}

function externalizeLinks(root) {
  root.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("#")) {
      anchor.removeAttribute("href");
      return;
    }
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer noopener");
  });
}

function countWords(text) {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

function showEmpty(title, text) {
  els.doc.hidden = true;
  els.empty.hidden = false;
  els.emptyTitle.textContent = title;
  els.emptyText.textContent = text;
}

/* Controls ---------------------------------------------------------------- */

function bindControls() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "smaller") setSize(state.size - 2);
      if (action === "bigger") setSize(state.size + 2);
      if (action === "width") toggleWidth();
    });
  });
}

function setSize(next) {
  const closest = SIZES.reduce((best, size) => (Math.abs(size - next) < Math.abs(best - next) ? size : best), SIZES[0]);
  state.size = closest;
  document.documentElement.style.setProperty("--reading-size", closest + "px");
  try {
    chrome.storage.local.set({ "reader:size": closest });
  } catch {
    /* ignore */
  }
}

function toggleWidth() {
  state.wide = !state.wide;
  els.doc.classList.toggle("is-wide", state.wide);
  const button = document.querySelector('[data-action="width"]');
  if (button) {
    button.setAttribute("aria-pressed", String(state.wide));
    button.textContent = state.wide ? "Narrow" : "Wide";
  }
  try {
    chrome.storage.local.set({ "reader:wide": state.wide });
  } catch {
    /* ignore */
  }
}

async function restorePreferences() {
  let prefs = {};
  try {
    prefs = await chrome.storage.local.get(["reader:size", "reader:wide"]);
  } catch {
    prefs = {};
  }

  const size = Number(prefs["reader:size"]);
  state.size = SIZES.includes(size) ? size : DEFAULT_SIZE;
  document.documentElement.style.setProperty("--reading-size", state.size + "px");

  state.wide = Boolean(prefs["reader:wide"]);
  const button = document.querySelector('[data-action="width"]');
  els.doc.classList.toggle("is-wide", state.wide);
  if (button) {
    button.setAttribute("aria-pressed", String(state.wide));
    button.textContent = state.wide ? "Narrow" : "Wide";
  }
}
