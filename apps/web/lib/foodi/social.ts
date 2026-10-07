// 사회적 대화 층 (docs/design/24 §K): 인사·감사·작별·안부·"너 누구야"·"뭐 할 수 있어"·기분 — 음식 질문이 아닌 가벼운 말에
// LLM 없이, 사실 없이, 이름·시간·탐험 기록(DB 값)만으로 사람처럼 답하고 음식 탐험으로 자연스럽게 이끈다.
// 발화 전체가 사회적 표현일 때만 잡는다 — "안녕 푸디야, 오늘 뭐 먹지?"는 인사가 아니라 추천 질문이다.
import type { GenerateOutput } from "./schema";

export type SocialKind = "greet" | "how_are_you" | "thanks" | "compliment" | "bye" | "who" | "can" | "mood" | "chat";

/** 호출어·문장부호·공백을 뺀 뼈대 ("안녕, 푸디야!" → "안녕") */
export const socialKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/푸디\s*(야|님|씨|아)?|foodi/g, "")
    .replace(/[\s?!.,~…'"^♡♥]+/g, "")
    // 끝의 높임 "요"는 뗀다 ("안녕하세요" → "안녕하세", "고마워요" → "고마워")
    .replace(/(요|용)$/, "");

const PATTERNS: [RegExp, SocialKind][] = [
  [/^(안녕|안녕하세|안녕하십니까|하이|헬로|hello|hi|hey|반가워|반갑습니다|반갑|좋은아침|굿모닝|굿이브닝|오랜만|오랜만이야|오랜만이네|나왔어|나야|왔어|저왔어|나왔어|있어\?*|거기있어|듣고있어)$/, "greet"],
  [/^(잘지냈어|잘지내|잘지냈니|잘지내셨어|잘있었어|기분어때|오늘기분어때|기분은어때|뭐해|뭐하고있어|뭐하니|밥먹었어|밥은먹었어|식사했어|괜찮아|잘지내지|컨디션어때)$/, "how_are_you"],
  [/^(고마워|고맙다|고맙습니다|고맙|감사|감사합니다|감사해|감사드려|땡큐|thanks|thankyou|thx|ty|덕분이야|도움됐어|도움이됐어)$/, "thanks"],
  [/^(?:너|넌|너는|너진짜|진짜|정말|완전|너무|역시)?(최고야|최고|최고다|잘했어|잘한다|멋져|멋지다|멋있어|대단해|대단하다|똑똑하네|똑똑해|똑똑하다|귀여워|귀엽다|사랑해|좋아해|짱|짱이야|천재|천재네|굿|good|nice|great|완벽해|훌륭해)$/, "compliment"],
  [/^(잘가|잘있어|안녕히계세|안녕히가세|바이|bye|byebye|굿바이|다음에봐|다음에또|나중에봐|나중에또|잘자|굿나잇|좋은밤|이만|갈게|나갈게|나간다|그만|그만할래|끝|오늘은여기까지|수고했어|수고)$/, "bye"],
  [/^(넌누구야|너누구야|너는누구야|누구세|누구야|누구니|너뭐야|너는뭐야|정체가뭐야|이름이뭐야|너이름뭐야|이름뭐야|자기소개|자기소개해|소개해|너에대해알려|너는뭐하는애야|너뭐하는애야|너사람이야|너ai야|너로봇이야|푸디가뭐야)$/, "who"],
  [/^(뭐할수있어|뭘할수있어|뭐해줄수있어|뭐물어볼수있어|뭐물어보면돼|뭘물어보면돼|어떻게써|어떻게쓰는거야|사용법|도움말|help|기능이뭐야|기능뭐있어|뭐할줄알아|뭐할줄아니|뭐도와줄수있어|뭐해줘|뭐할래|뭐하면돼|어떻게시작해)$/, "can"],
  [/^(심심해|심심하다|심심한데|지루해|지루하다|우울해|우울하다|힘들어|힘들다|피곤해|피곤하다|기분안좋아|기분이안좋아|슬퍼|슬프다|외로워|외롭다|짜증나|스트레스받아|답답해)$/, "mood"],
];

/** 발화 전체가 사회적 표현이면 그 종류, 아니면 null (음식·나라·조건이 섞인 말은 여기서 잡지 않는다) */
export function detectSocial(text: string): SocialKind | null {
  const k = socialKey(text);
  if (!k || k.length > 20) return null;
  for (const [re, kind] of PATTERNS) if (re.test(k)) return kind;
  return null;
}

export type SocialContext = {
  /** profiles.display_name — 없으면 "사용자" */
  displayName?: string | null;
  exploredCountries: number;
  /** 지도의 나라 수 (countries 테이블) — "너 누구야" 답의 숫자는 DB 값으로 */
  countryCount?: number;
  /** 서버 시각 (ms). 인사말의 아침·점심·저녁은 한국 시간 기준 */
  now: number;
  /** 같은 날·같은 사람은 같은 문장 (답이 흔들리지 않게), 날이 바뀌면 다른 문장 */
  seed: string;
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const pick = <T,>(xs: readonly T[], seed: string) => xs[hash(seed) % xs.length];

export const kstHour = (ms: number) => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(ms))) % 24;

const timeOpener = (h: number) => (h >= 5 && h < 11 ? "좋은 아침이에요" : h >= 11 && h < 14 ? "점심은 드셨어요" : h >= 17 && h < 21 ? "좋은 저녁이에요" : h >= 21 || h < 5 ? "늦은 시간까지 반가워요" : "반가워요");

const FOLLOW = { today: "오늘의 음식 추천", story: "음식 문화 이야기 들려줘", passport: "나 몇 나라 탐험했어?", unexplored: "안 가본 나라 음식 추천", similar: "비슷한 음식 찾기" };

/** 이름 호칭: display_name 이 있으면 "{이름}님", 없으면 "사용자님" */
export const honorific = (name?: string | null) => `${(name ?? "").trim().slice(0, 20) || "사용자"}님`;

/** LLM 없이 만드는 사회적 답. 사실은 DB 값(탐험 나라 수)만, 나머지는 페르소나 문장 */
export function socialAnswer(kind: SocialKind, c: SocialContext): GenerateOutput {
  const you = honorific(c.displayName);
  const n = c.exploredCountries;
  const explored = n > 0 ? `지금까지 ${n}개 나라를 탐험하셨네요.` : "";
  const invite = n > 0 ? "오늘은 새로운 나라로 떠나볼까요?" : "오늘은 어느 나라로 떠나볼까요?";
  const nextUp = n > 0 ? [FOLLOW.unexplored, FOLLOW.story, FOLLOW.passport] : [FOLLOW.today, FOLLOW.story];
  const s = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

  switch (kind) {
    case "greet":
      return {
        speech: s([`안녕하세요, ${you}!`, pick([`세계 음식 탐험 친구 푸디예요.`, `${timeOpener(kstHour(c.now))}, 푸디예요.`, `다시 만나서 반가워요.`], `${c.seed}:greet`), explored, invite]),
        picks: [],
        follow_ups: nextUp,
      };
    case "how_are_you":
      return {
        speech: s([pick([`저는 오늘도 세계 음식 이야기를 들려드릴 생각에 신이 나요.`, `저야 늘 배고픈 탐험가죠, ${you}은 어떠세요?`, `덕분에 잘 지내요, ${you}!`], `${c.seed}:how`), invite]),
        picks: [],
        follow_ups: nextUp,
      };
    case "thanks":
      return {
        speech: s([pick([`별말씀을요, ${you}!`, `도움이 됐다니 기뻐요, ${you}.`, `제가 더 고마워요.`], `${c.seed}:thanks`), `다음 탐험도 함께해요.`, n > 0 ? "" : "오늘의 음식 하나 더 추천해 드릴까요?"]),
        picks: [],
        follow_ups: [FOLLOW.today, FOLLOW.story],
      };
    case "compliment":
      return {
        speech: s([pick([`고마워요, ${you}! 칭찬 들으니 더 신나요.`, `${you} 덕분에 저도 매일 똑똑해져요.`, `헤헤, 쑥스럽네요.`], `${c.seed}:comp`), `그 기세로 새로운 나라 하나 더 가볼까요?`]),
        picks: [],
        follow_ups: nextUp,
      };
    case "bye":
      return {
        speech: s([pick([`안녕히 가세요, ${you}!`, `오늘도 즐거웠어요, ${you}.`, `다음에 또 만나요, ${you}!`], `${c.seed}:bye`), n > 0 ? `${n}개 나라 탐험 기록은 제가 잘 간직할게요.` : "다음엔 새로운 나라로 함께 떠나요.", "맛있는 하루 보내세요."]),
        picks: [],
        follow_ups: [FOLLOW.today, FOLLOW.passport],
      };
    case "who":
      return {
        speech: s([`저는 푸디예요. ${c.countryCount ? `세계 ${c.countryCount}개 나라` : "세계 곳곳"}의 음식과 문화를 함께 탐험하는 여행 친구죠.`, `음식 추천, 음식 이야기, 비슷한 음식 찾기, 식이 조건 확인까지 물어보실 수 있어요.`, invite]),
        picks: [],
        follow_ups: [FOLLOW.today, FOLLOW.story, FOLLOW.similar],
      };
    case "can":
      return {
        speech: s([
          `${you}, 이렇게 물어보실 수 있어요.`,
          `"오늘 뭐 먹지?"처럼 추천을 받거나, "비건 디저트 추천"처럼 조건을 걸거나, "김치는 어떤 음식이야?"처럼 설명을 듣거나, "비슷한 음식 있어?"로 세계의 닮은 음식을 찾을 수 있어요.`,
          `문화 이야기를 들려달라고 하셔도 좋아요.`,
        ]),
        picks: [],
        follow_ups: [FOLLOW.today, FOLLOW.story, FOLLOW.similar],
      };
    case "mood":
      return {
        speech: s([pick([`그럴 땐 낯선 나라의 음식 이야기가 작은 여행이 돼 줘요.`, `마음이 지칠 땐 따뜻한 한 그릇 이야기가 약이에요.`, `${you}, 그런 날도 있죠.`], `${c.seed}:mood`), `이야기 하나 들려드릴까요, 아니면 오늘의 음식을 골라드릴까요?`]),
        picks: [],
        follow_ups: [FOLLOW.story, FOLLOW.today],
      };
    default:
      return {
        speech: s([`${you}, 저는 세계 음식 이야기를 할 때 제일 신나요.`, invite]),
        picks: [],
        follow_ups: nextUp,
      };
  }
}
