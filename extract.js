// Read Mode — content extractor.
// Injected on demand into the active tab and its frames. Exposes
// window.__readMode.selection() and window.__readMode.page().
(() => {
  const SKIP_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "link",
    "meta",
    "base",
    "title",
    "iframe",
    "frame",
    "frameset",
    "object",
    "embed",
    "applet",
    "param",
    "input",
    "select",
    "textarea"
  ].join(",");

  // Kept on plain HTML elements; everything else (styles, ids, classes, event
  // handlers, data-*) is removed so the page can't fight the reader typography.
  const KEEP_ATTRS = new Set([
    "href",
    "src",
    "alt",
    "title",
    "colspan",
    "rowspan",
    "scope",
    "dir",
    "lang",
    "datetime",
    "cite",
    "start",
    "reversed",
    "width",
    "height",
    "type",
    "controls",
    "poster"
  ]);

  const MAX_CANVAS_PIXELS = 6e6;
  const SVG_NS = "http://www.w3.org/2000/svg";

  window.__readMode = {
    selection: captureSelection,
    page: capturePage
  };

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const text = (selection.toString() || "").trim();
    if (!text) return null;

    let fragment;
    try {
      fragment = selection.getRangeAt(0).cloneContents();
    } catch {
      return null;
    }

    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);

    return buildPayload("selection", wrapper, { text });
  }

  function capturePage() {
    if (!document.body) return null;

    const source = document.body.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(source);

    let canvasShots = null;
    try {
      canvasShots = readCanvases();
    } catch {
      canvasShots = null;
    }

    return buildPayload("page", wrapper, { canvasShots, liveRoot: document.body, source });
  }

  function buildPayload(kind, wrapper, options) {
    const base = document.baseURI || location.href;

    if (options.canvasShots) swapCanvases(wrapper, options.canvasShots);
    else removeAll(wrapper, "canvas");

    // Drop what the page itself does not show. Done before attributes are
    // stripped, while the clone still matches the live tree node for node.
    if (options.liveRoot && options.source) pruneHidden(options.liveRoot, options.source);

    removeAll(wrapper, SKIP_SELECTOR);
    removeAll(wrapper, '[hidden],[aria-hidden="true"]');

    // Resolve URLs first, while lazy-load data attributes still exist.
    fixResources(wrapper, base);
    stripAttributes(wrapper);

    const rawText = (options.text || wrapper.textContent || "").replace(/\u00a0/g, " ");
    const words = countWords(rawText);

    return {
      ok: true,
      kind,
      title: documentTitle(),
      url: location.href,
      site: location.hostname.replace(/^www\./, ""),
      html: wrapper.innerHTML,
      text: rawText.slice(0, 20000),
      words,
      capturedAt: Date.now()
    };
  }

  function documentTitle() {
    const title = (document.title || "").trim();
    if (title) return title;
    const heading = document.querySelector("h1");
    return heading ? (heading.textContent || "").trim() : "";
  }

  function countWords(text) {
    const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return matches ? matches.length : 0;
  }

  function readCanvases() {
    return Array.from(document.querySelectorAll("canvas"), (canvas) => {
      try {
        const area = canvas.width * canvas.height;
        if (!area || area > MAX_CANVAS_PIXELS) return null;
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      }
    });
  }

  function swapCanvases(root, shots) {
    root.querySelectorAll("canvas").forEach((canvas, index) => {
      const shot = shots[index];
      if (!shot) {
        canvas.remove();
        return;
      }
      const image = document.createElement("img");
      image.setAttribute("src", shot);
      image.setAttribute("alt", canvas.getAttribute("aria-label") || "Chart");
      canvas.replaceWith(image);
    });
  }

  // Walk the live tree and its clone side by side; remove nodes the page styles
  // as invisible. Iterating backwards keeps child indexes aligned.
  function pruneHidden(live, clone) {
    if (!live || !clone) return;
    if (clone.nodeType !== 1) return;

    if (live.nodeType === 1) {
      let style = null;
      try {
        style = getComputedStyle(live);
      } catch {
        style = null;
      }
      if (style && (style.display === "none" || style.visibility === "hidden")) {
        clone.remove();
        return;
      }
    }

    if (!live.children || !clone.children) return;
    for (let index = live.children.length - 1; index >= 0; index -= 1) {
      const liveChild = live.children[index];
      const cloneChild = clone.children[index];
      if (!liveChild || !cloneChild) continue;
      pruneHidden(liveChild, cloneChild);
    }
  }

  function removeAll(root, selector) {
    root.querySelectorAll(selector).forEach((element) => element.remove());
  }

  function stripAttributes(root) {
    const elements = [root, ...root.querySelectorAll("*")];
    for (const element of elements) {
      const isSvg = element.namespaceURI === SVG_NS;
      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value;

        if (name.startsWith("on")) {
          element.removeAttribute(attribute.name);
          continue;
        }

        if (isSvg) {
          if ((name === "href" || name === "xlink:href") && /^\s*(javascript|data:text\/html)/i.test(value)) {
            element.removeAttribute(attribute.name);
          }
          continue;
        }

        if (!KEEP_ATTRS.has(name)) {
          element.removeAttribute(attribute.name);
          continue;
        }

        if ((name === "href") && /^\s*(javascript|data:text\/html)/i.test(value)) {
          element.removeAttribute(attribute.name);
        }
      }
    }
  }

  function fixResources(root, base) {
    root.querySelectorAll("a[href]").forEach((anchor) => {
      const href = anchor.getAttribute("href");
      const absolute = resolve(href, base);
      if (absolute) anchor.setAttribute("href", absolute);
    });

    root.querySelectorAll("img").forEach((image) => {
      const lazy =
        image.getAttribute("data-src") ||
        image.getAttribute("data-original") ||
        image.getAttribute("data-lazy-src") ||
        image.getAttribute("data-actualsrc") ||
        image.getAttribute("data-orig-file");

      let src = image.getAttribute("src") || "";
      if ((!src || /^data:image\/(gif|png);base64,R0lGOD/i.test(src)) && lazy) src = lazy;

      const absolute = resolve(src, base);
      if (absolute) image.setAttribute("src", absolute);
      else image.remove();

      if (!image.getAttribute("alt")) image.setAttribute("alt", "");
    });

    root.querySelectorAll("video, audio, track, source").forEach((media) => {
      const src = media.getAttribute("src");
      const absolute = resolve(src, base);
      if (absolute) media.setAttribute("src", absolute);
      else media.removeAttribute("src");

      const poster = media.getAttribute("poster");
      if (poster) {
        const absolutePoster = resolve(poster, base);
        if (absolutePoster) media.setAttribute("poster", absolutePoster);
      }
      media.removeAttribute("autoplay");
    });
  }

  function resolve(value, base) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^(data:|blob:|mailto:|tel:)/i.test(trimmed)) return trimmed;
    // In-page anchors are meaningless once the page markup is gone.
    if (trimmed.startsWith("#")) return null;
    try {
      return new URL(trimmed, base).href;
    } catch {
      return trimmed;
    }
  }
})();
