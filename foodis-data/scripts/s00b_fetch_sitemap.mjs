#!/usr/bin/env node
/**
 * TasteAtlas 사이트맵에서 slug + caption 을 추출하여 data/raw/tasteatlas_slugs.json 에 저장한다.
 * TasteAtlas 가 봇 User-Agent 를 차단하므로 일반 브라우저 UA 로 가져온다.
 * 사이트맵(공개 XML)의 URL slug 과 이미지 캡션(음식 이름)만 저장 — TasteAtlas 콘텐츠는 포함하지 않는다.
 *
 *   node scripts/s00b_fetch_sitemap.mjs
 */
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, "..", "data", "raw");
mkdirSync(RAW, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

async function fetchSitemap(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/xml, text/xml, */*" },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${url}`);
  return r.text();
}

function parseSitemap(xml) {
  const items = [];
  const urlRe = /<url>([\s\S]*?)<\/url>/g;
  const locRe = /<loc>https?:\/\/www\.tasteatlas\.com\/([a-z0-9][\w-]+)<\/loc>/i;
  const captionRe = /<image:caption>(.*?)<\/image:caption>/;
  let match;
  while ((match = urlRe.exec(xml))) {
    const block = match[1];
    const loc = locRe.exec(block);
    if (!loc) continue;
    const cap = captionRe.exec(block);
    items.push({ slug: loc[1], caption: cap ? cap[1].trim() : "" });
  }
  return items;
}

const BASE = "https://www.tasteatlas.com/sitemaps";
const all = [];

for (const smap of ["dishes.xml", "ingredients.xml"]) {
  console.log(`  ${smap} 다운로드 중…`);
  const xml = await fetchSitemap(`${BASE}/${smap}`);
  const items = parseSitemap(xml);
  for (const it of items) it.source = smap.replace(".xml", "");
  all.push(...items);
  console.log(`  → ${items.length}개`);
}

const out = join(RAW, "tasteatlas_slugs.json");
writeFileSync(out, JSON.stringify(all, null, 2), "utf-8");
console.log(`✔ ${out} (${all.length}개)`);
