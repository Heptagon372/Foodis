import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버(.next)를 건드리지 않고 프로덕션 리허설 빌드를 따로 만들 때: NEXT_DIST_DIR=.next-prod
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Google Cloud SDK(gRPC)는 번들하면 내부 package.json 경로가 깨진다 → Node 에서 그대로 require
  serverExternalPackages: ["@google-cloud/text-to-speech", "google-gax"],
};

export default nextConfig;
