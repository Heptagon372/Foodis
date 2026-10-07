// 서버가 뜰 때 한 번 (Next instrumentation). 푸디 검색 색인 미리 받기는 Node 전용 모듈에 둔다 —
// 이 파일은 edge 용으로도 컴파일되므로, Next 문서의 모양 그대로(NEXT_RUNTIME 비교 안에서 import) 써야 edge 번들에서 빠진다.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
