// 푸디 검색 색인(1만 개, 처음 받는 데 약 3.5초)을 서버 시작 때 미리 받아 둔다 — 서버 시작 후 첫 음성 질문이 색인을 기다리지 않게 (docs/design/19 §5).
// 기다리지 않고(void) 뒤에서 받는다. 실패해도 첫 질문 때 다시 받는다.
import { getRepo } from "@/lib/foodi/deps";

void getRepo()
  .then((repo) => Promise.all([repo.foodIndex(), repo.countries()]))
  .then(([rows]) => console.log(`[foodi] 검색 색인 준비 — 음식 ${rows.length}개`))
  .catch((e) => console.warn(`[foodi] 검색 색인 미리 받기 실패 (첫 질문 때 다시): ${e instanceof Error ? e.message : String(e)}`));
