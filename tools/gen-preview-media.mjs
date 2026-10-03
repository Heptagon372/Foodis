// 음식 미디어(갤러리 사진 + 유튜브 영상) 미리보기 번들 생성:
//   node tools/gen-preview-media.mjs
// 입력: foodis-data/data/raw/gallery.json (s10_gallery.py), foodis-data/data/raw/youtube.json (s11_youtube.py)
// 출력: apps/web/lib/preview/media.json
//   { slug: { gallery: [{url, thumb, title, source, license, credit_url, author, fit}], youtube: {video_id, url, title, channel, duration_sec, view_count} | null } }
// catalog.json 의 slug 집합만 대상으로 걸러서 넣는다 (미리보기 소스가 쓰는 음식 목록과 어긋나지 않게).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const json = (p) => (existsSync(new URL(p, root)) ? JSON.parse(read(p)) : {});

const catalog = JSON.parse(read("apps/web/lib/preview/catalog.json"));
const gallery = json("foodis-data/data/raw/gallery.json");
const youtube = json("foodis-data/data/raw/youtube.json");

const slugs = new Set(catalog.map((c) => c.s));
const out = {};
for (const slug of slugs) {
  const g = (gallery[slug] ?? []).filter((p) => p && p.url).slice(0, 5);
  const y = youtube[slug] ?? null;
  if (!g.length && !y) continue;
  out[slug] = {
    gallery: g,
    youtube: y && y.video_id ? y : null,
  };
}
writeFileSync(new URL("apps/web/lib/preview/media.json", root), JSON.stringify(out));
const withGallery = Object.values(out).filter((m) => m.gallery.length).length;
const withYoutube = Object.values(out).filter((m) => m.youtube).length;
const totalPhotos = Object.values(out).reduce((a, m) => a + m.gallery.length, 0);
console.log(`[media] ${Object.keys(out).length}개 음식 · 갤러리 ${withGallery}개 · 유튜브 ${withYoutube}개 · 사진 ${totalPhotos}장`);
