#!/usr/bin/env node
// Scan all posts in src/content/blog, download every remote image to
// public/images/<slug>/, and rewrite src/srcset to local paths.
// Usage: node scripts/download-images.mjs

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BLOG_DIR = path.resolve("src/content/blog");
const IMG_DIR = path.resolve("public/images");
const GHOST_URL = process.env.GHOST_URL || "https://akshaynarayanan.com";
fs.mkdirSync(IMG_DIR, { recursive: true });

const isRemote = (u) => /^https?:\/\//i.test(u);

function extFromUrl(u) {
  try {
    const p = new URL(u).pathname;
    const m = p.match(/\.([a-zA-Z0-9]{2,5})$/);
    return m ? "." + m[1].toLowerCase() : "";
  } catch { return ""; }
}

function extFromContentType(ct) {
  if (!ct) return "";
  const m = ct.match(/image\/(png|jpe?g|gif|webp|avif|svg\+xml)/i);
  if (!m) return "";
  const t = m[1].toLowerCase().replace("jpeg", "jpg").replace("svg+xml", "svg");
  return "." + t;
}

async function download(url, destDir) {
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 10);
  const baseName = path.basename(new URL(url).pathname) || hash;
  let ext = extFromUrl(url);
  let filename = ext ? `${hash}-${baseName}` : `${hash}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!ext) {
    ext = extFromContentType(res.headers.get("content-type")) || ".bin";
    filename += ext;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(destDir, { recursive: true });
  const out = path.join(destDir, filename);
  fs.writeFileSync(out, buf);
  return filename;
}

async function processFile(filePath) {
  const slug = path.basename(filePath, ".md");
  let raw = fs.readFileSync(filePath, "utf8");
  // Ghost exports contain a __GHOST_URL__ placeholder; swap it for the real domain.
  if (raw.includes("__GHOST_URL__")) {
    raw = raw.replaceAll("__GHOST_URL__", GHOST_URL);
    fs.writeFileSync(filePath, raw);
  }
  const urls = new Set();

  // Collect URLs from <img src="...">, srcset="...", and markdown ![](url)
  const imgSrcRe = /<img\b[^>]*?\bsrc=["']([^"']+)["']/gi;
  const srcsetRe = /\bsrcset=["']([^"']+)["']/gi;
  const mdImgRe = /!\[[^\]]*\]\(([^)\s]+)/g;

  let m;
  while ((m = imgSrcRe.exec(raw))) if (isRemote(m[1])) urls.add(m[1]);
  while ((m = srcsetRe.exec(raw))) {
    for (const part of m[1].split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u && isRemote(u)) urls.add(u);
    }
  }
  while ((m = mdImgRe.exec(raw))) if (isRemote(m[1])) urls.add(m[1]);

  if (urls.size === 0) return { slug, count: 0 };

  const destDir = path.join(IMG_DIR, slug);
  const map = new Map();
  for (const url of urls) {
    try {
      const filename = await download(url, destDir);
      map.set(url, `/images/${slug}/${filename}`);
      process.stdout.write(".");
    } catch (e) {
      console.warn(`\n  failed ${url}: ${e.message}`);
    }
  }

  let rewritten = raw;
  for (const [remote, local] of map) {
    const escaped = remote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rewritten = rewritten.replace(new RegExp(escaped, "g"), local);
  }
  fs.writeFileSync(filePath, rewritten);
  return { slug, count: map.size };
}

const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));
let total = 0;
for (const f of files) {
  const { slug, count } = await processFile(path.join(BLOG_DIR, f));
  if (count) console.log(`\n${slug}: ${count} image(s)`);
  total += count;
}
console.log(`\nDone. Downloaded ${total} image(s) to ${IMG_DIR}`);
