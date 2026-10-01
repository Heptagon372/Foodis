// Passport 요약·답변 (03 문서 #7). 순수 함수 — 서버 파이프라인과 오프라인 데모(클라이언트) 양쪽에서 쓴다.
import { josa } from "./generate";
import { CONTINENT_WORDS } from "./intent";
import type { CountryRow, UserContext } from "./repo";
import type { GenerateOutput, PassportSummary } from "./schema";

export function passportSummary(ctx: UserContext, countries: CountryRow[]): PassportSummary {
  return {
    countries: ctx.exploredCountries.length,
    foods: ctx.exploredFoodIds.length,
    by_continent: CONTINENT_WORDS.map(([, key, label]) => {
      const all = countries.filter((c) => c.continent_group === key);
      return { key, label, total: all.length, done: all.filter((c) => ctx.exploredCountries.includes(c.code)).length };
    }),
  };
}

export function passportAnswer(p: PassportSummary): GenerateOutput {
  if (p.countries === 0) return { speech: "아직 탐험한 나라가 없어요. 첫 번째 여행지를 같이 골라볼까요?", picks: [], follow_ups: ["오늘의 음식 추천", "음식 문화 이야기 들려줘"] };
  const ratio = (c: PassportSummary["by_continent"][number]) => (c.total ? c.done / c.total : 1);
  const most = [...p.by_continent].sort((a, b) => b.done - a.done)[0];
  const least = [...p.by_continent].sort((a, b) => ratio(a) - ratio(b))[0];
  const foods = p.foods ? `, ${p.foods}가지 음식` : "";
  const tail = least.done === 0 ? `${josa(least.label, "은는")} 아직 시작 전이에요.` : `${josa(least.label, "은는")} 아직 ${least.done}개 나라예요.`;
  return {
    speech: `지금까지 ${josa(`${p.countries}개 나라${foods}`, "을를")} 탐험했어요. ${most.label} 쪽이 가장 많고, ${tail} 다음엔 ${josa(least.label, "으로")} 가볼까요?`,
    picks: [],
    follow_ups: [`${least.label} 음식 추천해줘`, "내 패스포트 보기"],
  };
}
