"use client";
// 음식점 카드: 거리 · 평점(출처·개수) · 배지(포장·혜택·가맹) · 카카오맵/전화/길찾기 · 평점 남기기/제보.
// 모든 정보에 출처를 붙인다 — 확인 안 된 건 확인 안 됐다고 말한다.
import { useEffect, useState } from "react";
import { directionsUrl } from "@/lib/client/map-provider";
import { franchiseLabel } from "@/lib/places/franchise";
import { formatDistance } from "@/lib/places/geo";
import { offerBadge } from "@/lib/places/offers";
import type { RankedPlace } from "@/lib/places/types";
import { Icon } from "../icons";
import { btn } from "../ui";
import { RateForm, ReportPlaceForm } from "./PlaceForms";

type ReviewItem = { username: string; rating: number; date: string; text: string };
type KakaoReviews = { rating: number | null; reviewCount: number; reviews: ReviewItem[] };
type NaverReviews = { naverId: string | null; rating: number | null; reviewCount: number; reviews: ReviewItem[]; placeUrl: string | null };

function useKakaoReviews(placeId: string) {
  const [data, setData] = useState<KakaoReviews | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/places/${placeId}/kakao-reviews`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId]);
  return data;
}

function useNaverReviews(placeId: string, name: string, address: string | null) {
  const [data, setData] = useState<NaverReviews | null>(null);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ name, ...(address ? { address } : {}) });
    fetch(`/api/places/${placeId}/naver-reviews?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId, name, address]);
  return data;
}

export function PlaceCard(p: { place: RankedPlace; index: number; foodName: string; foodSlug: string; countryName: string; fromLabel: string | null; example: boolean; selected: boolean; onSelect: () => void }) {
  const x = p.place;
  const [open, setOpen] = useState<null | "rate" | "report" | "kakao-reviews" | "naver-reviews">(null);
  const kakao = useKakaoReviews(x.id);
  const naver = useNaverReviews(x.id, x.name, x.road_address ?? x.address);
  const cat = x.category?.split(">").pop()?.trim();
  const g = x.rating.google;
  const a = x.rating.app;
  const k = kakao;
  const n = naver;
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
        {k?.rating != null && (
          <span className="inline-flex items-center gap-1">
            <Icon name="star" className="size-4 text-amber-400" fill="currentColor" />
            <span className="font-semibold tabular-nums">{k.rating.toFixed(1)}</span> <span className="text-caption text-muted">카카오 {k.reviewCount.toLocaleString("ko-KR")}개</span>
          </span>
        )}
        {n?.rating != null && (
          <span className="inline-flex items-center gap-1">
            <Icon name="star" className="size-4 text-green-500" fill="currentColor" />
            <span className="font-semibold tabular-nums">{n.rating.toFixed(1)}</span> <span className="text-caption text-muted">네이버 {n.reviewCount.toLocaleString("ko-KR")}개</span>
          </span>
        )}
        {g && (
          <span className="inline-flex items-center gap-1">
            <Icon name="star" className="size-4 text-diet-warn" fill="currentColor" />
            <span className="font-semibold tabular-nums">{g.rating.toFixed(1)}</span> <span className="text-caption text-muted">Google {g.count.toLocaleString("ko-KR")}개</span>
          </span>
        )}
        {a && (
          <span className="inline-flex items-center gap-1">
            <Icon name="star" className="size-4 text-leaf" fill="currentColor" />
            <span className="font-semibold tabular-nums">{a.avg.toFixed(1)}</span> <span className="text-caption text-muted">푸디 {a.count}명</span>
          </span>
        )}
        {!g && !a && !k?.rating && !n?.rating && <span className="text-caption text-muted">{k === null && n === null ? "리뷰 불러오는 중…" : "평점 정보가 아직 없어요"}</span>}
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
        {n?.placeUrl && (
          <a href={n.placeUrl} target="_blank" rel="noreferrer" className={link}>
            <Icon name="external" className="size-4 text-green-500" />
            네이버에서 보기
          </a>
        )}
        {k && k.reviews.length > 0 && (
          <button type="button" aria-expanded={open === "kakao-reviews"} onClick={() => setOpen(open === "kakao-reviews" ? null : "kakao-reviews")} className={link}>
            <Icon name="message" className="size-4 text-amber-400" />
            카카오 리뷰
          </button>
        )}
        {n && n.reviews.length > 0 && (
          <button type="button" aria-expanded={open === "naver-reviews"} onClick={() => setOpen(open === "naver-reviews" ? null : "naver-reviews")} className={link}>
            <Icon name="message" className="size-4 text-green-500" />
            네이버 리뷰
          </button>
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
          {open === "rate" && <RateForm target={{ id: x.id, name: x.name, example: p.example }} foodSlug={p.foodSlug} onDone={() => undefined} />}
          {open === "report" && <ReportPlaceForm target={{ id: x.id, name: x.name, example: p.example }} onDone={() => undefined} />}
          {open === "kakao-reviews" && k && (
            <ReviewList title="카카오맵 리뷰" reviews={k.reviews} starColor="text-amber-400" moreUrl={x.place_url} moreLabel="카카오맵에서 더 보기" />
          )}
          {open === "naver-reviews" && n && (
            <ReviewList title="네이버 리뷰" reviews={n.reviews} starColor="text-green-500" moreUrl={n.placeUrl} moreLabel="네이버에서 더 보기" />
          )}
        </div>
      )}
    </article>
  );
}

function ReviewList({ title, reviews, starColor, moreUrl, moreLabel }: { title: string; reviews: ReviewItem[]; starColor: string; moreUrl: string | null; moreLabel: string }) {
  return (
    <div className="space-y-3">
      <h4 className="font-bold text-ink">{title}</h4>
      {reviews.map((r, i) => (
        <div key={i} className="space-y-1 border-t border-line pt-2 first:border-0 first:pt-0">
          <div className="flex items-center gap-2 text-caption">
            <span className="inline-flex items-center gap-0.5">
              <Icon name="star" className={`size-3.5 ${starColor}`} fill="currentColor" />
              <span className="font-semibold tabular-nums">{r.rating}</span>
            </span>
            <span className="text-muted">{r.username}</span>
            {r.date && <span className="text-muted">{r.date}</span>}
          </div>
          {r.text && <p className="text-sm text-ink-soft">{r.text}</p>}
        </div>
      ))}
      {moreUrl && (
        <a href={moreUrl} target="_blank" rel="noreferrer" className="block text-center text-caption font-medium text-leaf hover:underline">
          {moreLabel} →
        </a>
      )}
    </div>
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
