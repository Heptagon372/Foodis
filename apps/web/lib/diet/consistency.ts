// 식이 값 자기모순 검사 (docs/design/19 §2). 1만 개 정리본에는 "비건 yes"인데 재료에 우유·버터·치즈·꿀이 있는 음식,
// "채식 yes"인데 햄·생선이 있는 음식이 있다(2026-10-07 실측, 문서 표 참고). DB 가 스스로 모순이면 푸디는 '된다'고 단정하지 않는다:
// yes → depends 로 낮춰 "조리법에 따라 달라요, 확인해 주세요"로 말하게 한다 (03 문서 정직한 불확실성). 데이터 자체는 어드민에서 고친다.
import type { DietKey, DietLevel } from "@/lib/foodi/schema";

/** 재료 이름을 나눈 낱말 하나가 이 모양이면 동물성 (비건 아님) */
const ANIMAL = /^(?:.*우유|.*버터|.*달걀|.*계란|.*치즈|.*크림|.*요구르트|.*요거트|.*꿀|연유|유청|기|마요네즈|.*노른자|.*흰자|난황|.*밀크)$/;
/** 고기·생선 (채식 아님) */
const FLESH = /^(?:.*고기|.*생선|.*새우|멸치.*|.*젓갈|.*액젓|피시소스|베이컨|.*햄|소시지|소세지|오징어.*|.*조개.*|굴|.*참치|.*연어|어묵|젤라틴|라드|.*육수|닭.*|차슈|돼지.*|.*갈비|.*곱창)$/;
/** 이름에 이런 말이 있으면 식물성 대체품이다 (땅콩버터 · 코코넛 밀크 · 콩고기 · 채소 육수 …) */
const PLANT = /땅콩|코코아|카카오|시어|코코넛|두유|아몬드|귀리|쌀\s*우유|오트|식물성|비건|대두|콩\s*(?:고기|우유)|밀고기|버섯|채소\s*육수|야채\s*육수|다시마/;

const words = (name: string) => name.split(/[\s·,()/]+/).filter(Boolean);
export const isAnimalIngredient = (name: string) => !PLANT.test(name) && words(name).some((w) => ANIMAL.test(w) || FLESH.test(w));
export const isFleshIngredient = (name: string) => !PLANT.test(name) && words(name).some((w) => FLESH.test(w));

export type DietCheck = { diet: Record<DietKey, DietLevel>; downgraded: DietKey[] };

export function checkDiet(diet: Record<DietKey, DietLevel>, ingredientNames: readonly string[]): DietCheck {
  const out = { ...diet };
  const downgraded: DietKey[] = [];
  if (out.vegetarian === "yes" && ingredientNames.some(isFleshIngredient)) {
    out.vegetarian = "depends";
    downgraded.push("vegetarian");
  }
  if (out.vegan === "yes" && ingredientNames.some(isAnimalIngredient)) {
    out.vegan = "depends";
    downgraded.push("vegan");
  }
  return { diet: out, downgraded };
}
