import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  "img",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "div",
  "section",
];

const SANITIZE_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    "*": ["class", "id"],
    img: ["src", "alt", "width", "height", "class"],
    a: ["href", "target", "rel"],
    pre: ["class"],
    code: ["class"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
  },
  allowedSchemes: ["http", "https", "data"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  // Strip any event handlers
  disallowedTagsMode: "discard",
};

export function sanitizeHTML(dirty: string | undefined): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty, SANITIZE_CONFIG);
}
