// 사진 인식(F-VIS-01) 방어선 테스트: 미리보기 DB + 각본대로 답하는 가짜 Vision LLM. 실제 모델 호출 없음.
import { describe, expect, it, vi } from "vitest";
import { previewRepo } from "@/lib/preview/source";
import { PREVIEW_FOODS, previewId } from "@/lib/preview/foods";
import { ProviderError, type LLMProvider, type Usage } from "@/lib/providers/types";
import { candidateList, checkImagePayload, NO_MATCH, pickCandidates, recognizeFood, VISION_MAX_BYTES, VisionBudgetError, type VisionOutput } from "./vision";

const id = (slug: string) => previewId(PREVIEW_FOODS.find((f) => f.slug === slug)!.n);
const usage: Usage = { provider: "fake", operation: "vision", units: 1500, unitType: "tokens", costUsd: 0.002 };

const jpeg = (size = 256) => {
  const b = Buffer.alloc(size, 7);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b.toString("base64");
};
const png = () => {
  const b = Buffer.alloc(128, 1);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return b.toString("base64");
};
const webp = () => {
  const b = Buffer.alloc(128, 2);
  b.write("RIFF", 0, "latin1");
  b.write("WEBP", 8, "latin1");
  return b.toString("base64");
};

describe("checkImagePayload — 크기·형식 검증", () => {
  it("JPEG·PNG·WebP base64 를 받고, data URL 접두사는 떼어낸다", () => {
    expect(checkImagePayload({ media_type: "image/jpeg", data: jpeg() })).toMatchObject({ ok: true, bytes: 256, image: { mediaType: "image/jpeg" } });
    expect(checkImagePayload({ media_type: "image/png", data: png() }).ok).toBe(true);
    expect(checkImagePayload({ media_type: "image/webp", data: webp() }).ok).toBe(true);
    const r = checkImagePayload({ data: `data:image/jpeg;base64,${jpeg()}` });
    expect(r).toMatchObject({ ok: true, image: { mediaType: "image/jpeg", data: jpeg() } });
  });

  it("허용하지 않는 형식은 415, 선언과 실제 바이트가 다르면 415", () => {
    expect(checkImagePayload({ media_type: "image/gif", data: jpeg() })).toMatchObject({ ok: false, status: 415 });
    expect(checkImagePayload({ media_type: "image/svg+xml", data: jpeg() })).toMatchObject({ ok: false, status: 415 });
    expect(checkImagePayload({ media_type: "image/png", data: jpeg() })).toMatchObject({ ok: false, status: 415 });
  });

  it("base64 가 아니거나 너무 작으면 400, 비어 있으면 400", () => {
    expect(checkImagePayload({ media_type: "image/jpeg", data: "not base64!!" })).toMatchObject({ ok: false, status: 400, code: "invalid_image" });
    expect(checkImagePayload({ media_type: "image/jpeg", data: jpeg(8) })).toMatchObject({ ok: false, status: 400 });
    expect(checkImagePayload({ media_type: "image/jpeg" })).toMatchObject({ ok: false, status: 400, code: "invalid_body" });
    expect(checkImagePayload(null)).toMatchObject({ ok: false, status: 400 });
  });

  it("1.5MB 를 넘으면 413", () => {
    expect(checkImagePayload({ media_type: "image/jpeg", data: jpeg(VISION_MAX_BYTES) }).ok).toBe(true);
    expect(checkImagePayload({ media_type: "image/jpeg", data: jpeg(VISION_MAX_BYTES + 3) })).toMatchObject({ ok: false, status: 413, code: "image_too_large" });
  });
});

describe("pickCandidates — 환각 방어선", () => {
  const repo = previewRepo();
  const listP = Promise.all([repo.allFoodNames(), repo.countries()]).then(([n, c]) => candidateList(n, c));
  const keyOf = async (slug: string) => (await listP).find((c) => c.food.id === id(slug))!.key;
  const cand = (food_id: string, reason = "둥글고 넓적한 모양이 닮았어요") => ({ food_id, confidence: "medium" as const, reason_ko: reason });

  it("목록에는 나라 이름이 함께 들어가고, 키는 F1… 순서", async () => {
    const list = await listP;
    expect(list[0].key).toBe("F1");
    expect(list.find((c) => c.food.id === id("injera"))?.country).toBe("에티오피아");
  });

  it("목록 밖 키·지어낸 이름은 버리고, 중복은 한 번만", async () => {
    const out: VisionOutput = { is_food: true, candidates: [cand("F99999"), cand("레촌"), cand(await keyOf("injera")), cand(await keyOf("injera"))] };
    expect(pickCandidates(out, await listP)).toEqual([{ food_id: id("injera"), confidence: "medium", reason: "둥글고 넓적한 모양이 닮았어요" }]);
  });

  it("3개를 넘으면 앞에서 3개만, 이유는 60자로 자른다", async () => {
    const slugs = ["injera", "kimchi", "mandu", "jiaozi"];
    const out: VisionOutput = { is_food: true, candidates: await Promise.all(slugs.map(async (s) => cand(await keyOf(s), "가".repeat(80)))) };
    const picks = pickCandidates(out, await listP);
    expect(picks.map((p) => p.food_id)).toEqual(slugs.slice(0, 3).map(id));
    expect(picks[0].reason).toHaveLength(60);
  });

  it("is_food=false 면 후보가 있어도 0개", async () => {
    expect(pickCandidates({ is_food: false, candidates: [cand(await keyOf("kimchi"))] }, await listP)).toEqual([]);
  });

  it("키 대신 목록 안의 실제 id 를 돌려줘도 받는다 (소문자 키도)", async () => {
    const out: VisionOutput = { is_food: true, candidates: [cand(id("kimchi")), cand((await keyOf("mandu")).toLowerCase())] };
    expect(pickCandidates(out, await listP).map((p) => p.food_id)).toEqual([id("kimchi"), id("mandu")]);
  });
});

/** 각본대로 답하는 가짜 Vision LLM. 받은 요청을 기록한다 */
function fakeVision(answer: VisionOutput | Error | ((system: string) => VisionOutput)) {
  const calls: Parameters<LLMProvider["structured"]>[0][] = [];
  const llm: LLMProvider = {
    async structured(req) {
      calls.push(req);
      if (answer instanceof Error) throw answer;
      const data = typeof answer === "function" ? answer(req.system) : answer;
      return { data, usage } as never;
    },
  };
  return { llm, calls };
}
const keyIn = (system: string, nameKo: string) => new RegExp(`^(F\\d+) \\| ${nameKo} \\|`, "m").exec(system)![1];
const image = { mediaType: "image/jpeg" as const, data: jpeg() };

describe("recognizeFood — 사진 → DB 카드", () => {
  it("고른 음식은 DB 값으로 카드가 되고, 이유·확신도가 붙는다. 비용은 기록", async () => {
    const repo = previewRepo();
    const rec = vi.spyOn(repo, "recordUsage");
    const { llm, calls } = fakeVision((system) => ({
      is_food: true,
      candidates: [
        { food_id: keyIn(system, "인제라"), confidence: "high", reason_ko: "넓게 펼친 회색빛 빵 위에 반찬이 놓여 있어요" },
        { food_id: "F99999", confidence: "low", reason_ko: "x" },
      ],
    }));
    const res = await recognizeFood({ llm, repo, dailyBudgetUsd: 5 }, image);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: "fast", operation: "vision", image });
    expect(calls[0].system).toContain("<foods>");
    expect(res.cards).toHaveLength(1);
    expect(res.cards[0]).toMatchObject({
      slug: "injera",
      confidence: "high",
      reason: "사진과 닮은 이유: 넓게 펼친 회색빛 빵 위에 반찬이 놓여 있어요",
      diet_badges: expect.arrayContaining([{ key: "vegan", level: "yes" }]),
    });
    expect(res.speech).toContain("인제라");
    expect(res.follow_ups[0]).toBe("인제라 이야기 들려줘");
    expect(rec).toHaveBeenCalledWith([usage], null);
  });

  it("음식이 아니면 카드 0개 + '닮은 게 없어요' 안내", async () => {
    const { llm } = fakeVision({ is_food: false, candidates: [] });
    const res = await recognizeFood({ llm, repo: previewRepo(), dailyBudgetUsd: 5 }, image);
    expect(res).toMatchObject({ is_food: false, cards: [] });
    expect(res.speech).toContain(NO_MATCH);
    expect(res.follow_ups.length).toBeGreaterThan(0);
  });

  it("후보가 전부 목록 밖이면 카드 0개", async () => {
    const { llm } = fakeVision({ is_food: true, candidates: [{ food_id: "Lechon", confidence: "high", reason_ko: "통구이" }] });
    const res = await recognizeFood({ llm, repo: previewRepo(), dailyBudgetUsd: 5 }, image);
    expect(res.cards).toEqual([]);
    expect(res.speech.startsWith(NO_MATCH)).toBe(true);
  });

  it("일일 예산을 넘으면 모델을 부르지 않고 VisionBudgetError", async () => {
    const repo = previewRepo();
    vi.spyOn(repo, "usageTodayUsd").mockResolvedValue(9);
    const { llm, calls } = fakeVision({ is_food: true, candidates: [] });
    await expect(recognizeFood({ llm, repo, dailyBudgetUsd: 5 }, image)).rejects.toBeInstanceOf(VisionBudgetError);
    expect(calls).toHaveLength(0);
  });

  it("키 없는 미리보기 모드의 ProviderError 는 그대로 올려 라우트가 503 으로 바꾼다", async () => {
    const { llm } = fakeVision(new ProviderError("preview", "ANTHROPIC_API_KEY 없음", false));
    await expect(recognizeFood({ llm, repo: previewRepo(), dailyBudgetUsd: 5 }, image)).rejects.toMatchObject({ provider: "preview" });
  });
});
