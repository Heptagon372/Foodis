"use client";
// Passport "내 취향 분석" — 취향 엔진(lib/taste/engine.ts)이 이 기기의 행동 신호로 계산한 결과를 그대로 보여 준다.
// 무엇을 근거로 추천하는지 투명하게: 신호 수 · 확신도 · 많이 본 맛/나라/대륙 · 자주 쓴 기능. 기록 지우기 제공.
import { useMemo } from "react";
import type { Country } from "@/lib/content/types";
import { TASTE_LABEL } from "@/lib/content/types";
import { useLocal } from "@/lib/client/passport";
import { resetTaste, useTaste } from "@/lib/client/taste";
import { buildProfile, topOf } from "@/lib/taste/engine";
import { Icon, type IconName } from "./icons";
import { ProgressBar } from "./ui";

const CONTINENT_LABEL: Record<string, string> = { asia: "아시아", europe: "유럽", mena_africa: "중동·아프리카", americas: "아메리카", oceania: "오세아니아" };
const FEATURE_LABEL: Record<string, [IconName, string]> = {
  voice: ["mic", "음성 질문"], text: ["edit", "글 질문"], radio: ["radio", "라디오"], map: ["map", "세계 지도"], listen: ["volume-on", "이야기 듣기"], share: ["share", "공유 카드"],
  "tab:문화": ["book", "문화 탭"], "tab:식이": ["leaf", "식이 탭"], "tab:연결": ["route", "연결 탭"],
};

function Bars({ items, label }: { items: [string, number][]; label: (k: string) => string }) {
  return (
    <ul className="space-y-1.5">
      {items.map(([k, v]) => (
        <li key={k} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 truncate text-ink-soft">{label(k)}</span>
          <ProgressBar value={Math.round(v * 100)} max={100} label={label(k)} />
        </li>
      ))}
    </ul>
  );
}

export function TasteCard({ countries }: { countries: Country[] }) {
  const signals = useTaste((s) => s.signals);
  const features = useTaste((s) => s.features);
  const tastes = useLocal((s) => s.tastes);
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const p = useMemo(() => buildProfile(signals, features, (cc) => byCode.get(cc)?.continent_group, Date.now(), { tastes }), [signals, features, byCode, tastes]);
  const pct = Math.round(p.confidence * 100);
  const views = signals.filter((s) => s.k === "view").length;
  const clicks = signals.filter((s) => s.k === "click").length;
  const dwellMin = Math.round(signals.filter((s) => s.k === "dwell").reduce((a, s) => a + (s.ms ?? 0), 0) / 60_000);

  return (
    <div id="taste" className="card scroll-mt-4 space-y-4 rounded-3xl p-4 lg:scroll-mt-(--desk-sticky)">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="font-semibold text-ink">{pct < 30 ? "취향을 배우는 중" : pct < 70 ? "취향이 보이기 시작했어요" : "취향을 잘 알고 있어요"}</p>
          <span className="text-caption text-muted">확신도 {pct}%</span>
        </div>
        <ProgressBar value={Math.max(3, pct)} max={100} label={`취향 확신도 ${pct}%`} className="mt-2 h-2" />
        <p className="mt-2 text-caption text-muted">
          카드 클릭 {clicks} · 상세 {views} · 머문 시간 {dwellMin}분 · 좋아요·먹어봤어요·질문·듣기까지 함께 봐요.
          {pct < 30 && " 그동안은 나라마다 가장 유명한 대표 음식부터 소개해요."}
        </p>
      </div>

      {Object.keys(p.tags).length > 0 && (
        <div>
          <p className="mb-1.5 text-caption font-semibold text-muted">끌리는 맛</p>
          <Bars items={topOf(p.tags, 4)} label={(k) => TASTE_LABEL[k] ?? k} />
        </div>
      )}
      {Object.keys(p.countries).length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1.5 text-caption font-semibold text-muted">자주 본 나라</p>
            <Bars items={topOf(p.countries, 3)} label={(k) => `${byCode.get(k)?.flag_emoji ?? ""} ${byCode.get(k)?.name_ko ?? k}`} />
          </div>
          <div>
            <p className="mb-1.5 text-caption font-semibold text-muted">대륙</p>
            <Bars items={topOf(p.continents, 3)} label={(k) => CONTINENT_LABEL[k] ?? k} />
          </div>
        </div>
      )}
      {p.features.length > 0 && (
        <div>
          <p className="mb-1.5 text-caption font-semibold text-muted">자주 쓰는 기능</p>
          <div className="flex flex-wrap gap-1.5">
            {p.features.slice(0, 6).map((f) => {
              const [icon, label] = FEATURE_LABEL[f.name] ?? ["sparkle", f.name];
              return (
                <span key={f.name} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-lime-soft px-3 text-sm font-medium text-leaf">
                  <Icon name={icon} className="size-3.5" />
                  {label} · {f.n}
                </span>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-line pt-3 text-caption text-muted">
        <span>이 기기에만 저장돼요 (서버로 보내지 않아요)</span>
        {signals.length > 0 && (
          <button type="button" onClick={() => confirm("취향 기록을 지울까요? 추천이 처음 상태로 돌아가요.") && resetTaste()} className="font-medium text-ink-soft underline underline-offset-2">
            기록 지우기
          </button>
        )}
      </div>
    </div>
  );
}
