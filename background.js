// Read Mode — service worker.
// Captures a selection or a whole page in the active tab and opens it in a reader tab.

const READER_PATH = "reader.html";
const STORAGE_PREFIX = "read:";
const STORAGE_INDEX = "read:index";
const MAX_STORED_DOCS = 12;

// Formats a reader page can never render faithfully: hand them to Chrome's own
// viewer so nothing is lost.
const NATIVE_VIEW = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|epub|rtf|zip|rar|7z|tar|gz|dmg|exe|msi|apk|mp4|m4v|mov|webm|mkv|mp3|wav|ogg|flac)(?:$|[?#])/i;
const RESTRICTED = /^(chrome|chrome-untrusted|edge|about|devtools|chrome-extension|extension|view-source|brave|opera|vivaldi):/i;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "read-mode:selection") {
    openSelection().then(sendResponse, (error) =>
      sendResponse({ ok: false, message: error && error.message ? error.message : "Could not read this page." })
    );
    return true;
  }

  if (message.type === "read-mode:page") {
    openPage().then(sendResponse, (error) =>
      sendResponse({ ok: false, message: error && error.message ? error.message : "Could not read this page." })
    );
    return true;
  }

  return false;
});

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function openSelection() {
  const tab = await activeTab();
  if (!tab || !tab.id) return { ok: false, message: "No active tab to read." };
  if (isRestricted(tab.url)) {
    return { ok: false, message: "Browser pages can't be read. Try a normal web page." };
  }

  let payload = null;
  try {
    payload = await captureInTab(tab.id, "selection");
  } catch {
    payload = null;
  }

  if (!payload) {
    return { ok: false, message: "Select some text first, then open Read Mode." };
  }

  await openReader(payload);
  return { ok: true };
}

async function openPage() {
  const tab = await activeTab();
  if (!tab || !tab.id || !tab.url) return { ok: false, message: "No active tab to read." };
  if (isRestricted(tab.url)) {
    return { ok: false, message: "Browser pages can't be read. Try a normal web page." };
  }

  // PDFs, office files, archives and media: open the real thing in a new tab.
  if (NATIVE_VIEW.test(tab.url)) {
    await chrome.tabs.create({ url: tab.url, active: true });
    return { ok: true, direct: true };
  }

  let payload = null;
  try {
    payload = await captureInTab(tab.id, "page");
  } catch {
    payload = null;
  }

  if (!payload) {
    // Never lose the page: fall back to a plain new tab of the original.
    await chrome.tabs.create({ url: tab.url, active: true });
    return { ok: true, direct: true };
  }

  await openReader(payload);
  return { ok: true };
}

function isRestricted(url) {
  return !url || RESTRICTED.test(url);
}

// Injects the extractor into every reachable frame and returns the first usable
// payload (a selection can live inside an iframe).
async function captureInTab(tabId, mode) {
  const targets = [
    { tabId, allFrames: true },
    { tabId, allFrames: false }
  ];

  for (const target of targets) {
    try {
      await chrome.scripting.executeScript({ target, files: ["extract.js"] });
      const results = await chrome.scripting.executeScript({
        target,
        args: [mode],
        func: (which) => {
          if (!window.__readMode) return null;
          return which === "selection" ? window.__readMode.selection() : window.__readMode.page();
        }
      });
      for (const result of results || []) {
        if (result && result.result) return result.result;
      }
    } catch {
      // Try the narrower target, then give up.
    }
  }
  return null;
}

async function openReader(payload) {
  const id = newId();
  await store(id, payload);
  await chrome.tabs.create({
    url: chrome.runtime.getURL(READER_PATH) + "?id=" + encodeURIComponent(id),
    active: true
  });
}

async function store(id, payload) {
  const key = STORAGE_PREFIX + id;
  try {
    await chrome.storage.session.set({ [key]: payload });
  } catch {
    try {
      await chrome.storage.local.set({ [key]: payload });
    } catch {
      // Last resort: nothing to do, the reader will show its empty state.
    }
  }
  await trimStore(key);
}

// Keep the store small: session storage has a hard quota.
async function trimStore(keepKey) {
  try {
    const index = (await chrome.storage.session.get(STORAGE_INDEX))[STORAGE_INDEX] || [];
    const next = [keepKey, ...index.filter((key) => key !== keepKey)];
    const dropped = next.slice(MAX_STORED_DOCS);
    if (dropped.length) {
      try {
        await chrome.storage.session.remove(dropped);
      } catch {
        /* ignore */
      }
    }
    await chrome.storage.session.set({ [STORAGE_INDEX]: next.slice(0, MAX_STORED_DOCS) });
  } catch {
    /* ignore */
  }
}

function newId() {
  if (self.crypto && typeof self.crypto.randomUUID === "function") return self.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
