import { describe, expect, it } from "vitest";
import { detectEnv, externalOpenUrl, micSteps } from "./browser-env";

const UA = {
  kakaoAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 KAKAOTALK 10.8.0",
  instaIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

describe("browser-env", () => {
  it("인앱 브라우저와 OS 를 구분한다", () => {
    expect(detectEnv(UA.kakaoAndroid)).toMatchObject({ os: "android", inApp: "kakaotalk" });
    expect(detectEnv(UA.instaIos)).toMatchObject({ os: "ios", inApp: "instagram" });
    expect(detectEnv(UA.chromeAndroid)).toMatchObject({ os: "android", inApp: null });
    expect(detectEnv(UA.safariIos)).toMatchObject({ os: "ios", inApp: null });
  });

  it("외부 브라우저 링크: 카카오톡 스킴 · 안드로이드 인텐트 · iOS 인스타는 없음(복사 안내)", () => {
    const url = "https://foodis.app/food/kimchi?x=1";
    expect(externalOpenUrl(detectEnv(UA.kakaoAndroid), url)).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`);
    expect(externalOpenUrl({ os: "android", inApp: "instagram", secure: true }, url)).toBe("intent://foodis.app/food/kimchi?x=1#Intent;scheme=https;package=com.android.chrome;end");
    expect(externalOpenUrl(detectEnv(UA.instaIos), url)).toBeNull();
    expect(externalOpenUrl(detectEnv(UA.safariIos), url)).toBeNull();
  });

  it("안내는 3단계 이내, http 주소는 https 안내가 먼저", () => {
    for (const env of [detectEnv(UA.kakaoAndroid), detectEnv(UA.instaIos), detectEnv(UA.safariIos), detectEnv(UA.chromeAndroid)]) {
      expect(micSteps(env).length).toBeLessThanOrEqual(3);
    }
    expect(micSteps({ os: "android", inApp: null, secure: false })[0]).toContain("http");
  });
});
