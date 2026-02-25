"use client";

/**
 * sanitize-client.ts — browser-native XSS sanitizer.
 *
 * The primary XSS defense is server-side (sanitize-html in the /append route,
 * which runs before anything is written to disk). This module provides an
 * additional render-time defense-in-depth layer for client components that
 * use dangerouslySetInnerHTML.
 *
 * Implementation uses the browser's native DOMParser — no external deps.
 * The allow-list mirrors lib/security/sanitize.ts exactly.
 *
 * During SSR (window === undefined) the function returns the input as-is;
 * that is safe because the data was already sanitized server-side before
 * being persisted.
 */

const ALLOWED_TAGS = new Set([
  // sanitize-html defaults
  "address", "article", "aside", "footer", "header", "h1", "h2", "h3",
  "h4", "h5", "h6", "hgroup", "main", "nav", "section", "blockquote",
  "dd", "div", "dl", "dt", "figcaption", "figure", "hr", "li", "main",
  "ol", "p", "pre", "ul", "a", "abbr", "b", "bdi", "bdo", "br", "cite",
  "code", "data", "dfn", "em", "i", "kbd", "mark", "q", "rp", "rt",
  "ruby", "s", "samp", "small", "span", "strong", "sub", "sup", "time",
  "u", "var", "wbr", "caption", "col", "colgroup", "table", "tbody",
  "td", "tfoot", "th", "thead", "tr",
  // additions from our server config
  "img", "section",
]);

const ALLOWED_ATTRS_GLOBAL = new Set(["class", "id"]);
const ALLOWED_ATTRS_TAG: Record<string, Set<string>> = {
  a:    new Set(["href", "target", "rel"]),
  img:  new Set(["src", "alt", "width", "height", "class"]),
  pre:  new Set(["class"]),
  code: new Set(["class"]),
  td:   new Set(["colspan", "rowspan"]),
  th:   new Set(["colspan", "rowspan", "scope"]),
};

function walkElement(el: Element): void {
  const tag = el.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    // Replace disallowed element with its children (unwrap)
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    return;
  }

  const tagAllowed = ALLOWED_ATTRS_TAG[tag] ?? new Set<string>();

  // Remove disallowed attributes
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const val = attr.value.trim().toLowerCase();

    // Strip event handlers
    if (name.startsWith("on")) {
      el.removeAttribute(attr.name);
      continue;
    }

    // Strip javascript: URIs
    if ((name === "href" || name === "src") && val.startsWith("javascript:")) {
      el.removeAttribute(attr.name);
      continue;
    }

    // Remove if not in allow-list
    if (!ALLOWED_ATTRS_GLOBAL.has(name) && !tagAllowed.has(name)) {
      el.removeAttribute(attr.name);
    }
  }

  // Recurse (iterate over a snapshot — walking may mutate the list)
  for (const child of Array.from(el.children)) {
    walkElement(child);
  }
}

export function sanitizeHTML(dirty: string | undefined): string {
  if (!dirty) return "";

  // During SSR, data is already sanitized server-side — return as-is.
  if (typeof window === "undefined") return dirty;

  const doc = new DOMParser().parseFromString(dirty, "text/html");
  for (const child of Array.from(doc.body.children)) {
    walkElement(child);
  }
  return doc.body.innerHTML;
}
