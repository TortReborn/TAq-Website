"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { headingAnchor, slugify } from "@/lib/wiki";

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

// Sanitize schema: default + heading ids + our wiki-link data attribute
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), ["dataWikiSlug"], ["className"]],
    h2: [...(defaultSchema.attributes?.h2 ?? []), ["id"]],
    h3: [...(defaultSchema.attributes?.h3 ?? []), ["id"]],
  },
};

// ---------------------------------------------------------------------------

function WikiMarkdown({
  body,
  existingSlugs,
}: {
  body: string;
  /** Slugs known to exist — wiki links outside this set render as red links */
  existingSlugs?: string[];
}) {
  const existing = useMemo(() => new Set(existingSlugs ?? []), [existingSlugs]);
  const knowsExistence = existingSlugs !== undefined;

  return (
    <div className="wiki-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkWikiLinks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          h2: ({ children, ...props }) => (
            <h2 id={headingAnchor(textOf(children))} {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 id={headingAnchor(textOf(children))} {...props}>{children}</h3>
          ),
          a: ({ href, children, node: _node, ...props }) => {
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
        {body}
      </ReactMarkdown>
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
