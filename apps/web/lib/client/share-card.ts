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
const C = { green: "#1F5F46", greenDark: "#164634", mint: "#7FD1AE", ivory: "#FBF8F1", soft: "#CFE6DB" };

function family(varName: string, fallback: string) {
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(varName).trim() : "";
  return v || fallback;
}

export async function drawShareCard(d: ShareCardData): Promise<Blob> {
  const serif = family("--font-fraunces", "Georgia, serif");
  const sans = `"Pretendard Variable", Pretendard, ${family("--font-inter", "sans-serif")}, sans-serif`;
  const flagFont = `"Twemoji Country Flags", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  // 글꼴이 늦게 와도 카드가 기본 글꼴로 그려지지 않게 먼저 불러 둔다
  await Promise.all([
    document.fonts.load(`800 120px ${serif}`),
    document.fonts.load(`700 60px ${sans}`, "탐험"),
    document.fonts.load(`80px ${flagFont}`, d.countries[0]?.flag ?? "🇰🇷"),
  ]).catch(() => {});

  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;

  const bg = g.createRadialGradient(W * 0.85, H * 0.1, 50, W * 0.5, H * 0.5, H);
  bg.addColorStop(0, "#2E7A5C");
  bg.addColorStop(0.5, C.green);
  bg.addColorStop(1, C.greenDark);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // 워드마크
  g.textBaseline = "alphabetic";
  g.font = `800 92px ${serif}`;
  g.fillStyle = C.ivory;
  g.fillText("FOOD", 88, 170);
  const w = g.measureText("FOOD").width;
  g.fillStyle = C.mint;
  g.fillText("IS", 88 + w, 170);
  g.font = `500 30px ${sans}`;
  g.fillStyle = C.soft;
  g.fillText("나의 Food Passport", 92, 222);

  // 큰 숫자
  g.font = `800 230px ${serif}`;
  g.fillStyle = C.ivory;
  const n = String(d.countries.length);
  g.fillText(n, 82, 470);
  const nw = g.measureText(n).width;
  g.font = `700 76px ${sans}`;
  g.fillText("개국", 100 + nw, 465);
  g.font = `500 44px ${sans}`;
  g.fillStyle = C.soft;
  g.fillText(`${d.foodCount}가지 음식을 탐험했어요`, 92, 545);

  // 국기 그리드 (최대 30): 적으면 크게 4열, 많으면 5·6열 — 가운데가 비지 않게
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
    g.fillStyle = "rgba(251,248,241,0.08)";
    roundRect(g, x - tile.w / 2, y - tile.h / 2, tile.w, tile.h, 24);
    g.fill();
    g.font = `${flagPx}px ${flagFont}`;
    g.fillStyle = C.ivory;
    g.fillText(c.flag, x, y + flagPx * 0.06);
  });
  if (!flags.length) {
    g.font = `500 40px ${sans}`;
    g.fillStyle = C.soft;
    g.fillText("첫 번째 나라를 기다리는 중", W / 2, gy + 80);
  }

  // Food DNA
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  const tags = d.topTags.slice(0, 3).map((t) => TASTE_LABEL[t] ?? t);
  if (tags.length) {
    g.font = `500 32px ${sans}`;
    g.fillStyle = C.mint;
    g.fillText("FOOD DNA", 92, 1150);
    g.font = `700 46px ${sans}`;
    g.fillStyle = C.ivory;
    g.fillText(`${tags.join(" · ")} 쪽으로 끌리는 탐험가`, 92, 1210);
  }

  // 하단
  g.fillStyle = "rgba(251,248,241,0.25)";
  g.fillRect(92, 1252, W - 184, 2);
  g.font = `italic 600 34px ${serif}`;
  g.fillStyle = C.soft;
  g.fillText("Different Cultures, One Table.", 92, 1302);
  g.textAlign = "right";
  g.font = `500 30px ${sans}`;
  g.fillText("푸디야, 다음은 어디로?", W - 92, 1302);

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("이미지를 만들지 못했어요"))), "image/png"));
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 휴대폰: 공유 시트(파일 공유 지원 시) · 그 외: 내려받기 */
export async function shareOrDownload(blob: Blob, countries: number): Promise<"shared" | "downloaded"> {
  const file = new File([blob], `foodis-passport-${countries}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "나의 Food Passport", text: `${countries}개국 음식을 탐험했어요 — FOODIS` });
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
