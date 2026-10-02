"use client";
// Passport 공유 카드 (F-REC-03, 07 문서 성장 루프 "친구의 Passport 공유 카드 → 첫 방문").
// 서버 이미지 대신 브라우저 canvas 로 그린다: 게스트·오프라인에서도 되고, 앱과 같은 글꼴·국기 글꼴을 쓴다.
import { TASTE_LABEL } from "@/lib/content/types";

export type ShareCardData = {
  countries: { code: string; flag: string; name: string }[];
  foodCount: number;
  topTags: string[];
};

const W = 1080;
const H = 1350;
// 고정 라이트 팔레트 (디자인 v2 라이트 토큰과 같은 값): 공유 이미지는 받는 사람 화면의 테마와 무관하게 늘 밝게
const C = { canvas: "#F5F9F2", surface: "#FFFFFF", line: "#E0E9DC", ink: "#12261A", inkSoft: "#3D5244", muted: "#5F7164", brand: "#2B8645", leaf: "#25803F", lime: "#C8F06A", onLime: "#14301C" };

export function family(varName: string, fallback: string) {
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(varName).trim() : "";
  return v || fallback;
}

export async function drawShareCard(d: ShareCardData): Promise<Blob> {
  const serif = family("--font-fraunces", "Georgia, serif");
  const sans = `"Pretendard Variable", Pretendard, ${family("--font-inter", "sans-serif")}, sans-serif`;
  const flagFont = `"Twemoji Country Flags", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  // 글꼴이 늦게 와도 카드가 기본 글꼴로 그려지지 않게 먼저 불러 둔다
  await Promise.all([
    document.fonts.load(`800 92px ${serif}`),
    document.fonts.load(`800 230px ${sans}`, "0123456789"),
    document.fonts.load(`700 60px ${sans}`, "탐험"),
    document.fonts.load(`80px ${flagFont}`, d.countries[0]?.flag ?? "🇰🇷"),
  ]).catch(() => {});

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;

  // 바탕: 옅은 초록 + 오른쪽 위 연두 안개, 왼쪽 아래 초록 안개 (앱 바탕과 같은 결)
  g.fillStyle = C.canvas;
  g.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, color: string) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color);
    gr.addColorStop(1, "rgba(245,249,242,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  };
  glow(W * 0.95, H * 0.02, W * 0.85, "rgba(200,240,106,0.6)");
  glow(0, H, W * 0.9, "rgba(43,134,69,0.12)");

  // 워드마크
  g.textBaseline = "alphabetic";
  g.font = `800 92px ${serif}`;
  g.fillStyle = C.ink;
  g.fillText("FOOD", 88, 170);
  const w = g.measureText("FOOD").width;
  g.fillStyle = C.leaf;
  g.fillText("IS", 88 + w, 170);
  g.font = `500 30px ${sans}`;
  g.fillStyle = C.inkSoft;
  g.fillText("나의 Food Passport", 92, 222);

  // 큰 숫자 (레퍼런스 온실 대시보드처럼 숫자가 주인공)
  g.font = `800 230px ${sans}`;
  g.fillStyle = C.brand;
  const n = String(d.countries.length);
  g.fillText(n, 82, 470);
  const nw = g.measureText(n).width;
  g.font = `700 76px ${sans}`;
  g.fillStyle = C.ink;
  g.fillText("개국", 100 + nw, 465);
  g.font = `500 44px ${sans}`;
  g.fillStyle = C.inkSoft;
  g.fillText(`${d.foodCount}가지 음식을 탐험했어요`, 92, 545);

  // 국기 그리드 (최대 30): 적으면 크게 4열, 많으면 5·6열 — 가운데가 비지 않게. 칸은 흰 카드
  const flags = d.countries.slice(0, 30);
  const cols = flags.length <= 8 ? 4 : flags.length <= 15 ? 5 : 6;
  const cell = Math.floor((W - 184) / cols);
  const rowH = Math.round(cell * 0.78);
  const tile = { w: cell - 24, h: rowH - 18 };
  const flagPx = Math.round(tile.h * 0.62);
  const gx = 92;
  const gy = 610;
  g.textAlign = "center";
  g.textBaseline = "middle";
  flags.forEach((c, i) => {
    const x = gx + (i % cols) * cell + cell / 2;
    const y = gy + Math.floor(i / cols) * rowH + rowH / 2;
    g.save();
    g.shadowColor = "rgba(18,38,26,0.08)";
    g.shadowBlur = 24;
    g.shadowOffsetY = 8;
    g.fillStyle = C.surface;
    roundRect(g, x - tile.w / 2, y - tile.h / 2, tile.w, tile.h, 24);
    g.fill();
    g.restore();
    g.strokeStyle = C.line;
    g.lineWidth = 2;
    g.stroke();
    g.font = `${flagPx}px ${flagFont}`;
    g.fillStyle = C.ink;
    g.fillText(c.flag, x, y + flagPx * 0.06);
  });
  if (!flags.length) {
    g.font = `500 40px ${sans}`;
    g.fillStyle = C.muted;
    g.fillText("첫 번째 나라를 기다리는 중", W / 2, gy + 80);
  }

  // Food DNA: 연두 알약 라벨 + 진한 초록 글자
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  const tags = d.topTags.slice(0, 3).map((t) => TASTE_LABEL[t] ?? t);
  if (tags.length) {
    g.font = `700 28px ${sans}`;
    const label = "FOOD DNA";
    const lw = g.measureText(label).width;
    g.fillStyle = C.lime;
    roundRect(g, 92, 1112, lw + 44, 52, 26);
    g.fill();
    g.fillStyle = C.onLime;
    g.textBaseline = "middle";
    g.fillText(label, 114, 1139);
    g.textBaseline = "alphabetic";
    g.font = `700 46px ${sans}`;
    g.fillStyle = C.ink;
    g.fillText(`${tags.join(" · ")} 쪽으로 끌리는 탐험가`, 92, 1222);
  }

  // 하단
  g.fillStyle = C.line;
  g.fillRect(92, 1256, W - 184, 2);
  g.font = `italic 600 34px ${serif}`;
  g.fillStyle = C.leaf;
  g.fillText("Different Cultures, One Table.", 92, 1306);
  g.textAlign = "right";
  g.font = `500 30px ${sans}`;
  g.fillStyle = C.inkSoft;
  g.fillText("푸디야, 다음은 어디로?", W - 92, 1306);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("이미지를 만들지 못했어요"))), "image/png"));
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 휴대폰: 공유 시트(파일 공유 지원 시) · 그 외: 내려받기. meta 없으면 Passport 카드 (My Table 이 파일명·문구만 바꿔 쓴다) */
export async function shareOrDownload(blob: Blob, countries: number, meta?: { name: string; title: string; text: string }): Promise<"shared" | "downloaded"> {
  const m = meta ?? { name: `foodis-passport-${countries}.png`, title: "나의 Food Passport", text: `${countries}개국 음식을 탐험했어요 — FOODIS` };
  const file = new File([blob], m.name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: m.title, text: m.text });
      return "shared";
    } catch {
      /* 사용자가 취소하면 아래로 → 내려받기 */
    }
  }
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
