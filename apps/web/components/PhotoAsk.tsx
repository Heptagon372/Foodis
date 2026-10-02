"use client";
// 사진으로 물어보기 (F-VIS-01): 카메라 버튼 → 브라우저에서 1024px JPEG 로 줄여 → /api/foodi/vision → DB 에 있는 닮은 음식 카드.
// 상태는 FoodiSheet 의 대화 피드(turns)에 그대로 얹는다 — 시트는 onTurn 으로 받은 PhotoTurn 을 같은 key 로 갱신만 한다.
// 사진은 이 기기 메모리(썸네일)에만 있고, 서버는 인식 후 버린다.
import Link from "next/link";
import { useRef } from "react";
import { getAiPrefs } from "@/lib/client/ai-prefs";
import type { Confidence, VisionResponse } from "@/lib/foodi/vision";
import { FoodCard } from "./FoodCard";
import { FollowUpChip } from "./bits";
import { Icon, type IconName } from "./icons";
import { btn } from "./ui";

export type PhotoTurn = { key: number; thumb: string; status: "pending" | "done" | "error"; res?: VisionResponse; error?: string };

const MAX_EDGE = 1024;
const MAX_BYTES = 1.5 * 1024 * 1024;
const UNAVAILABLE = "사진 인식은 준비 중이에요 (AI 키 설정 후 열려요)";

/** 긴 변 1024px 이하 JPEG data URL. 휴대폰 원본(수 MB·HEIC 변환본)을 그대로 올리지 않게 — 업로드·이미지 토큰 둘 다 줄어든다 */
async function shrink(file: File): Promise<string> {
  // createImageBitmap 은 EXIF 회전을 반영해 디코드한다. 없으면 <img> 로
  const src: ImageBitmap | HTMLImageElement =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(file, { imageOrientation: "from-image" })
      : await new Promise<HTMLImageElement>((ok, fail) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => (URL.revokeObjectURL(url), ok(img));
          img.onerror = () => (URL.revokeObjectURL(url), fail(new Error("decode")));
          img.src = url;
        });
  const scale = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas");
  g.fillStyle = "#fff"; // 투명 PNG 가 JPEG 에서 검게 나오지 않게
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
  if ("close" in src) src.close();
  for (const q of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (((url.length - url.indexOf(",") - 1) * 3) / 4 <= MAX_BYTES) return url;
  }
  throw new Error("too_large");
}

async function recognize(dataUrl: string): Promise<VisionResponse> {
  const res = await fetch("/api/foodi/vision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ media_type: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1), model: getAiPrefs().model ?? undefined }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.code === "vision_unavailable" ? UNAVAILABLE : (data?.error?.message ?? "사진을 잠깐 못 봤어요. 다시 찍어 주세요."));
  return data as VisionResponse;
}

/** 입력창 안 카메라 버튼 (44px). 모바일은 바로 후면 카메라, 데스크톱은 파일 선택 */
export function PhotoAskButton({ onTurn, disabled }: { onTurn: (t: PhotoTurn) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const onPick = async (file: File | undefined) => {
    if (!file || busy.current) return;
    busy.current = true;
    const key = Date.now();
    try {
      let thumb: string;
      try {
        thumb = await shrink(file);
      } catch {
        return onTurn({ key, thumb: "", status: "error", error: "이 사진은 열 수 없어요. 다른 사진으로 해볼래요?" });
      }
      onTurn({ key, thumb, status: "pending" });
      try {
        onTurn({ key, thumb, status: "done", res: await recognize(thumb) });
      } catch (e) {
        // fetch 의 TypeError = 네트워크 끊김
        onTurn({ key, thumb, status: "error", error: e instanceof TypeError ? "인터넷 연결이 끊겼어요. 연결되면 다시 찍어 주세요." : (e as Error).message });
      }
    } finally {
      busy.current = false;
    }
  };

  return (
    <>
      <button type="button" onClick={() => input.current?.click()} disabled={disabled} aria-label="사진으로 물어보기" title="사진으로 물어보기" className="grid size-11 shrink-0 place-items-center rounded-full text-leaf transition hover:bg-lime-soft active:scale-95 disabled:opacity-40">
        <Icon name="camera" className="size-[22px]" />
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void onPick(e.target.files?.[0]);
          e.target.value = ""; // 같은 사진을 다시 골라도 change 가 오게
        }}
      />
    </>
  );
}

// 닮은 정도: 색만으로 말하지 않게 아이콘 + 글자 (많이 = 초록 채움, 꽤 = 연두 옅은, 조금 = 테두리)
const CONFIDENCE: Record<Confidence, [string, string, IconName]> = {
  high: ["많이 닮았어요", "bg-brand text-on-brand", "check-circle"],
  medium: ["꽤 닮았어요", "bg-lime-soft text-leaf", "check"],
  low: ["조금 닮았어요", "border border-line text-ink-soft", "help"],
};

/** 피드 속 사진 질문 한 턴: 썸네일 → 답 문장 → 카드(닮은 정도) → 이어지는 질문 */
export function PhotoTurnView({ p, onFollowUp }: { p: PhotoTurn; onFollowUp: (q: string) => void }) {
  return (
    <div className="animate-rise space-y-3">
      <div className="ml-auto w-fit space-y-1 text-right">
        {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 줄인 data URL 썸네일 */}
        {p.thumb && <img src={p.thumb} alt="물어본 사진" className="ml-auto h-28 w-auto max-w-[60vw] rounded-[18px] border-2 border-brand object-cover shadow-lift" />}
        <p className="inline-flex items-center gap-1.5 text-caption text-muted">
          <Icon name="camera" className="size-4" />
          사진으로 물어봤어요
        </p>
      </div>
      {p.status === "pending" && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon name="search" className="size-4 shrink-0 animate-pulse text-leaf" />
          푸디가 사진을 보고 지도에서 찾고 있어요…
        </p>
      )}
      {p.status === "error" && (
        <p className="card flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-sm text-ink">
          <Icon name="warn" className="mt-px size-[18px] shrink-0 text-leaf" />
          <span className="min-w-0">{p.error}</span>
        </p>
      )}
      {p.res && (
        <>
          <p className="text-subtitle font-medium text-ink">{p.res.speech}</p>
          {p.res.cards.length > 0 && (
            <div className="snap-row -mx-5 px-5">
              {p.res.cards.map((c) => {
                const [label, tone, icon] = CONFIDENCE[c.confidence];
                return (
                  <div key={c.food_id} className="w-[82%]">
                    <FoodCard
                      size="L"
                      reason={c.reason}
                      food={{ slug: c.slug, name_ko: c.name_ko, flag: c.country.flag, accent: c.country.accent, summary: c.summary, image_url: c.image_url, image_credit: c.image_credit, diet: Object.fromEntries(c.diet_badges.map((b) => [b.key, b.level])) as never }}
                      action={
                        <>
                          <span className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-full px-3 text-caption font-semibold ${tone}`}>
                            <Icon name={icon} className="size-4" />
                            {label}
                          </span>
                          <Link href={`/food/${c.slug}`} className={`${btn("soft", "sm")} ml-auto shrink-0 whitespace-nowrap`}>
                            자세히
                            <Icon name="next" className="-mr-1 size-4" />
                          </Link>
                        </>
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {p.res.follow_ups.map((f) => (
              <FollowUpChip key={f} onClick={() => onFollowUp(f)}>
                {f}
              </FollowUpChip>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
