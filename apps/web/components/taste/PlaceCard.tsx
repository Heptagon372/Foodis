"use client";
// 음식점 카드: 거리 · 평점(출처·개수) · 배지(포장·혜택·가맹) · 카카오맵/전화/길찾기 · 평점 남기기/제보.
// 모든 정보에 출처를 붙인다 — 확인 안 된 건 확인 안 됐다고 말한다.
import { Fragment, useEffect, useState } from "react";
import { directionsUrl } from "@/lib/client/map-provider";
import { franchiseLabel } from "@/lib/places/franchise";
import { formatDistance, formatEta } from "@/lib/places/geo";
import { offerBadge } from "@/lib/places/offers";
import type { RankedPlace } from "@/lib/places/types";
import { Icon } from "../icons";
import { btn } from "../ui";
import { RateForm, ReportPlaceForm } from "./PlaceForms";

type ReviewItem = { username: string; rating: number; date: string; text: string };
type KakaoReviews = { rating: number | null; reviewCount: number; reviews: ReviewItem[] };
type NaverReviews = { naverId: string | null; rating: number | null; reviewCount: number; reviews: ReviewItem[]; placeUrl: string | null };
type MenuItem = { name: string; price: string | null; desc: string | null; photo: string | null };
type DayHours = { day: string; text: string };
type PlaceMenu = { menu: MenuItem[]; hours: DayHours[]; openNow: boolean | null; offDays: string | null; statusText: string; subway: { station: string; exit: string | null; walkMin: number | null } | null };

function useKakaoMenu(placeId: string) {
  const [data, setData] = useState<PlaceMenu | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/places/${placeId}/menu`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId]);
  return data;
}

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

type OpenKey = null | "rate" | "report" | "kakao-reviews" | "naver-reviews" | "menu" | "hours";

/** bare: 카드 틀 없이 (유리 패널 안에 넣을 때) · initialOpen: 처음부터 펼쳐 둘 칸 */
export function PlaceCard(p: { place: RankedPlace; index: number; foodName: string; foodSlug: string; countryName: string; fromLabel: string | null; example: boolean; selected: boolean; onSelect: () => void; bare?: boolean; initialOpen?: OpenKey }) {
  const x = p.place;
  const [open, setOpen] = useState<OpenKey>(p.initialOpen ?? null);
  const kakao = useKakaoReviews(x.id);
  const naver = useNaverReviews(x.id, x.name, x.road_address ?? x.address);
  const menuData = useKakaoMenu(x.id);
  // 메뉴판에 음식 이름이 있으면 "확인됨"으로 올린다 (국가 음식 유사 + 메뉴 있음 = 확률 ↑)
  const menuHasFood = !!menuData?.menu.some((m) => m.name.includes(p.foodName));
  const effectiveMatch: typeof x.match = menuHasFood ? "confirmed" : x.match;
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
    <article id={`place-${x.id}`} className={p.bare ? "space-y-3" : `card space-y-3 rounded-3xl p-4 transition ${p.selected ? "border-brand ring-2 ring-brand" : ""}`} onClick={p.onSelect}>
      <div className="flex items-start gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-caption font-bold tabular-nums ${p.selected ? "bg-lime text-on-lime" : "bg-brand text-on-brand"}`} aria-hidden>
          {p.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-title font-bold text-ink">{x.name}</h3>
          <p className="text-caption text-muted">
            {formatDistance(x.distance)} · {formatEta(x.distance)}
            {p.fromLabel ? ` · ${p.fromLabel}에서` : ""}
            {cat ? ` · ${cat}` : ""}
          </p>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-caption">
        {effectiveMatch === "confirmed" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-lime-soft px-2.5 py-1 font-semibold text-leaf">
            <Icon name="check" className="size-3.5" strokeWidth={2.25} />
            {p.foodName} 메뉴 확인됨{menuHasFood && x.match !== "confirmed" ? " · 메뉴판에서" : ""}
          </span>
        ) : x.match === "dish" ? (
          <span className="text-muted">&lsquo;{p.foodName}&rsquo; 검색 결과 · 메뉴는 가게에 확인해 주세요</span>
        ) : (
          <span className="text-diet-warn-ink">{p.countryName} 음식점 · {p.foodName} 메뉴는 확인 필요</span>
        )}
        {menuData && menuData.openNow !== null && (
          <button
            type="button"
            onClick={(e) => (e.stopPropagation(), setOpen(open === "hours" ? null : "hours"))}
            aria-expanded={open === "hours"}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${menuData.openNow ? "bg-lime-soft text-leaf" : "bg-diet-warn/15 text-diet-warn-ink"}`}
          >
            <span className={`inline-block size-1.5 rounded-full ${menuData.openNow ? "bg-leaf" : "bg-diet-warn"}`} aria-hidden />
            {menuData.statusText}
          </button>
        )}
      </p>

      {(x.road_address || x.address) && (
        <p className="flex items-start gap-1.5 text-caption text-ink-soft">
          <Icon name="pin" className="mt-0.5 size-3.5 shrink-0 text-leaf" />
          <span className="min-w-0 flex-1 truncate">{x.road_address ?? x.address}</span>
        </p>
      )}
      {menuData?.subway && (
        <p className="flex items-start gap-1.5 text-caption text-ink-soft">
          <Icon name="navigation" className="mt-0.5 size-3.5 shrink-0 text-leaf" />
          <span>
            {menuData.subway.station}{menuData.subway.exit ? ` ${menuData.subway.exit}번 출구` : ""}
            {menuData.subway.walkMin != null ? `에서 도보 ${menuData.subway.walkMin}분` : ""}
          </span>
        </p>
      )}

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
        {menuData && menuData.menu.length > 0 && (
          <button type="button" aria-expanded={open === "menu"} onClick={() => setOpen(open === "menu" ? null : "menu")} className={link}>
            <Icon name="utensils" className="size-4 text-leaf" />
            메뉴판 ({menuData.menu.length})
          </button>
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
          {open === "menu" && menuData && (
            <MenuBoard menu={menuData.menu} foodName={p.foodName} placeUrl={x.place_url} />
          )}
          {open === "hours" && menuData && (
            <HoursPanel hours={menuData.hours} offDays={menuData.offDays} statusText={menuData.statusText} />
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

function MenuBoard({ menu, foodName, placeUrl }: { menu: MenuItem[]; foodName: string; placeUrl: string | null }) {
  return (
    <div className="space-y-2.5">
      <h4 className="font-bold text-ink">메뉴판</h4>
      <ul className="divide-y divide-line">
        {menu.map((m, i) => {
          const hit = m.name.includes(foodName);
          return (
            <li key={i} className={`flex items-start gap-3 py-2 ${hit ? "-mx-1 rounded-lg bg-lime-soft/50 px-1" : ""}`}>
              {m.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.photo} alt="" className="size-12 shrink-0 rounded-lg object-cover" loading="lazy" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-semibold text-ink">
                  {hit && <Icon name="check" className="size-3.5 shrink-0 text-leaf" strokeWidth={2.5} />}
                  <span className="truncate">{m.name}</span>
                </p>
                {m.desc && <p className="line-clamp-2 text-caption text-ink-soft">{m.desc}</p>}
              </div>
              {m.price && <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{m.price}</span>}
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-muted">메뉴·가격은 카카오맵 공개 정보예요. 바뀔 수 있으니 가게에 꼭 확인해 주세요.</p>
      {placeUrl && (
        <a href={placeUrl} target="_blank" rel="noreferrer" className="block text-center text-caption font-medium text-leaf hover:underline">
          카카오맵에서 더 보기 →
        </a>
      )}
    </div>
  );
}

function HoursPanel({ hours, offDays, statusText }: { hours: DayHours[]; offDays: string | null; statusText: string }) {
  return (
    <div className="space-y-2">
      <h4 className="font-bold text-ink">영업시간</h4>
      <p className="text-sm font-semibold text-ink">{statusText}</p>
      {hours.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {hours.map((h, i) => (
            <Fragment key={i}>
              <dt className="font-semibold text-muted">{h.day}</dt>
              <dd className="text-ink">{h.text}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <p className="text-caption text-muted">영업시간 정보가 없어요.</p>
      )}
      {offDays && <p className="text-caption text-diet-warn-ink">휴무: {offDays}</p>}
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
