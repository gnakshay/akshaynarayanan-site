#!/usr/bin/env node
// Convert a Ghost JSON export into Astro markdown files.
// Usage: node scripts/ghost-to-md.mjs path/to/ghost-export.json

import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/ghost-to-md.mjs <ghost-export.json>");
  process.exit(1);
}

const outDir = path.resolve("src/content/blog");
fs.mkdirSync(outDir, { recursive: true });

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const db = raw.db?.[0]?.data ?? raw.data ?? raw;
const posts = db.posts ?? [];
const tagsById = new Map((db.tags ?? []).map((t) => [t.id, t.slug]));
const postTags = db.posts_tags ?? [];

const tagsByPost = new Map();
for (const pt of postTags) {
  const slug = tagsById.get(pt.tag_id);
  if (!slug) continue;
  if (!tagsByPost.has(pt.post_id)) tagsByPost.set(pt.post_id, []);
  tagsByPost.get(pt.post_id).push(slug);
}

const yamlEscape = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

let written = 0;
for (const post of posts) {
  if (post.type && post.type !== "post") continue;
  if (post.status !== "published" && !process.env.INCLUDE_DRAFTS) continue;

  const slug = post.slug || post.id;
  const date = post.published_at || post.created_at || new Date().toISOString();
  const tags = tagsByPost.get(post.id) ?? [];

  // Ghost stores content in either `html`, `mobiledoc`, or `lexical`.
  // For simplicity we write raw HTML inside markdown (Astro renders it fine).
  // If you prefer clean markdown, run the output through a tool like turndown afterwards.
  let body = post.html || "";
  if (!body && post.plaintext) body = post.plaintext;
  if (!body) {
    console.warn(`skip (no html): ${slug}`);
    continue;
  }

  const fm = [
    "---",
    `title: ${yamlEscape(post.title || slug)}`,
    post.custom_excerpt || post.meta_description
      ? `description: ${yamlEscape(post.custom_excerpt || post.meta_description)}`
      : null,
    `pubDate: ${new Date(date).toISOString().slice(0, 10)}`,
    post.updated_at ? `updatedDate: ${new Date(post.updated_at).toISOString().slice(0, 10)}` : null,
    tags.length ? `tags: [${tags.map(yamlEscape).join(", ")}]` : null,
    post.status !== "published" ? "draft: true" : null,
    "---",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const outPath = path.join(outDir, `${slug}.md`);
  fs.writeFileSync(outPath, fm + body + "\n");
  written++;
}

console.log(`Wrote ${written} post(s) to ${outDir}`);
console.log("Note: Ghost images still point at their original URLs.");
console.log("Download them separately and rewrite src attributes if you want them self-hosted.");
