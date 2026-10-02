"use client";
// 어드민 음식점·혜택 입력 폼 (/admin/places). 카카오에서 받은 이름·주소를 복사해 넣지 말 것 — 사장님에게 직접 받은 정보만.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "./ui";

const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";

export function OfferForm() {
  const router = useRouter();
  const [f, setF] = useState({ place: "", kind: "coupon", title: "", detail: "", starts_on: "", ends_on: "", source: "owner" });
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-2 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg("저장 중…");
        try {
          const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));
          await callApi("/api/admin/places/offers", "POST", body);
          setMsg("등록했어요 — 다른 검수자가 확인하면 공개돼요");
          setF({ ...f, title: "", detail: "", starts_on: "", ends_on: "" });
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    >
      <input className={input} value={f.place} onChange={set("place")} required placeholder="카카오 장소 링크 또는 id (place.map.kakao.com/…)" />
      <div className="flex gap-2">
        <select className={input} value={f.kind} onChange={set("kind")}>
          <option value="coupon">쿠폰</option>
          <option value="event">이벤트</option>
          <option value="group_buy">공동구매</option>
          <option value="takeout">포장 가능</option>
        </select>
        <select className={input} value={f.source} onChange={set("source")}>
          <option value="owner">사장님 등록</option>
          <option value="admin">푸디 확인</option>
        </select>
      </div>
      <input className={input} value={f.title} onChange={set("title")} required maxLength={80} placeholder="제목 (예: 음료 1잔 무료)" />
      <input className={input} value={f.detail} onChange={set("detail")} maxLength={500} placeholder="조건·확인 방법 (선택)" />
      <label className="flex items-center gap-2 text-caption text-muted">
        시작일 <input type="date" className={input} value={f.starts_on} onChange={set("starts_on")} />
      </label>
      <label className="flex items-center gap-2 text-caption text-muted">
        마감일 {(f.kind === "coupon" || f.kind === "event") && <b className="text-diet-no">*</b>} <input type="date" className={input} value={f.ends_on} onChange={set("ends_on")} />
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-ivory">혜택 등록</button>
        {msg && <span className="whitespace-pre-line text-caption text-muted">{msg}</span>}
      </div>
    </form>
  );
}

export function RestaurantForm() {
  const router = useRouter();
  const [f, setF] = useState({ place: "", name: "", address: "", phone: "", lat: "", lng: "", info_source: "owner", food: "" });
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid gap-2 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg("저장 중…");
        try {
          const { lat, lng, ...rest } = f;
          const body = { ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== "")), ...(lat && lng ? { lat: Number(lat), lng: Number(lng) } : {}) };
          await callApi("/api/admin/places/restaurants", "POST", body);
          setMsg("저장했어요");
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    >
      <input className={input} value={f.place} onChange={set("place")} required placeholder="카카오 장소 링크 또는 id" />
      <input className={input} value={f.name} onChange={set("name")} required maxLength={80} placeholder="상호 (사장님에게 받은 이름)" />
      <input className={input} value={f.address} onChange={set("address")} maxLength={200} placeholder="주소 (사장님에게 받은 값, 선택)" />
      <input className={input} value={f.phone} onChange={set("phone")} maxLength={30} placeholder="전화 (선택)" />
      <div className="flex gap-2">
        <input className={input} value={f.lat} onChange={set("lat")} inputMode="decimal" placeholder="위도 (선택)" />
        <input className={input} value={f.lng} onChange={set("lng")} inputMode="decimal" placeholder="경도 (선택)" />
      </div>
      <div className="flex gap-2">
        <select className={input} value={f.info_source} onChange={set("info_source")}>
          <option value="owner">사장님 제공</option>
          <option value="admin">푸디팀 방문 확인</option>
        </select>
        <input className={input} value={f.food} onChange={set("food")} placeholder="파는 음식 slug (선택 · 메뉴 확인됨)" />
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <button className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-ivory">음식점 저장</button>
        {msg && <span className="whitespace-pre-line text-caption text-muted">{msg}</span>}
      </div>
    </form>
  );
}
