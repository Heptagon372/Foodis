"use client";
// My Table 이미지 (F-REC-04) — 공유 카드(share-card.ts)와 같은 브라우저 canvas 방식, 1080×1350.
// 음식 사진은 그리지 않는다: 위키미디어 이미지는 CORS 헤더가 없어 canvas 가 오염(toBlob 실패)되고, 사진마다 출처 표기도 필요하다.
// 대신 국가색 접시 + 음식 모양(라인 아이콘) + 국기로 그린다.
// 팔레트는 테마와 무관한 고정 라이트(디자인 v2: 흰색 · 초록 · 연두) — 밖으로 나가는 이미지라 보는 사람 테마를 모른다.
import type { IconName } from "@/components/icons";
import { CONTINENT_COLOR, CONTINENT_LABEL, tableLayout, type TablePlate } from "@/lib/table/my-table";
import { family, roundRect } from "./share-card";

const W = 1080;
const H = 1350;
// v2 라이트 토큰 값 (globals.css 와 같은 hex)
const C = { canvas: "#F5F9F2", surface: "#FFFFFF", brand: "#2B8645", leaf: "#25803F", lime: "#C8F06A", onLime: "#14301C", ink: "#12261A", muted: "#5F7164", line: "#E0E9DC" };

// lucide 아이콘 path (24 단위 viewBox, lucide-react 1.49 의 __iconData 에서 옮김 — circle/rect 는 path 로 바꿈).
// 이모지 글꼴은 기기마다 모양·색이 달라서, 화면과 같은 선 도형을 Path2D 로 그린다
const ICON_PATHS: Partial<Record<IconName, string[]>> = {
  soup: ["M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z", "M7 21h10", "M19.5 12 22 6", "M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62", "M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62", "M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62"],
  chef: ["M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z", "M6 17h12"],
  bean: ["M10.165 6.598C9.954 7.478 9.64 8.36 9 9c-.64.64-1.521.954-2.402 1.165A6 6 0 0 0 8 22c7.732 0 14-6.268 14-14a6 6 0 0 0-11.835-1.402Z", "M5.341 10.62a4 4 0 1 0 5.279-5.28"],
  wheat: ["M2 22 16 8", "M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z", "M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z", "M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z", "M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z", "M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z", "M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z", "M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"],
  cake: ["M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8", "M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1", "M2 21h20", "M7 8v3", "M12 8v3", "M17 8v3", "M7 4h.01", "M12 4h.01", "M17 4h.01"],
  shrimp: ["M10 2a3.28 3.28 0 003.227 1.798l6.17-.561A1 1 0 1119.614 8H8.5a6.44 6.44 0 00-5.63 9.75A6.5 6.5 0 008.5 21c1.38 0 2-.5 2.5-1", "M10 8a8.5 8.5 0 000 8", "M11 22c-.5-.5-1.12-1-2.5-1a1 1 0 010-5H12a7 7 0 007-7V8", "M13 12h.01", "M8 16c-2 0-4.5-4-4-6"],
  beef: ["M16.4 13.7A6.5 6.5 0 1 0 6.28 6.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3", "m18.5 6 1.754 3.5a6.48 6.48 0 0 1-1.854 8.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5", "M10 8.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0"],
  drumstick: ["M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23", "m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59"],
  salad: ["M7 21h10", "M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z", "M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1", "m13 12 4-4", "M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2"],
  milk: ["M8 2h8", "M9 2v2.789a4 4 0 0 1-.672 2.219l-.656.984A4 4 0 0 0 7 10.212V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.789a4 4 0 0 0-.672-2.219l-.656-.984A4 4 0 0 1 15 4.788V2", "M7 15a6.472 6.472 0 0 1 5 0 6.47 6.47 0 0 0 5 0"],
  jar: ["M10 2v5.632c0 .424-.272.795-.653.982A6 6 0 0 0 6 14c.006 4 3 7 5 8", "M10 5H8a2 2 0 0 0 0 4h.68", "M14 2v5.632c0 .424.272.795.652.982A6 6 0 0 1 18 14c0 4-3 7-5 8", "M14 5h2a2 2 0 0 1 0 4h-.68", "M18 22H6", "M9 2h6"],
  sandwich: ["m2.37 11.223 8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777", "M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25", "M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9", "m6.67 15 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2", "M3 11h18a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z"],
  utensils: ["M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2", "M7 2v20", "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"],
  heart: ["M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"],
  stamp: ["M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13", "M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z", "M5 22h14"],
  bookmark: ["M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"],
};
// 상태 표시: 화면(MyTable.tsx)과 같은 아이콘 · 색
const BADGE: Record<string, { icon: IconName; color: string }> = { liked: { icon: "heart", color: C.brand }, tried: { icon: "stamp", color: C.brand }, saved: { icon: "bookmark", color: C.ink } };

/** (cx, cy) 가운데에 size 크기로 라인 아이콘. 선 굵기는 24 단위 기준 (화면의 strokeWidth 와 같은 값) */
function drawIcon(g: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, size: number, color: string, stroke = 2) {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.utensils!;
  const k = size / 24;
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(k, k);
  g.strokeStyle = color;
  g.lineWidth = stroke;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const d of paths) g.stroke(new Path2D(d));
  g.restore();
}

export async function drawTableCard(d: { plates: TablePlate[]; countries: number; foods: number }): Promise<Blob> {
  const serif = family("--font-fraunces", "Georgia, serif");
  const sans = `"Pretendard Variable", Pretendard, ${family("--font-inter", "sans-serif")}, sans-serif`;
  const flagFont = `"Twemoji Country Flags", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  await Promise.all([
    document.fonts.load(`800 80px ${serif}`),
    document.fonts.load(`700 60px ${sans}`, "식탁"),
    document.fonts.load(`80px ${flagFont}`, d.plates.find((p) => p.flag)?.flag ?? "🇰🇷"),
  ]).catch(() => {});

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  // 바탕: 옅은 초록 + 연두·리프 안개 (화면 body 와 같은 결)
  g.fillStyle = C.canvas;
  g.fillRect(0, 0, W, H);
  for (const [x, y, rad, col] of [
    [W, -60, 760, "rgba(200,240,106,0.32)"],
    [-120, 60, 640, "rgba(61,208,95,0.14)"],
  ] as const) {
    const mist = g.createRadialGradient(x, y, 0, x, y, rad);
    mist.addColorStop(0, col);
    mist.addColorStop(1, "rgba(245,249,242,0)");
    g.fillStyle = mist;
    g.fillRect(0, 0, W, H);
  }

  // 머리: 워드마크 + My Table 알약 + 숫자
  g.textBaseline = "alphabetic";
  g.font = `800 64px ${serif}`;
  g.fillStyle = C.ink;
  g.fillText("FOOD", 88, 132);
  const fw = g.measureText("FOOD").width;
  g.fillStyle = C.leaf;
  g.fillText("IS", 88 + fw, 132);
  g.font = `700 30px ${sans}`;
  const tag = "My Table";
  const tw = g.measureText(tag).width;
  const pill = { w: tw + 44 + 40, h: 60 };
  const px = W - 88 - pill.w;
  g.fillStyle = C.lime;
  roundRect(g, px, 84, pill.w, pill.h, pill.h / 2);
  g.fill();
  drawIcon(g, "utensils", px + 22 + 15, 84 + pill.h / 2, 30, C.onLime, 2);
  g.fillStyle = C.onLime;
  g.textBaseline = "middle";
  g.fillText(tag, px + 22 + 40, 84 + pill.h / 2 + 1);
  g.textBaseline = "alphabetic";
  g.font = `700 60px ${sans}`;
  g.fillStyle = C.ink;
  g.fillText(d.foods ? `${d.countries}개국 · ${d.foods}개 음식이` : "아직 빈 식탁이에요", 88, 222);
  g.font = `500 36px ${sans}`;
  g.fillStyle = C.muted;
  g.fillText(d.foods ? "나의 식탁에 차려졌어요" : "푸디와 첫 음식을 찾아볼게요", 88, 272);

  // 식탁: 원목 + 가운데 리넨 러너 (일러스트라 고유 색)
  const T = { x: 72, y: 316, w: W - 144, h: 860 };
  g.save();
  g.shadowColor = "rgba(40,60,30,0.28)";
  g.shadowBlur = 44;
  g.shadowOffsetY = 20;
  const wood = g.createLinearGradient(T.x, 0, T.x + T.w, 0);
  ["#A8703F", "#BA804B", "#AD7442", "#C08851", "#A56D3D"].forEach((c, i, a) => wood.addColorStop(i / (a.length - 1), c));
  g.fillStyle = wood;
  roundRect(g, T.x, T.y, T.w, T.h, 56);
  g.fill();
  g.restore();
  g.save();
  roundRect(g, T.x, T.y, T.w, T.h, 56);
  g.clip();
  // 나뭇결: 고정된 의사 난수(매번 같은 그림)로 세로 줄
  for (let i = 0, s = 7; i < 90; i++) {
    s = (s * 9301 + 49297) % 233280;
    const x = T.x + (s / 233280) * T.w;
    g.fillStyle = i % 3 ? "rgba(70,35,10,0.07)" : "rgba(255,240,220,0.06)";
    g.fillRect(x, T.y, 1 + (i % 4), T.h);
  }
  const rw = T.w * 0.34;
  g.fillStyle = "#F1ECDD";
  g.fillRect(T.x + (T.w - rw) / 2, T.y, rw, T.h);
  g.strokeStyle = "#D8CDB0";
  g.lineWidth = 3;
  g.setLineDash([12, 10]);
  for (const x of [T.x + (T.w - rw) / 2 + 14, T.x + (T.w + rw) / 2 - 14]) {
    g.beginPath();
    g.moveTo(x, T.y);
    g.lineTo(x, T.y + T.h);
    g.stroke();
  }
  g.setLineDash([]);
  g.restore();
  g.strokeStyle = "rgba(80,45,20,0.32)";
  g.lineWidth = 8;
  roundRect(g, T.x + 4, T.y + 4, T.w - 8, T.h - 8, 52);
  g.stroke();

  // 접시
  const pad = 44;
  const ghosts = !d.plates.length;
  const lay = tableLayout(ghosts ? 3 : d.plates.length, T.w - pad * 2, T.h - pad * 2);
  const { r } = lay;
  g.textAlign = "center";
  g.textBaseline = "middle";
  lay.plates.forEach((pt, i) => {
    const x = T.x + pad + pt.x;
    const y = T.y + pad + pt.y;
    if (ghosts) {
      g.strokeStyle = "rgba(255,255,255,0.7)";
      g.lineWidth = 4;
      g.setLineDash([14, 12]);
      g.beginPath();
      g.arc(x, y, r * 0.92, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      return;
    }
    const p = d.plates[i];
    // 테두리(흰 자기 접시, 옅은 초록 기운) + 그림자
    g.save();
    g.shadowColor = "rgba(40,35,15,0.38)";
    g.shadowBlur = r * 0.35;
    g.shadowOffsetY = r * 0.12;
    const rim = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    rim.addColorStop(0, C.surface);
    rim.addColorStop(0.75, "#F3F6EF");
    rim.addColorStop(1, "#DCE3D6");
    g.fillStyle = rim;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // 대륙 띠
    if (p.continent && CONTINENT_COLOR[p.continent]) {
      g.strokeStyle = CONTINENT_COLOR[p.continent];
      g.lineWidth = Math.max(3, r * 0.06);
      g.beginPath();
      g.arc(x, y, r * 0.84, 0, Math.PI * 2);
      g.stroke();
    }
    // 안쪽: 국가색 + 흰 음식 모양 (밝은 국가색에서도 보이게 옅은 그늘)
    const inner = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r * 0.72);
    inner.addColorStop(0, `${p.accent}99`);
    inner.addColorStop(1, p.accent);
    g.fillStyle = inner;
    g.beginPath();
    g.arc(x, y, r * 0.72, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.shadowColor = "rgba(11,26,16,0.35)";
    g.shadowBlur = r * 0.08;
    g.shadowOffsetY = r * 0.02;
    drawIcon(g, p.icon, x, y, r * 0.66, C.surface, 2);
    g.restore();
    // 국기: 접시 왼쪽 아래 (모르면 생략) / 상태: 오른쪽 위 흰 원 + 라인 아이콘
    if (p.flag) {
      g.font = `${Math.round(r * 0.5)}px ${flagFont}`;
      g.fillText(p.flag, x - r * 0.62, y + r * 0.66);
    }
    const badges = p.statuses.filter((s) => BADGE[s]);
    badges.forEach((s, k) => {
      const bx = x + r * 0.72 - k * r * 0.42;
      const by = y - r * 0.72;
      g.save();
      g.shadowColor = "rgba(11,26,16,0.25)";
      g.shadowBlur = r * 0.08;
      g.shadowOffsetY = r * 0.02;
      g.fillStyle = C.surface;
      g.beginPath();
      g.arc(bx, by, r * 0.24, 0, Math.PI * 2);
      g.fill();
      g.restore();
      drawIcon(g, BADGE[s].icon, bx, by, r * 0.3, BADGE[s].color, 2.25);
    });
  });

  // 대륙 범례
  const cont = [...new Set(d.plates.map((p) => p.continent).filter((c): c is string => !!c && !!CONTINENT_COLOR[c]))];
  g.textAlign = "left";
  g.font = `500 28px ${sans}`;
  let lx = 88;
  for (const c of cont) {
    g.fillStyle = CONTINENT_COLOR[c];
    g.beginPath();
    g.arc(lx + 10, 1222, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.ink;
    g.fillText(CONTINENT_LABEL[c], lx + 28, 1224);
    lx += 28 + g.measureText(CONTINENT_LABEL[c]).width + 34;
  }

  // 하단: 슬로건(영문 한 단어만 세리프 이탤릭) + 푸디 한마디
  g.textBaseline = "alphabetic";
  g.fillStyle = C.line;
  g.fillRect(88, 1252, W - 176, 2);
  g.font = `600 32px ${sans}`;
  g.fillStyle = C.ink;
  const lead = "Different Cultures, One ";
  g.fillText(lead, 88, 1302);
  const lw = g.measureText(lead).width;
  g.font = `italic 600 36px ${serif}`;
  g.fillStyle = C.brand;
  g.fillText("Table.", 88 + lw, 1302);
  g.textAlign = "right";
  g.font = `500 30px ${sans}`;
  g.fillStyle = C.muted;
  g.fillText("푸디야, 다음은 어디로?", W - 88, 1302);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("이미지를 만들지 못했어요"))), "image/png"));
}
