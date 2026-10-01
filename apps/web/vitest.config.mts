import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // 실서버 모듈(lib/providers/anthropic.ts 등)을 eval:live 에서 불러올 수 있게
      "server-only": fileURLToPath(new URL("./lib/foodi/eval/server-only-stub.ts", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
});
