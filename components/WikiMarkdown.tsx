"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { headingAnchor, slugify } from "@/lib/wiki";
import { splitWikiBody, WikiEmbedMap } from "@/lib/wiki-embeds";
import { CITATION_RE, WikiCitationMap, citationAnchor, citationBackAnchor, extractCitations } from "@/lib/wiki-citations";
import WikiEmbed from "./WikiEmbeds";

/**
 * Chronicles Wiki markdown renderer.
 *
 * GitHub-flavored markdown, sanitized (no raw HTML — bodies are ultimately
 * community input), plus the wiki dialect:
 *   [[Page Title]] / [[page-slug|shown label]]  →  internal /chronicles links.
 * Links whose target doesn't exist render "red" (dashed underline) when the
 * caller provides `existingSlugs` — Wikipedia's create-me affordance.
 */

// ---------------------------------------------------------------------------
// remark plugin: turn [[...]] inside text nodes into link nodes.
// Operating on the parsed tree (text nodes only) means code blocks and inline
// code are naturally untouched.
// ---------------------------------------------------------------------------

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hProperties?: Record<string, unknown> };
}

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

function splitWikiLinks(node: MdNode): MdNode[] | null {
  const text = node.value ?? "";
  WIKI_LINK_RE.lastIndex = 0;
  if (!WIKI_LINK_RE.test(text)) return null;
  WIKI_LINK_RE.lastIndex = 0;

  const out: MdNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_LINK_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    const target = m[1].trim();
    const label = (m[2] ?? "").trim() || target;
    const slug = slugify(target);
    out.push({
      type: "link",
      url: `/chronicles/${slug}`,
      data: { hProperties: { "data-wiki-slug": slug } },
      children: [{ type: "text", value: label }],
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function remarkWikiLinks() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children) return;
      // Don't descend into existing links (a [[x]] inside a link is nonsense)
      const next: MdNode[] = [];
      for (const child of node.children) {
        if (child.type === "text") {
          const replaced = splitWikiLinks(child);
          if (replaced) { next.push(...replaced); continue; }
        }
        if (child.type !== "link") walk(child);
        next.push(child);
      }
      node.children = next;
    };
    walk(tree);
  };
}

// ---------------------------------------------------------------------------
// remark plugin: {{cite:...}} -> superscript reference marker.
// Runs on text nodes like the wiki-link plugin, so code blocks stay untouched.
// ---------------------------------------------------------------------------

function splitCitations(node: MdNode, numbers: Map<string, number>): MdNode[] | null {
  const text = node.value ?? "";
  CITATION_RE.lastIndex = 0;
  if (!CITATION_RE.test(text)) return null;
  CITATION_RE.lastIndex = 0;

  const out: MdNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    const n = numbers.get(m[0]);
    if (n) {
      out.push({
        type: "link",
        url: `#${citationAnchor(n)}`,
        data: { hProperties: { "data-cite": String(n), id: `${citationBackAnchor(n)}-${m.index}` } },
        children: [{ type: "text", value: String(n) }],
      });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function remarkCitations(numbers: Map<string, number>) {
  return () => (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children) return;
      const next: MdNode[] = [];
      for (const child of node.children) {
        if (child.type === "text") {
          const replaced = splitCitations(child, numbers);
          if (replaced) { next.push(...replaced); continue; }
        }
        walk(child);
        next.push(child);
      }
      node.children = next;
    };
    walk(tree);
  };
}

// Sanitize schema: default + heading ids + our wiki-link data attribute
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // hProperties land in the tree verbatim, so these must be the literal
    // attribute names — the camelCase hast forms are silently stripped, which
    // takes the red-link and citation styling with them.
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ["data-wiki-slug"], ["dataWikiSlug"],
      ["data-cite"], ["dataCite"],
      ["id"], ["className"],
    ],
    h2: [...(defaultSchema.attributes?.h2 ?? []), ["id"]],
    h3: [...(defaultSchema.attributes?.h3 ?? []), ["id"]],
  },
};

// ---------------------------------------------------------------------------

function WikiMarkdown({
  body,
  existingSlugs,
  embeds,
  citations,
}: {
  body: string;
  /** Slugs known to exist — wiki links outside this set render as red links */
  existingSlugs?: string[];
  /**
   * Resolved {{...}} embed data keyed by directive line (see wiki-embed-db).
   * When absent, directives render as placeholder cards (editor preview).
   */
  embeds?: WikiEmbedMap;
  /** Resolved citations keyed by raw token; numbering is derived from the body */
  citations?: WikiCitationMap;
}) {
  const existing = useMemo(() => new Set(existingSlugs ?? []), [existingSlugs]);
  const knowsExistence = existingSlugs !== undefined;
  const segments = useMemo(() => splitWikiBody(body), [body]);
  // Numbering comes from the body itself, so the editor preview matches the
  // published article even before citations are resolved server-side.
  const citationNumbers = useMemo(
    () => new Map(extractCitations(body).map(c => [c.raw, c.number])),
    [body],
  );

  const renderMd = (text: string, key: number) => (
    <ReactMarkdown
        key={key}
        remarkPlugins={[remarkGfm, remarkWikiLinks, remarkCitations(citationNumbers)]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          h2: ({ children, ...props }) => (
            <h2 id={headingAnchor(textOf(children))} {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 id={headingAnchor(textOf(children))} {...props}>{children}</h3>
          ),
          a: ({ href, children, node: _node, ...props }) => {
            const citeNumber = (props as Record<string, unknown>)["data-cite"] as string | undefined;
            if (citeNumber) {
              const cite = citations
                ? Object.values(citations).find(c => String(c.number) === citeNumber)
                : undefined;
              const tip = cite ? `${cite.title}${cite.locator ? ` — ${cite.locator}` : ""}` : undefined;
              return (
                <sup className="wiki-cite">
                  <a href={href} {...props} title={tip}>[{children}]</a>
                </sup>
              );
            }
            const wikiSlug = (props as Record<string, unknown>)["data-wiki-slug"] as string | undefined;
            if (wikiSlug) {
              const missing = knowsExistence && !existing.has(wikiSlug);
              return (
                <a
                  href={href}
                  {...props}
                  style={{
                    color: missing ? "#e57373" : "var(--accent-primary)",
                    textDecoration: "none",
                    borderBottom: missing ? "1px dashed #e57373" : "1px solid transparent",
                  }}
                  title={missing ? "This page doesn't exist yet" : undefined}
                >
                  {children}
                </a>
              );
            }
            const external = typeof href === "string" && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                {...props}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                style={{ color: "var(--accent-primary)" }}
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              style={{ maxWidth: "100%", borderRadius: "0.375rem", margin: "0.5rem 0" }}
            />
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "0.75rem 0" }}>
              <table className="wiki-table">{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
  );

  return (
    <div className="wiki-body">
      {segments.map((seg, i) =>
        seg.type === 'md'
          ? renderMd(seg.text, i)
          : <WikiEmbed key={i} directive={seg.directive} data={embeds?.[seg.directive.raw]} />
      )}
      <style jsx global>{`
        .wiki-body { font-size: 0.92rem; line-height: 1.65; color: var(--text-primary); }
        .wiki-body h2 { font-size: 1.35rem; font-weight: 700; margin: 1.5rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--border-color); scroll-margin-top: 5rem; }
        .wiki-body h3 { font-size: 1.1rem; font-weight: 700; margin: 1.1rem 0 0.4rem; scroll-margin-top: 5rem; }
        .wiki-body p { margin: 0.6rem 0; }
        .wiki-body ul, .wiki-body ol { margin: 0.6rem 0 0.6rem 1.5rem; }
        .wiki-body li { margin: 0.25rem 0; }
        .wiki-body blockquote { border-left: 3px solid var(--border-color); margin: 0.75rem 0; padding: 0.25rem 0 0.25rem 0.9rem; color: var(--text-secondary); }
        .wiki-body code { background: var(--bg-secondary); padding: 0.1rem 0.35rem; border-radius: 0.25rem; font-size: 0.85em; }
        .wiki-body pre { background: var(--bg-secondary); padding: 0.75rem; border-radius: 0.375rem; overflow-x: auto; margin: 0.75rem 0; }
        .wiki-body pre code { background: none; padding: 0; }
        .wiki-body hr { border: none; border-top: 1px solid var(--border-color); margin: 1.25rem 0; }
        .wiki-table { border-collapse: collapse; font-size: 0.85rem; min-width: 50%; }
        .wiki-table th, .wiki-table td { border: 1px solid var(--border-color); padding: 0.35rem 0.6rem; text-align: left; }
        .wiki-table th { background: var(--bg-secondary); font-weight: 700; }
        .wiki-body .wiki-cite { font-size: 0.72em; line-height: 0; vertical-align: super; white-space: nowrap; }
        .wiki-body .wiki-cite a { color: var(--accent-primary); text-decoration: none; padding: 0 0.05em; }
        .wiki-body .wiki-cite a:hover { text-decoration: underline; }
        .wiki-body .wiki-cite a:target { background: color-mix(in srgb, var(--accent-primary) 18%, transparent); }
      `}</style>
    </div>
  );
}

function textOf(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (children && typeof children === "object" && "props" in children) {
    return textOf((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}

export default memo(WikiMarkdown);
