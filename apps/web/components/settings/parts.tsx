// 설정 화면 공용 조각 (디자인 v2): 설정 카드 · 라디오 점 · 작은 태그 · 고르기 줄 클래스. 색은 테마 토큰만 (docs/design/09)
import type { ReactNode } from "react";
import { Icon, type IconName } from "../icons";
import { IconTile } from "../ui";

/** 설정 묶음 카드 — 아이콘 타일 + 제목 + 한 줄 설명 */
export function SettingCard({ icon, title, desc, children }: { icon: IconName; title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="card space-y-4 rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={icon} size="sm" />
        <div className="min-w-0 pt-0.5">
          <h3 className="text-title font-bold text-ink">{title}</h3>
          {desc && <p className="text-caption text-muted">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** 라디오 점 (글자 기호 대신). 켜짐 = 초록 테두리 + 초록 점 */
export function RadioDot({ on }: { on: boolean }) {
  return (
    <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${on ? "border-brand" : "border-line"}`} aria-hidden>
      {on && <span className="size-2.5 rounded-full bg-brand" />}
    </span>
  );
}

export type TagTone = "plain" | "good" | "warn";
const TAG_TONE: Record<TagTone, string> = {
  plain: "bg-sunken text-ink-soft",
  good: "bg-lime-soft text-leaf",
  warn: "bg-diet-warn/12 text-diet-warn-ink",
};

/** 작은 정보 태그 (속도·가격·모델 이름). 아이콘은 꾸밈 — 글자가 뜻을 말한다 */
export function Tag({ children, icon, tone = "plain" }: { children: ReactNode; icon?: IconName; tone?: TagTone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${TAG_TONE[tone]}`}>
      {icon && <Icon name={icon} className="size-3" strokeWidth={2} />}
      {children}
    </span>
  );
}

/** 고르기 줄 (role=radio 버튼) — 켜짐 = 초록 테두리 + 옅은 연두. 높이 44px 이상 */
export const optionRow = (on: boolean) =>
  `flex w-full min-h-11 items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 ${
    on ? "border-brand bg-lime-soft" : "border-line bg-surface hover:border-leaf/40 disabled:hover:border-line"
  }`;
