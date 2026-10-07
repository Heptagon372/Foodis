import { describe, expect, it } from "vitest";
import { authErrorText, canUnlink, isSyntheticEmail, loginErrorPath, retiredEmail, safeNext, syntheticEmail, usableMethods, visibleEmail, withParam } from "./links";

const SYN = syntheticEmail("instagram", "17841405793187218");

describe("account links", () => {
  it("가짜 메일: 만들기 · 알아보기 · 화면에서 숨기기", () => {
    expect(SYN).toBe("instagram-17841405793187218@users.foodis.invalid");
    expect(retiredEmail("u1")).toBe("user-u1@users.foodis.invalid");
    expect(isSyntheticEmail(SYN)).toBe(true);
    expect(isSyntheticEmail("INSTAGRAM-1@USERS.FOODIS.INVALID")).toBe(true);
    expect(isSyntheticEmail("me@foodis.app")).toBe(false);
    expect(isSyntheticEmail(null)).toBe(false);
    expect(visibleEmail(SYN)).toBeNull();
    expect(visibleEmail("me@foodis.app")).toBe("me@foodis.app");
  });

  it("next: 같은 사이트 경로만, 쿼리 붙일 때 해시 유지", () => {
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("//evil.example")).toBe("/passport");
    expect(safeNext("/\\evil.example")).toBe("/passport");
    expect(safeNext("/\t/evil.example")).toBe("/passport"); // URL 파서가 탭을 지우면 "//evil.example"
    expect(safeNext("/a\\..\\evil")).toBe("/passport");
    expect(safeNext("https://evil.example")).toBe("/passport");
    expect(safeNext(null)).toBe("/passport");
    expect(withParam("/settings#account", "linked", "instagram")).toBe("/settings?linked=instagram#account");
    expect(withParam("/passport?tab=1", "link_error", "instagram_state")).toBe("/passport?tab=1&link_error=instagram_state");
    expect(loginErrorPath("instagram_token", "/passport")).toBe("/login?error=instagram_token&next=%2Fpassport");
  });

  it("인스타 전용 회원은 인스타를 해제할 수 없다 (가짜 메일은 로그인 방법이 아님)", () => {
    const m = { identities: ["email"], instagram: true, email: SYN };
    expect([...usableMethods(m)]).toEqual(["instagram"]);
    expect(canUnlink("instagram", m)).toEqual({ ok: false, reason: "last_method" });
  });

  it("카카오로 가입 + 인스타 연결: 인스타는 해제 가능, 카카오는 처음 가입한 방법이라 불가", () => {
    const m = { identities: ["kakao"], instagram: true, email: null };
    expect(canUnlink("instagram", m)).toEqual({ ok: true });
    expect(canUnlink("kakao", m)).toEqual({ ok: false, reason: "primary" });
    expect(canUnlink("google", m)).toEqual({ ok: false, reason: "not_linked" });
  });

  it("인스타로 가입 + Google 연결: 둘 다 하나씩은 뗄 수 있지만 마지막 하나는 못 뗀다", () => {
    const both = { identities: ["email", "google"], instagram: true, email: SYN };
    expect(canUnlink("google", both)).toEqual({ ok: true });
    expect(canUnlink("instagram", both)).toEqual({ ok: true });
    // 인스타를 뗀 뒤: 신원은 2개(가짜 메일 + Google)라 Supabase 는 허락하지만, 남는 게 가짜 메일뿐이라 막는다
    expect(canUnlink("google", { ...both, instagram: false })).toEqual({ ok: false, reason: "last_method" });
  });

  it("진짜 메일이 있으면 이메일 코드 로그인이 남는다", () => {
    const m = { identities: ["google", "kakao"], instagram: false, email: "me@foodis.app" };
    expect(canUnlink("kakao", m)).toEqual({ ok: true });
    expect(canUnlink("google", { identities: ["email", "google"], instagram: false, email: "me@foodis.app" })).toEqual({ ok: true });
  });

  it("오류 코드 → 사용자 말", () => {
    expect(authErrorText("instagram_linked_elsewhere")).toBe("이미 다른 FOODIS 계정에 연결된 인스타그램이에요.");
    expect(authErrorText("Manual linking is disabled")).toContain("Allow manual linking");
    expect(authErrorText("manual_linking_disabled")).toContain("Allow manual linking");
    expect(authErrorText("Identity is already linked to another user")).toBe("이미 다른 FOODIS 계정에 연결된 계정이에요.");
    expect(authErrorText("single_identity_not_deletable")).toBe("처음 가입한 로그인 방법이라 해제할 수 없어요");
    expect(authErrorText("access_denied")).toBe("로그인을 취소했어요.");
    expect(authErrorText("Token has expired or is invalid")).toBeNull(); // 이메일 코드 오류는 로그인 화면 기존 문구로
  });
});
