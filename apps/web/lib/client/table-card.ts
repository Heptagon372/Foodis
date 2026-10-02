"use client";
// My Table 이미지 (F-REC-04) — 공유 카드(share-card.ts)와 같은 브라우저 canvas 방식, 1080×1350.
// 음식 사진은 그리지 않는다: 위키미디어 이미지는 CORS 헤더가 없어 canvas 가 오염(toBlob 실패)되고, 사진마다 출처 표기도 필요하다.
// 대신 국가색 접시 + 음식 모양 + 국기로 그린다.
import { CONTINENT_COLOR, CONTINENT_LABEL, tableLayout, type TablePlate } from "@/lib/table/my-table";
import { family, roundRect } from "./share-card";

const W = 1080;
const H = 1350;
const C = { green: "#1F5F46", mint: "#5FBF96", ivory: "#FBF8F1", charcoal: "#2B2B2B", muted: "#7A7A72", line: "#EBE6DA" };
const BADGE: Record<string, string> = { liked: "❤️", tried: "📕", saved: "🔖" };

export async function drawTableCard(d: { plates: TablePlate[]; countries: number; foods: number }): Promise<Blob> {
  const serif = family("--font-fraunces", "Georgia, serif");
  const sans = `"Pretendard Variable", Pretendard, ${family("--font-inter", "sans-serif")}, sans-serif`;
  const flagFont = `"Twemoji Country Flags", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  const emoji = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  await Promise.all([
    document.fonts.load(`800 80px ${serif}`),
    document.fonts.load(`700 60px ${sans}`, "식탁"),
    document.fonts.load(`80px ${flagFont}`, d.plates[0]?.flag ?? "🇰🇷"),
  ]).catch(() => {});

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = C.ivory;
  g.fillRect(0, 0, W, H);

  // 머리: 워드마크 + 숫자
  g.textBaseline = "alphabetic";
  g.font = `800 64px ${serif}`;
  g.fillStyle = C.green;
  g.fillText("FOOD", 88, 132);
  const fw = g.measureText("FOOD").width;
  g.fillStyle = C.mint;
  g.fillText("IS", 88 + fw, 132);
  g.font = `italic 600 34px ${serif}`;
  g.fillStyle = C.muted;
  g.textAlign = "right";
  g.fillText("My Table", W - 88, 128);
  g.textAlign = "left";
  g.font = `700 60px ${sans}`;
  g.fillStyle = C.charcoal;
  g.fillText(d.foods ? `${d.countries}개국 · ${d.foods}개 음식이` : "아직 빈 식탁이에요", 88, 222);
  g.font = `500 36px ${sans}`;
  g.fillStyle = C.muted;
  g.fillText(d.foods ? "나의 식탁에 차려졌어요" : "푸디와 첫 음식을 찾아볼게요", 88, 272);

  // 식탁: 원목 + 가운데 리넨 러너
  const T = { x: 72, y: 316, w: W - 144, h: 860 };
  g.save();
  g.shadowColor = "rgba(70,40,15,0.35)";
  g.shadowBlur = 40;
  g.shadowOffsetY = 18;
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
  g.fillStyle = "#EFE6D2";
  g.fillRect(T.x + (T.w - rw) / 2, T.y, rw, T.h);
  g.strokeStyle = "#D6C6A6";
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
  g.strokeStyle = "rgba(80,45,20,0.35)";
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
      g.strokeStyle = "rgba(251,248,241,0.7)";
      g.lineWidth = 4;
      g.setLineDash([14, 12]);
      g.beginPath();
      g.arc(x, y, r * 0.92, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      return;
    }
    const p = d.plates[i];
    // 테두리(흰 접시) + 그림자
    g.save();
    g.shadowColor = "rgba(60,35,15,0.4)";
    g.shadowBlur = r * 0.35;
    g.shadowOffsetY = r * 0.12;
    const rim = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    rim.addColorStop(0, "#FFFFFF");
    rim.addColorStop(0.75, "#F4EFE4");
    rim.addColorStop(1, "#E3DBCB");
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
    // 안쪽: 국가색
    const inner = g.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r * 0.72);
    inner.addColorStop(0, `${p.accent}99`);
    inner.addColorStop(1, p.accent);
    g.fillStyle = inner;
    g.beginPath();
    g.arc(x, y, r * 0.72, 0, Math.PI * 2);
    g.fill();
    g.font = `${Math.round(r * 0.7)}px ${emoji}`;
    g.fillText(p.glyph, x, y + r * 0.04);
    // 국기: 접시 왼쪽 아래 / 상태: 오른쪽 위
    g.font = `${Math.round(r * 0.5)}px ${flagFont}`;
    g.fillText(p.flag, x - r * 0.62, y + r * 0.66);
    const badges = p.statuses.filter((s) => BADGE[s]);
    badges.forEach((s, k) => {
      const bx = x + r * 0.72 - k * r * 0.42;
      const by = y - r * 0.72;
      g.fillStyle = "#FFFFFF";
      g.beginPath();
      g.arc(bx, by, r * 0.24, 0, Math.PI * 2);
      g.fill();
      g.font = `${Math.round(r * 0.28)}px ${emoji}`;
      g.fillText(BADGE[s], bx, by + r * 0.02);
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
    g.fillStyle = C.charcoal;
    g.fillText(CONTINENT_LABEL[c], lx + 28, 1224);
    lx += 28 + g.measureText(CONTINENT_LABEL[c]).width + 34;
  }

  // 하단
  g.textBaseline = "alphabetic";
  g.fillStyle = C.line;
  g.fillRect(88, 1252, W - 176, 2);
  g.font = `italic 600 34px ${serif}`;
  g.fillStyle = C.green;
  g.fillText("Different Cultures, One Table.", 88, 1302);
  g.textAlign = "right";
  g.font = `500 30px ${sans}`;
  g.fillStyle = C.muted;
  g.fillText("푸디야, 다음은 어디로?", W - 88, 1302);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("이미지를 만들지 못했어요"))), "image/png"));
}
