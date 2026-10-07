import { describe, expect, it } from "vitest";
import { authorizeUrl, callbackUrl, cleanCode, encodeStateCookie, igErrorMessage, instagramConfigured, parseProfile, parseTokenResponse, tokenRequestBody, verifyStateCookie, type IgState } from "./instagram";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;
const state = (o: Partial<IgState> = {}): IgState => ({ state: "abc123", mode: "login", next: "/passport", exp: NOW + 600_000, ...o });

describe("instagram oauth", () => {
  it("동의 주소: client_id · redirect_uri · code · instagram_business_basic · state", () => {
    const u = new URL(authorizeUrl({ clientId: "123", redirectUri: callbackUrl("http://localhost:3000"), state: "s1" }));
    expect(u.origin + u.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "123",
      redirect_uri: "http://localhost:3000/auth/instagram/callback",
      response_type: "code",
      scope: "instagram_business_basic",
      state: "s1",
    });
  });

  it("토큰 요청: authorization_code 폼 + code 끝의 #_ 는 뗀다", () => {
    expect(cleanCode("AQBx#_")).toBe("AQBx");
    const b = tokenRequestBody({ clientId: "1", clientSecret: "sec", redirectUri: "https://foodis.app/auth/instagram/callback", code: "AQBx#_" });
    expect(Object.fromEntries(b)).toEqual({ client_id: "1", client_secret: "sec", grant_type: "authorization_code", redirect_uri: "https://foodis.app/auth/instagram/callback", code: "AQBx" });
  });

  it("토큰 응답: 평평한 모양 · data 배열 모양 둘 다, 17자리 숫자 id 도 자릿수 그대로", () => {
    expect(parseTokenResponse('{"access_token":"IGQ1","user_id":17841405793187218,"permissions":"instagram_business_basic"}')).toEqual({ accessToken: "IGQ1", userId: "17841405793187218" });
    expect(parseTokenResponse('{"data":[{"access_token":"IGQ2","user_id":"17841400000000001","permissions":"instagram_business_basic"}]}')).toEqual({ accessToken: "IGQ2", userId: "17841400000000001" });
    expect(parseTokenResponse('{"access_token":"IGQ3"}')).toEqual({ accessToken: "IGQ3", userId: null }); // id 는 /me 로 대신
    expect(parseTokenResponse('{"error_type":"OAuthException","code":400,"error_message":"Invalid authorization code"}')).toBeNull();
    expect(parseTokenResponse("<html>")).toBeNull();
  });

  it("프로필: 빠진 필드는 null, https 사진만", () => {
    expect(parseProfile('{"user_id":"17841405793187218","username":"foodie.kim","name":"김푸디","profile_picture_url":"https://scontent.cdninstagram.com/a.jpg","id":"9007199254740993"}')).toEqual({
      id: "9007199254740993",
      username: "foodie.kim",
      name: "김푸디",
      avatar: "https://scontent.cdninstagram.com/a.jpg",
    });
    expect(parseProfile('{"id":"42","username":"x","profile_picture_url":"javascript:alert(1)"}')).toEqual({ id: "42", username: "x", name: null, avatar: null });
    expect(parseProfile('{"error":{"message":"Invalid OAuth access token"}}')).toBeNull();
    expect(igErrorMessage('{"error":{"message":"Invalid OAuth access token"}}')).toBe("Invalid OAuth access token");
    expect(igErrorMessage('{"error_message":"Invalid authorization code"}')).toBe("Invalid authorization code");
  });

  it("state 쿠키: 서명·만료·state 일치를 모두 통과해야 한다", () => {
    const c = encodeStateCookie(state(), SECRET);
    expect(verifyStateCookie(c, "abc123", SECRET, NOW)).toMatchObject({ mode: "login", next: "/passport" });
    expect(verifyStateCookie(c, "other", SECRET, NOW)).toBeNull(); // 주소의 state 가 다름 (CSRF)
    expect(verifyStateCookie(c, "abc123", "wrong-secret", NOW)).toBeNull(); // 서명 불일치
    expect(verifyStateCookie(c, "abc123", SECRET, NOW + 601_000)).toBeNull(); // 10분 지남
    expect(verifyStateCookie(undefined, "abc123", SECRET, NOW)).toBeNull();
    expect(verifyStateCookie(c, null, SECRET, NOW)).toBeNull();
    // 내용을 바꾸면(연결 → 다른 회원) 서명이 깨진다
    const [, sig] = c.split(".");
    const forged = Buffer.from(JSON.stringify(state({ mode: "link", uid: "attacker" }))).toString("base64url");
    expect(verifyStateCookie(`${forged}.${sig}`, "abc123", SECRET, NOW)).toBeNull();
  });

  it("state 쿠키: 연결은 회원 id 필수 · next 는 같은 사이트 경로만", () => {
    expect(verifyStateCookie(encodeStateCookie(state({ mode: "link" }), SECRET), "abc123", SECRET, NOW)).toBeNull();
    expect(verifyStateCookie(encodeStateCookie(state({ mode: "link", uid: "u1", next: "/settings#account" }), SECRET), "abc123", SECRET, NOW)).toMatchObject({ mode: "link", uid: "u1", next: "/settings#account" });
    expect(verifyStateCookie(encodeStateCookie(state({ next: "//evil.example" }), SECRET), "abc123", SECRET, NOW)?.next).toBe("/passport");
  });

  it("설정 여부: 앱 ID · 시크릿 · service_role 이 다 있어야", () => {
    expect(instagramConfigured({ instagramAppId: "1", instagramAppSecret: "s", supabaseServiceKey: "k", supabaseUrl: "https://x.supabase.co" })).toBe(true);
    expect(instagramConfigured({ instagramAppId: "1", instagramAppSecret: "s", supabaseUrl: "https://x.supabase.co" })).toBe(false);
    expect(instagramConfigured({ instagramAppId: "1", supabaseServiceKey: "k", supabaseUrl: "https://x.supabase.co" })).toBe(false);
  });
});
