#!/bin/bash
# 서버 자동배포 스크립트 — cron이 5분마다 실행.
# origin/main에 새 커밋이 있을 때만 pull + build + pm2 restart.
export PATH=/root/.nvm/versions/node/v20.20.2/bin:$PATH
cd /opt/band || exit 1

git fetch origin main --quiet || exit 1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 새 커밋 감지 ($LOCAL → $REMOTE), 배포 시작"
git pull origin main --quiet || exit 1
npm install --no-audit --no-fund
npx prisma db push
npx prisma generate

# 빌드 flake 대비 최대 3회 재시도 (daehwastore build:safe와 동일 패턴)
for i in 1 2 3; do
  rm -rf .next
  npm run build && [ -f .next/BUILD_ID ] && break
  echo "⚠️  build incomplete, retry $i"
done
[ -f .next/BUILD_ID ] || { echo "❌ 빌드 실패, 재시작 건너뜀"; exit 1; }

pm2 restart band 2>/dev/null || pm2 start npm --name band -- start -- -p 3001
pm2 save
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 배포 완료 ✅"
