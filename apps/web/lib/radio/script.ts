// Food Culture Radio (F-VOI-05) 대본. LLM 없이 검수된 DB 필드(요약·유래·역사·문화)만 이어 붙인다 —
// 라디오는 길게 말하는 만큼 틀린 말을 할 여지가 크므로, 생성하지 않고 "읽기"만 한다 (11 문서 할루시네이션 원칙).
import type { RelationType } from "@/lib/content/types";

export type RadioFood = {
  id: string;
  slug: string;
  name_ko: string;
  country_name: string;
  country_code: string;
  flag: string;
  accent: string;
  image_url: string | null;
  image_credit: string | null;
  taste_tags: string[];
  summary: string | null;
  origin_note: string | null;
  history: string | null;
  culture_story: string | null;
};

export type Bridge = { kind: "relation"; type: RelationType; description: string } | { kind: "jump" };
export type Segment = { kind: "open" | "summary" | "origin" | "history" | "culture" | "bridge" | "close"; text: string };
export type Episode = { food: RadioFood; segments: Segment[]; /** 다음 에피소드로 넘어가는 이유 (없으면 마지막) */ next?: { bridge: Bridge; name_ko: string; flag: string } };

/** TTS 1회 한도(/api/foodi/tts 600자)보다 짧게 — 세그먼트 단위로 음성을 만든다 */
export const SEGMENT_MAX = 560;

/** 받침 유무로 조사 고르기 (generate.ts josa 와 같은 규칙, 라디오 전용 최소판) */
function hasBatchim(word: string) {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return /[136780lmnr]$/i.test(word.trim());
}
const iGa = (w: string) => `${w}${hasBatchim(w) ? "이" : "가"}`;
const eRo = (w: string) => {
  const c = w.trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return `${w}${hasBatchim(w) ? "으로" : "로"}`;
  const jong = (c - 0xac00) % 28;
  return `${w}${jong === 0 || jong === 8 ? "로" : "으로"}`; // ㄹ 받침은 "로"
};

/** 문장 단위 자막 */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?。…]+[.!?。…]*["”’)]*\s*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/** 긴 필드는 문장 경계에서 잘라 SEGMENT_MAX 이하로 */
function split(kind: Segment["kind"], text: string): Segment[] {
  const out: Segment[] = [];
  let buf = "";
  for (const s of sentences(text)) {
    if (buf && (buf + " " + s).length > SEGMENT_MAX) {
      out.push({ kind, text: buf });
      buf = s;
    } else buf = buf ? `${buf} ${s}` : s;
  }
  if (buf) out.push({ kind, text: buf.slice(0, SEGMENT_MAX) });
  return out;
}

const clean = (t: string | null) => (t ?? "").replace(/\s+/g, " ").trim();

export function buildEpisode(food: RadioFood, opts: { first: boolean; next?: { food: Pick<RadioFood, "name_ko" | "country_name" | "flag">; bridge: Bridge } }): Episode {
  const segs: Segment[] = [];
  const opener = `${opts.first ? "푸디 라디오예요. " : ""}${food.country_name}에서 온 이야기, ${food.name_ko}.`;
  segs.push({ kind: "open", text: opener });
  if (clean(food.summary)) segs.push(...split("summary", clean(food.summary)));
  // 유래는 "여러 설이 있어요" 같은 불확실성 문구를 그대로 읽는다
  if (clean(food.origin_note)) segs.push(...split("origin", clean(food.origin_note)));
  if (clean(food.history)) segs.push(...split("history", clean(food.history)));
  if (clean(food.culture_story)) segs.push(...split("culture", clean(food.culture_story)));

  const n = opts.next;
  if (n) {
    const text = n.bridge.kind === "relation" ? bridgeText(n.food, n.bridge) : `이번엔 멀리 ${eRo(n.food.country_name)} 떠나 볼게요. ${n.food.name_ko} 이야기예요.`;
    segs.push({ kind: "bridge", text });
  } else {
    segs.push({ kind: "close", text: "오늘 라디오는 여기까지예요. 궁금한 음식이 생기면 푸디에게 물어봐 주세요." });
  }
  return { food, segments: segs, next: n ? { bridge: n.bridge, name_ko: n.food.name_ko, flag: n.food.flag } : undefined };
}

function bridgeText(next: Pick<RadioFood, "name_ko" | "country_name">, b: Extract<Bridge, { kind: "relation" }>): string {
  const desc = clean(b.description).replace(/[.。]$/, "");
  const why = desc ? ` ${desc}.` : "";
  switch (b.type) {
    case "historical_link":
      return `이 이야기는 ${next.country_name}의 ${iGa(next.name_ko)} 이어받아요.${why}`;
    case "regional_variant":
      return `같은 음식이 ${next.country_name}에서는 ${next.name_ko}${hasBatchim(next.name_ko) ? "이" : ""}라는 모습이 돼요.${why}`;
    case "shares_ingredient":
      return `같은 재료를 따라 ${next.country_name}의 ${eRo(next.name_ko)} 가 볼게요.${why}`;
    case "same_technique":
      return `같은 조리법을 쓰는 ${next.country_name}의 ${eRo(next.name_ko)} 이어 갈게요.${why}`;
    default:
      return `비슷한 맛을 따라 ${next.country_name}의 ${eRo(next.name_ko)} 넘어가 볼게요.${why}`;
  }
}

/** 한국어 낭독 속도 ≈ 초당 6.5자 — 진행 표시·"약 1분" 안내용 */
export const estimateSeconds = (e: Episode) => Math.round(e.segments.reduce((a, s) => a + s.text.length, 0) / 6.5);
