"use client";
// '푸디의 두뇌' 고르기: 자동(추천) + 제공자별 답변 모델 카드. 목록·키 상태는 /api/foodi/models, 선택은 lib/client/ai-prefs (이 기기에만).
// 서버가 다시 검증한다 — 키가 없거나 목록 밖이면 자동으로, premium 은 사용량이 많은 날 기본 모델로 내려간다.
import { useEffect, useState } from "react";
import { setAiPrefs, useAiPrefs } from "@/lib/client/ai-prefs";
import { Icon, type IconName } from "../icons";
import { optionRow, RadioDot, SettingCard, Tag, type TagTone } from "./parts";

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
type Badge = { label: string; icon?: IconName; tone?: TagTone };

const SPEED: Record<Item["speed"], Badge> = { fast: { label: "빠름", icon: "zap", tone: "good" }, normal: { label: "보통 속도" }, slow: { label: "느림", icon: "snail" } };
const PROVIDER: Record<string, string> = { gemini: "Google Gemini", openai: "OpenAI GPT", anthropic: "Anthropic Claude" };
const PREMIUM: Badge = { label: "프리미엄", icon: "sparkle", tone: "good" };
const NO_KEY: Badge = { label: "키 설정 필요", icon: "key", tone: "warn" };
// 답 1건(입력 2,500 · 출력 250 토큰) 어림 비용으로 배지
const cost = (p: Item["price"]) => (2_500 * p.input + 250 * p.output) / 1e6;
const costBadge = (usd: number): Badge => (usd < 0.002 ? { label: "저렴", icon: "coins", tone: "good" } : usd < 0.005 ? { label: "보통 가격" } : { label: "비쌈", icon: "coins" });

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
    <SettingCard icon="brain" title="푸디의 두뇌" desc="푸디가 답을 만들 때 쓰는 AI 예요. 이 기기에만 저장돼요.">
      <div role="radiogroup" aria-label="푸디의 두뇌" className="space-y-2">
        <Option
          selected={!model}
          onSelect={() => setAiPrefs({ model: null })}
          title="자동 (추천)"
          desc={cat?.auto ? `지금은 ${cat.auto.label} · 문제가 생기면 다른 AI 가 이어서 답해요` : "준비된 AI 중에서 알맞게 골라 답해요"}
        />
        {groups.map(([provider, items]) => (
          <div key={provider} className="space-y-2 pt-2">
            <p className="px-1 text-caption font-semibold text-ink-soft">{PROVIDER[provider] ?? provider}</p>
            {items.map((m) => (
              <Option
                key={m.id}
                selected={model === m.id}
                disabled={!m.ready}
                onSelect={() => setAiPrefs({ model: m.id })}
                title={m.label_ko}
                desc={m.desc_ko}
                badges={[SPEED[m.speed], costBadge(cost(m.price)), ...(m.premium ? [PREMIUM] : []), ...(m.ready ? [] : [NO_KEY])]}
                hint={`1M 토큰당 입력 $${m.price.input} · 출력 $${m.price.output}${m.premium ? " · 사용량이 많은 날엔 기본 AI 로 답해요" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
      {model && cat && !chosen?.ready && (
        <p className="flex items-start gap-1.5 text-caption text-diet-warn-ink">
          <Icon name="warn" className="mt-px size-4 shrink-0" />
          고른 AI 를 지금은 쓸 수 없어 자동으로 답해요.
        </p>
      )}
      {failed && <p className="text-caption text-muted">AI 목록을 불러오지 못했어요. 자동으로 답해요.</p>}
    </SettingCard>
  );
}

function Option({ selected, disabled, onSelect, title, desc, badges = [], hint }: { selected: boolean; disabled?: boolean; onSelect: () => void; title: string; desc: string; badges?: Badge[]; hint?: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect} title={hint} className={optionRow(selected)}>
      <span className="mt-0.5">
        <RadioDot on={selected} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold text-ink">{title}</span>
          {selected && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-caption font-semibold text-leaf">
              <Icon name="check" className="size-3.5" strokeWidth={2.25} />
              선택됨
            </span>
          )}
        </span>
        <span className="block text-sm text-ink-soft">{desc}</span>
        {badges.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <Tag key={b.label} icon={b.icon} tone={b.tone}>
                {b.label}
              </Tag>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
