"use client";
// 음식점 카드: 거리 · 평점(출처·개수) · 배지(포장·혜택·가맹) · 카카오맵/전화/길찾기 · 평점 남기기/제보.
// 모든 정보에 출처를 붙인다 — 확인 안 된 건 확인 안 됐다고 말한다.
import { useState } from "react";
import { directionsUrl } from "@/lib/client/map-provider";
import { franchiseLabel } from "@/lib/places/franchise";
import { formatDistance } from "@/lib/places/geo";
import { offerBadge } from "@/lib/places/offers";
import type { RankedPlace } from "@/lib/places/types";
import { RateForm, ReportPlaceForm } from "./PlaceForms";

export function PlaceCard(p: { place: RankedPlace; index: number; foodName: string; foodSlug: string; countryName: string; fromLabel: string | null; example: boolean; selected: boolean; onSelect: () => void }) {
  const x = p.place;
  const [open, setOpen] = useState<null | "rate" | "report">(null);
  const cat = x.category?.split(">").pop()?.trim();
  const g = x.rating.google;
  const a = x.rating.app;
  const fr = franchiseLabel(x.franchise);
  const verifiedOffers = x.offers.filter((o) => o.verified);
  const pendingKinds = [...new Set(x.offers.filter((o) => !o.verified).map((o) => o.kind))];
  const link = "rounded-full border border-line bg-surface px-3 py-1.5 text-caption font-semibold text-charcoal/80 transition active:scale-95";

  return (
    <article id={`place-${x.id}`} className={`space-y-2.5 rounded-2xl bg-surface p-4 shadow-sm transition ${p.selected ? "ring-2 ring-green-800" : ""}`} onClick={p.onSelect}>
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-green-800 text-caption font-bold text-ivory" aria-hidden>
          {p.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{x.name}</h3>
          <p className="text-caption text-muted">
            {formatDistance(x.distance)}
            {p.fromLabel ? ` · ${p.fromLabel}에서` : ""}
            {cat ? ` · ${cat}` : ""}
          </p>
        </div>
      </div>

      <p className="text-caption">
        {x.match === "confirmed" ? (
          <span className="rounded-full bg-mint-100 px-2 py-0.5 font-semibold text-green-800">✔ {p.foodName} 메뉴 확인됨</span>
        ) : x.match === "dish" ? (
          <span className="text-muted">&lsquo;{p.foodName}&rsquo; 검색 결과 · 메뉴는 가게에 확인해 주세요</span>
        ) : (
          <span className="text-[#7a5a10]">{p.countryName} 음식점 · {p.foodName} 메뉴는 확인 필요</span>
        )}
      </p>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        {g && (
          <span>
            <b className="text-diet-warn">★</b> {g.rating.toFixed(1)} <span className="text-caption text-muted">Google 리뷰 {g.count.toLocaleString("ko-KR")}개</span>
          </span>
        )}
        {a && (
          <span>
            <b className="text-green-800">★</b> {a.avg.toFixed(1)} <span className="text-caption text-muted">푸디 이용자 {a.count}명</span>
          </span>
        )}
        {!g && !a && <span className="text-caption text-muted">평점 정보가 아직 없어요</span>}
        {(g || a) && x.fewRatings && <span className="text-caption text-[#7a5a10]">평가가 아직 적어요</span>}
      </div>

      <div className="flex flex-wrap gap-1.5 text-caption">
        {x.takeoutSource && <Badge tone="mint" title={x.takeoutSource === "google" ? "Google 정보" : x.offers.find((o) => o.kind === "takeout" && o.verified)?.source_label}>포장 가능</Badge>}
        {verifiedOffers
          .filter((o) => o.kind !== "takeout")
          .map((o, i) => (
            <Badge key={i} tone={o.state === "upcoming" ? "plain" : "warn"} title={o.source_label}>
              {offerBadge(o)}
            </Badge>
          ))}
        {pendingKinds.map((k) => (
          <Badge key={k} tone="plain" title="이용자 제보 · 확인 전">
            {k === "takeout" ? "포장" : offerBadge({ kind: k, state: "active", title: null, starts_at: null, ends_at: null, verified: false, source_label: "" })} 제보 · 확인 전
          </Badge>
        ))}
        {fr && (
          <Badge tone="plain" title={x.franchise.brand ?? undefined}>
            {fr}
            {x.franchise.brand ? ` · ${x.franchise.brand}` : ""}
          </Badge>
        )}
      </div>
      {(verifiedOffers.length > 0 || x.takeoutSource === "google") && (
        <p className="text-caption text-muted">
          출처: {[...(x.takeoutSource === "google" ? ["포장 가능 · Google 정보"] : []), ...new Set(verifiedOffers.map((o) => o.source_label))].join(" / ")}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        {x.place_url && (
          <a href={x.place_url} target="_blank" rel="noreferrer" className={link}>
            카카오맵에서 보기
          </a>
        )}
        {x.phone && (
          <a href={`tel:${x.phone.replace(/[^\d+]/g, "")}`} className={link}>
            전화
          </a>
        )}
        {!p.example && (
          <a href={directionsUrl(x)} target="_blank" rel="noreferrer" className={link}>
            길찾기
          </a>
        )}
        <button type="button" onClick={() => setOpen(open === "rate" ? null : "rate")} className={link}>
          평점 남기기
        </button>
        <button type="button" onClick={() => setOpen(open === "report" ? null : "report")} className={link}>
          정보 제보
        </button>
      </div>
      {open && (
        <div className="rounded-xl border border-line p-3" onClick={(e) => e.stopPropagation()}>
          {open === "rate" ? <RateForm target={{ id: x.id, name: x.name, example: p.example }} foodSlug={p.foodSlug} onDone={() => undefined} /> : <ReportPlaceForm target={{ id: x.id, name: x.name, example: p.example }} onDone={() => undefined} />}
        </div>
      )}
    </article>
  );
}

function Badge({ children, tone, title }: { children: React.ReactNode; tone: "mint" | "warn" | "plain"; title?: string }) {
  const cls = { mint: "bg-mint-100 text-green-800", warn: "bg-diet-warn/15 text-[#7a5a10]", plain: "border border-line text-charcoal/75" }[tone];
  return (
    <span title={title} className={`rounded-full px-2.5 py-1 font-medium ${cls}`}>
      {children}
    </span>
  );
}
