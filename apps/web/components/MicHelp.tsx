"use client";
// 마이크 권한 거부 · 인앱 브라우저 안내 (01 UI 설계 §6). 막다른 화면 금지: 항상 "글로 물어보기"가 함께 있다.
import { useState } from "react";
import { Icon } from "./icons";
import { btn, IconTile } from "./ui";
import { detectEnv, externalOpenUrl, IN_APP_LABEL, micSteps } from "@/lib/client/browser-env";

export function MicHelp({ reason, onType }: { reason: "mic_denied" | "unsupported"; onType: () => void }) {
  const [env] = useState(detectEnv);
  const [copied, setCopied] = useState(false);
  const href = typeof window !== "undefined" ? externalOpenUrl(env, window.location.href) : null;
  const title = !env.secure
    ? "이 주소에서는 마이크를 쓸 수 없어요"
    : env.inApp
      ? `${IN_APP_LABEL[env.inApp]} 안에서는 마이크가 막혀 있어요`
      : reason === "unsupported"
        ? "이 브라우저는 음성 인식을 지원하지 않아요"
        : "마이크 권한이 꺼져 있어요";
  const steps = reason === "unsupported" && !env.inApp && env.secure ? ["Chrome · Safari · Edge 최신 버전에서 열어 주세요"] : micSteps(env);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 클립보드도 막힌 인앱 브라우저 — 버튼 문구로 대신 안내 */
    }
  };

  return (
    <div className="card animate-rise rounded-3xl p-4" role="status">
      <div className="flex items-start gap-3">
        <IconTile icon="mic" tone="soft" />
        <div className="min-w-0 pt-0.5">
          <p className="font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-caption text-ink-soft">아래 순서로 켜거나, 지금은 글로 물어봐도 똑같이 답해요.</p>
        </div>
      </div>
      <ol className="mt-4 space-y-2.5">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-2.5 text-sm">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-on-brand">{i + 1}</span>
            <span className="pt-0.5 text-ink">{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onType} className={btn("primary", "sm")}>
          <Icon name="edit" className="size-4" />
          글로 물어보기
        </button>
        {href && (
          <a href={href} className={btn("outline", "sm")}>
            <Icon name="globe" className="size-4 text-leaf" />
            {env.inApp === "kakaotalk" ? "기본 브라우저로 열기" : "Chrome 으로 열기"}
          </a>
        )}
        {env.inApp && (
          <button type="button" onClick={copy} className={btn("ghost", "sm")}>
            {copied ? (
              <>
                <Icon name="check" className="size-4 text-leaf" />
                복사했어요
              </>
            ) : (
              "링크 복사"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/** 시트 첫 화면용 한 줄 — 인앱 브라우저면 마이크를 누르기 전에 미리 알려 준다 */
export function InAppNotice() {
  const [env] = useState(detectEnv);
  if (!env.inApp) return null;
  const href = typeof window !== "undefined" ? externalOpenUrl(env, window.location.href) : null;
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-lime-soft px-3.5 py-2.5 text-caption text-ink">
      <Icon name="info" className="mt-px size-4 shrink-0 text-leaf" />
      <span className="min-w-0">
        {IN_APP_LABEL[env.inApp]} 안에서는 음성이 안 될 수 있어요.{" "}
        {href ? (
          <a href={href} className="font-semibold text-leaf underline underline-offset-2">
            브라우저로 열기
          </a>
        ) : (
          "점 세 개(더보기) 메뉴에서 ‘Safari로 열기’를 눌러 주세요."
        )}
      </span>
    </p>
  );
}
