"use client";
// '푸디의 두뇌' 고르기: 자동(추천) + 제공자별 답변 모델 카드. 목록·키 상태는 /api/foodi/models, 선택은 lib/client/ai-prefs (이 기기에만).
// 서버가 다시 검증한다 — 키가 없거나 목록 밖이면 자동으로, premium 은 사용량이 많은 날 기본 모델로 내려간다.
import { useEffect, useState } from "react";
import { setAiPrefs, useAiPrefs } from "@/lib/client/ai-prefs";

type Item = {
  id: string;
  provider: string;
  label_ko: string;
  desc_ko: string;
  speed: "fast" | "normal" | "slow";
  premium: boolean;
  price: { input: number; output: number };
  ready: boolean;
};
type Catalog = { auto: { id: string; label: string; provider: string } | null; providers: { id: string; label: string; ready: boolean }[]; models: Item[] };

const SPEED: Record<Item["speed"], string> = { fast: "⚡ 빠름", normal: "보통 속도", slow: "🐢 느림" };
const PROVIDER: Record<string, string> = { gemini: "Google Gemini", openai: "OpenAI GPT", anthropic: "Anthropic Claude" };
// 답 1건(입력 2,500 · 출력 250 토큰) 어림 비용으로 배지
const cost = (p: Item["price"]) => (2_500 * p.input + 250 * p.output) / 1e6;
const costBadge = (usd: number) => (usd < 0.002 ? "💰 저렴" : usd < 0.005 ? "보통 가격" : "💸 비쌈");

export function ModelPicker() {
  const model = useAiPrefs((p) => p.model);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/foodi/models", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Catalog>) : Promise.reject(new Error(String(r.status)))))
      .then(
        (d) => alive && setCat(d),
        () => alive && setFailed(true),
      );
    return () => {
      alive = false;
    };
  }, []);

  const chosen = cat?.models.find((m) => m.id === model);
  // 목록 순서를 지키며 제공자별로 묶는다
  const groups = (cat?.models ?? []).reduce<[string, Item[]][]>((acc, m) => {
    const g = acc.find(([p]) => p === m.provider);
    if (g) g[1].push(m);
    else acc.push([m.provider, [m]]);
    return acc;
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">푸디의 두뇌</h3>
        <p className="text-caption text-muted">푸디가 답을 만들 때 쓰는 AI 예요. 이 기기에만 저장돼요.</p>
      </div>
      <div role="radiogroup" aria-label="푸디의 두뇌" className="space-y-2">
        <Option
          selected={!model}
          onSelect={() => setAiPrefs({ model: null })}
          title="자동 (추천)"
          desc={cat?.auto ? `지금은 ${cat.auto.label} · 문제가 생기면 다른 AI 가 이어서 답해요` : "준비된 AI 중에서 알맞게 골라 답해요"}
        />
        {groups.map(([provider, items]) => (
          <div key={provider} className="space-y-2 pt-1">
            <p className="text-caption font-medium text-muted">{PROVIDER[provider] ?? provider}</p>
            {items.map((m) => (
              <Option
                key={m.id}
                selected={model === m.id}
                disabled={!m.ready}
                onSelect={() => setAiPrefs({ model: m.id })}
                title={m.label_ko}
                desc={m.desc_ko}
                badges={[SPEED[m.speed], costBadge(cost(m.price)), ...(m.premium ? ["✨ 프리미엄"] : []), ...(m.ready ? [] : ["🔑 키 설정 필요"])]}
                hint={`1M 토큰당 입력 $${m.price.input} · 출력 $${m.price.output}${m.premium ? " · 사용량이 많은 날엔 기본 AI 로 답해요" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
      {model && cat && !chosen?.ready && <p className="text-caption text-[#7a5a10]">고른 AI 를 지금은 쓸 수 없어 자동으로 답해요.</p>}
      {failed && <p className="text-caption text-muted">AI 목록을 불러오지 못했어요. 자동으로 답해요.</p>}
    </div>
  );
}

function Option({ selected, disabled, onSelect, title, desc, badges = [], hint }: { selected: boolean; disabled?: boolean; onSelect: () => void; title: string; desc: string; badges?: string[]; hint?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      title={hint}
      className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${
        selected ? "border-mint-600 bg-mint-100" : "border-line bg-surface hover:border-mint-500"
      } disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        {selected && <span className="text-caption font-semibold text-green-800">선택됨</span>}
      </span>
      <span className="block text-sm text-charcoal/70">{desc}</span>
      {badges.length > 0 && (
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span key={b} className="rounded-full bg-ivory px-2 py-0.5 text-caption text-charcoal/70 ring-1 ring-line">
              {b}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
