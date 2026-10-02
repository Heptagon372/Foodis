// 받는 대로 재생 (08 문서 §6 "첫 음성 3초"): /api/foodi/tts 의 MP3 를 끝까지 기다리지 않고 첫 조각부터 <audio> 로 튼다.
// MediaSource(데스크톱·안드로이드·iPad) / ManagedMediaSource(iPhone Safari 17.1+) 에 조각을 이어 붙인다.
// 둘 다 audio/mpeg 를 못 받으면 예전처럼 blob 을 다 받은 뒤 재생한다.
// <audio> 는 호출 측이 준다 — 라디오는 iOS 에서 사용자 탭으로 잠금 해제한 요소 하나를 계속 써야 자동 재생된다.

// ── 순수 부분: SourceBuffer 덧붙이기 큐 (stream-audio.test.ts 에서 가짜 SourceBuffer 로 검증)

export type SourceBufferLike = {
  readonly updating: boolean;
  appendBuffer(data: Uint8Array<ArrayBuffer>): void;
  addEventListener(type: "updateend", fn: () => void): void;
};
export type MediaSourceLike = { readonly readyState: string; endOfStream(error?: "network" | "decode"): void };

/**
 * appendBuffer 는 updating 중에 부르면 InvalidStateError — 그래서 updateend 마다 쌓인 조각을 한 번에 붙인다.
 * SourceBuffer 가 생기기 전(sourceopen 전)에 온 조각도 모아 두었다가 붙는 즉시 넣는다.
 */
export class AppendQueue {
  private pending: Uint8Array<ArrayBuffer>[] = [];
  private ms: MediaSourceLike | null = null;
  private sb: SourceBufferLike | null = null;
  private ending: false | "ok" | "network" = false;
  private closed = false;
  /** 실제로 SourceBuffer 에 넣은 바이트 */
  appended = 0;
  onError: ((e: unknown) => void) | null = null;

  attach(ms: MediaSourceLike, sb: SourceBufferLike) {
    this.ms = ms;
    this.sb = sb;
    sb.addEventListener("updateend", () => this.pump());
    this.pump();
  }

  push(chunk: Uint8Array<ArrayBuffer>) {
    if (this.closed || this.ending || !chunk.byteLength) return;
    this.pending.push(chunk);
    this.pump();
  }

  /** 더 올 조각이 없다. 남은 조각을 다 붙인 뒤 endOfStream */
  end(error?: "network") {
    if (this.closed || this.ending) return;
    this.ending = error ?? "ok";
    this.pump();
  }

  /** 요소에서 떨어졌거나(sourceclose) 그만둘 때 — 이후 아무것도 붙이지 않는다 */
  close() {
    this.closed = true;
    this.pending = [];
  }

  get done() {
    return this.closed;
  }

  private pump() {
    const { ms, sb } = this;
    if (this.closed || !ms || !sb || sb.updating || ms.readyState !== "open") return;
    if (this.pending.length) {
      const data = concat(this.pending);
      this.pending = [];
      try {
        sb.appendBuffer(data);
        this.appended += data.byteLength;
      } catch (e) {
        this.close();
        this.onError?.(e);
      }
      return;
    }
    if (!this.ending) return;
    this.closed = true;
    try {
      // 조금이라도 붙였으면 받은 데까지는 들려주고 정상 종료 — "network" 로 끝내면 이미 받은 소리까지 끊긴다
      if (this.ending === "ok" || this.appended > 0) ms.endOfStream();
      else ms.endOfStream("network");
    } catch {
      /* 이미 닫힘 */
    }
  }
}

function concat(parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

// ── 브라우저 부분

type MSCtor = { new (): MediaSource; isTypeSupported(type: string): boolean };

/** 첫 소리 전에 실패한 이유. media = 이 브라우저의 MSE 가 MP3 를 못 다룸 → 이후엔 blob 경로로 */
export class StreamPlayError extends Error {
  constructor(
    readonly kind: "media" | "network" | "aborted",
    message: string,
  ) {
    super(message);
  }
}

let broken = false;

function mediaSource(type: string): { Ctor: MSCtor; managed: boolean } | null {
  if (broken || typeof window === "undefined") return null;
  const w = window as unknown as { MediaSource?: MSCtor; ManagedMediaSource?: MSCtor };
  // 데스크톱 Safari·iPad 는 둘 다 있다 → 익숙한 MediaSource 먼저. iPhone 은 ManagedMediaSource 만 있다
  const options: [MSCtor | undefined, boolean][] = [
    [w.MediaSource, false],
    [w.ManagedMediaSource, true],
  ];
  for (const [Ctor, managed] of options) {
    try {
      if (Ctor?.isTypeSupported(type)) return { Ctor, managed };
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

/** 이 브라우저에서 받는 대로 재생할 수 있나 (아니면 blob 을 다 받은 뒤 재생) */
export const canStreamAudio = (type = "audio/mpeg") => mediaSource(type) !== null;

export type AttachedAudio = {
  mode: "stream" | "blob";
  /** <audio> 의 첫 playing 시각 (startedAt 기준 ms). 첫 소리 전에 실패·중단되면 StreamPlayError 로 reject */
  firstAudio: Promise<number>;
  /** 끝까지 받은 전체 음성 (다시 듣기 캐시용). 중간에 끊기면 null */
  done: Promise<Blob | null>;
  /** 다 받았나 — 받는 중엔 audio.duration 이 '지금까지 받은 길이'다 */
  readonly complete: boolean;
  /** 받기 중단 · object URL 해제. 재생을 멈추는 건 호출 측(audio.pause) */
  release(): void;
};

/**
 * res(audio/mpeg 본문)를 audio 에 붙인다. play() 는 부르지 않는다 — 자동 재생 거부(NotAllowedError) 처리는 호출 측 몫.
 * 스트림 모드는 바로 돌아오고, blob 모드는 다 받은 뒤 돌아온다.
 * 보통 `await Promise.all([audio.play(), att.firstAudio])` 로 첫 소리까지 기다린다.
 */
export async function attachResponse(res: Response, audio: HTMLAudioElement, opts: { startedAt?: number } = {}): Promise<AttachedAudio> {
  const t0 = opts.startedAt ?? performance.now();
  const type = (res.headers.get("content-type") ?? "audio/mpeg").split(";")[0].trim() || "audio/mpeg";
  const ms = res.body ? mediaSource(type) : null;

  let resolveFirst!: (ms: number) => void;
  let rejectFirst!: (e: StreamPlayError) => void;
  const firstAudio = new Promise<number>((res, rej) => ((resolveFirst = res), (rejectFirst = rej)));
  firstAudio.catch(() => {}); // 호출 측이 안 기다려도 unhandled rejection 이 되지 않게
  let src = "";
  // 같은 <audio> 를 다음 재생이 이어 쓰므로, 내 src 일 때의 이벤트만 본다
  const onPlaying = () => audio.src === src && resolveFirst(performance.now() - t0);
  const onError = () => {
    if (audio.src !== src) return;
    const code = audio.error?.code;
    // 3 = 디코드 실패, 4 = 형식 미지원 → 이 브라우저의 MSE 는 MP3 를 못 튼다고 보고 이후엔 blob 경로 (2 = 네트워크는 일시적)
    if (ms && (code === 3 || code === 4)) broken = true;
    rejectFirst(new StreamPlayError(code === 2 ? "network" : "media", `audio error ${code ?? "?"}`));
  };
  audio.addEventListener("playing", onPlaying);
  audio.addEventListener("error", onError);
  const unlisten = () => {
    audio.removeEventListener("playing", onPlaying);
    audio.removeEventListener("error", onError);
  };
  void firstAudio.then(unlisten, unlisten);

  if (!ms) {
    let blob: Blob;
    try {
      blob = await res.blob();
    } catch (e) {
      unlisten();
      throw e;
    }
    src = URL.createObjectURL(blob);
    audio.src = src;
    return {
      mode: "blob",
      firstAudio,
      done: Promise.resolve(blob),
      complete: true,
      release() {
        unlisten();
        URL.revokeObjectURL(src);
      },
    };
  }

  const media = new ms.Ctor();
  const q = new AppendQueue();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const reader = res.body!.getReader();
  let complete = false;
  let stopped = false;
  let resolveDone!: (b: Blob | null) => void;
  const done = new Promise<Blob | null>((r) => (resolveDone = r));
  const stop = (kind: StreamPlayError["kind"], why: string) => {
    if (stopped) return;
    stopped = true;
    q.close();
    if (!complete) void reader.cancel(why).catch(() => {});
    resolveDone(complete ? new Blob(chunks, { type }) : null);
    rejectFirst(new StreamPlayError(kind, why));
  };

  src = URL.createObjectURL(media);
  media.addEventListener(
    "sourceopen",
    () => {
      URL.revokeObjectURL(src); // 붙은 뒤엔 URL 이 필요 없다 (audio.src 문자열은 남는다)
      try {
        q.attach(media, media.addSourceBuffer(type));
      } catch (e) {
        broken = true; // isTypeSupported 는 된다더니 못 붙임 → 이후엔 blob 경로
        stop("media", `addSourceBuffer 실패: ${(e as Error).message}`);
      }
    },
    { once: true },
  );
  // src 가 바뀌면(다음 구간·멈춤) 떨어져 나간다 → 받기도 그만
  media.addEventListener("sourceclose", () => stop("aborted", "sourceclose"), { once: true });
  q.onError = (e) => {
    broken = true;
    stop("media", `appendBuffer 실패: ${(e as Error).message}`);
  };
  // iOS ManagedMediaSource 는 AirPlay 대체 소스가 없으면 원격 재생을 꺼야 붙는다
  if (ms.managed) audio.disableRemotePlayback = true;
  audio.src = src;

  void (async () => {
    try {
      for (;;) {
        const { done: end, value } = await reader.read();
        if (stopped) return;
        if (end) break;
        const chunk = value as Uint8Array<ArrayBuffer>;
        chunks.push(chunk);
        q.push(chunk);
      }
      complete = true;
      q.end();
      resolveDone(new Blob(chunks, { type }));
    } catch (e) {
      if (stopped) return;
      const aborted = (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError";
      q.end("network"); // 받은 데까지는 재생
      resolveDone(null);
      if (!chunks.length) stop(aborted ? "aborted" : "network", (e as Error)?.message ?? "stream error");
    }
  })();

  return {
    mode: "stream",
    firstAudio,
    done,
    get complete() {
      return complete;
    },
    release() {
      unlisten();
      URL.revokeObjectURL(src);
      stop("aborted", "release");
    },
  };
}
