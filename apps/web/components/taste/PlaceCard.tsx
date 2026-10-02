"use client";
// 음식점 카드: 거리 · 평점(출처·개수) · 배지(포장·혜택·가맹) · 카카오맵/전화/길찾기 · 평점 남기기/제보.
// 모든 정보에 출처를 붙인다 — 확인 안 된 건 확인 안 됐다고 말한다.
import { useState } from "react";
import { directionsUrl } from "@/lib/client/map-provider";
import { franchiseLabel } from "@/lib/places/franchise";
import { formatDistance } from "@/lib/places/geo";
import { offerBadge } from "@/lib/places/offers";
import type { RankedPlace } from "@/lib/places/types";
import { Icon } from "../icons";
import { btn } from "../ui";
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
  const link = btn("outline", "sm");

  return (
    <article id={`place-${x.id}`} className={`card space-y-3 rounded-3xl p-4 transition ${p.selected ? "border-brand ring-2 ring-brand" : ""}`} onClick={p.onSelect}>
      <div className="flex items-start gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-caption font-bold tabular-nums ${p.selected ? "bg-lime text-on-lime" : "bg-brand text-on-brand"}`} aria-hidden>
          {p.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-title font-bold text-ink">{x.name}</h3>
          <p className="text-caption text-muted">
            {formatDistance(x.distance)}
            {p.fromLabel ? ` · ${p.fromLabel}에서` : ""}
            {cat ? ` · ${cat}` : ""}
          </p>
        </div>
      </div>

      <p className="text-caption">
        {x.match === "confirmed" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-lime-soft px-2.5 py-1 font-semibold text-leaf">
            <Icon name="check" className="size-3.5" strokeWidth={2.25} />
            {p.foodName} 메뉴 확인됨
          </span>
        ) : x.match === "dish" ? (
          <span className="text-muted">&lsquo;{p.foodName}&rsquo; 검색 결과 · 메뉴는 가게에 확인해 주세요</span>
        ) : (
          <span className="text-diet-warn-ink">{p.countryName} 음식점 · {p.foodName} 메뉴는 확인 필요</span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
        {g && (
          <span className="inline-flex items-center gap-1">
            <Icon name="star" className="size-4 text-diet-warn" fill="currentColor" />
            <span className="font-semibold tabular-nums">{g.rating.toFixed(1)}</span> <span className="text-caption text-muted">Google 리뷰 {g.count.toLocaleString("ko-KR")}개</span>
          </span>
        )}
        {a && (
          <span className="inline-flex items-center gap-1">
            <Icon name="star" className="size-4 text-leaf" fill="currentColor" />
            <span className="font-semibold tabular-nums">{a.avg.toFixed(1)}</span> <span className="text-caption text-muted">푸디 이용자 {a.count}명</span>
          </span>
        )}
        {!g && !a && <span className="text-caption text-muted">평점 정보가 아직 없어요</span>}
        {(g || a) && x.fewRatings && <span className="text-caption text-diet-warn-ink">평가가 아직 적어요</span>}
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

      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {x.place_url && (
          <a href={x.place_url} target="_blank" rel="noreferrer" className={link}>
            <Icon name="external" className="size-4 text-leaf" />
            카카오맵에서 보기
          </a>
        )}
        {x.phone && (
          <a href={`tel:${x.phone.replace(/[^\d+]/g, "")}`} className={link}>
            <Icon name="phone" className="size-4 text-leaf" />
            전화
          </a>
        )}
        {!p.example && (
          <a href={directionsUrl(x)} target="_blank" rel="noreferrer" className={link}>
            <Icon name="navigation" className="size-4 text-leaf" />
            길찾기
          </a>
        )}
        <button type="button" aria-expanded={open === "rate"} onClick={() => setOpen(open === "rate" ? null : "rate")} className={link}>
          <Icon name="star" className="size-4 text-leaf" />
          평점 남기기
        </button>
        <button type="button" aria-expanded={open === "report"} onClick={() => setOpen(open === "report" ? null : "report")} className={link}>
          <Icon name="flag" className="size-4 text-leaf" />
          정보 제보
        </button>
      </div>
      {open && (
        <div className="rounded-2xl bg-sunken p-3.5" onClick={(e) => e.stopPropagation()}>
          {open === "rate" ? <RateForm target={{ id: x.id, name: x.name, example: p.example }} foodSlug={p.foodSlug} onDone={() => undefined} /> : <ReportPlaceForm target={{ id: x.id, name: x.name, example: p.example }} onDone={() => undefined} />}
        </div>
      )}
    </article>
  );
}

function Badge({ children, tone, title }: { children: React.ReactNode; tone: "mint" | "warn" | "plain"; title?: string }) {
  const cls = { mint: "bg-lime-soft text-leaf", warn: "bg-diet-warn/15 text-diet-warn-ink", plain: "border border-line text-ink-soft" }[tone];
  return (
    <span title={title} className={`rounded-full px-2.5 py-1 font-medium ${cls}`}>
      {children}
    </span>
  );
}
