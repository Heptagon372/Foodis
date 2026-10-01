import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Google Cloud SDK(gRPC)는 번들하면 내부 package.json 경로가 깨진다 → Node 에서 그대로 require
  serverExternalPackages: ["@google-cloud/text-to-speech", "google-gax"],
};

export default nextConfig;
