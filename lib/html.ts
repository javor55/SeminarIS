import sanitizeHtml from "sanitize-html";

// Bezpečné HTML pro text z editoru (sylabus, později popis události).
// Whitelist tagů a atributů; vše ostatní (skripty, iframe, obsluha událostí, javascript: odkazy) se odstraní.

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "img", "hr", "span"];

/** Obrázek smí být jen z vlastního API (relativní `/api/…`) nebo přes https. */
function isAllowedImageSrc(src: string): boolean {
  const s = src.trim();
  if (s.startsWith("//")) return false;
  return s.startsWith("/api/") || /^https:\/\//i.test(s);
}

export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html ?? "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      // Editor nabízí nadpis 1. úrovně, ve whitelistu je od h2 (h1 patří názvu stránky)
      h1: "h2",
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: "noopener noreferrer" },
      }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !isAllowedImageSrc(frame.attribs.src ?? ""),
  });
}
