import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 빌드 내 타입검사는 건너뜀 → 배포 전 `npx tsc --noEmit` 을 따로 돌리므로 중복.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
