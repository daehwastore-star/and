#!/bin/bash
# 서버 자동배포 스크립트 — cron이 5분마다 실행.
# origin/main에 새 커밋이 있을 때만 pull + build + pm2 restart.

# ── 안전장치 1: 중복 실행 방지 (빌드 겹치면 서버 다운) ──
exec 9>/tmp/band-autodeploy.lock
flock -n 9 || exit 0

# ── 안전장치 2: 서버 과부하 시 이번 주기는 건너뜀 ──
LOAD=$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)
if [ "$LOAD" -ge 4 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 서버 부하 높음(load=$LOAD), 배포 연기"
  exit 0
fi

export PATH=/root/.nvm/versions/node/v20.20.2/bin:$PATH
cd /opt/band || exit 1

git fetch origin main --quiet || exit 1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 새 커밋 감지 ($LOCAL → $REMOTE), 배포 시작"
git pull origin main --quiet || exit 1

# ── 안전장치 3: 낮은 우선순위 + 메모리 상한으로 빌드 (다른 서비스 보호) ──
export NODE_OPTIONS="--max-old-space-size=1024"
nice -n 15 npm install --no-audit --no-fund
npx prisma db push
npx prisma generate

# 빌드 flake 대비 최대 3회 재시도
for i in 1 2 3; do
  rm -rf .next
  nice -n 15 npm run build && [ -f .next/BUILD_ID ] && break
  echo "⚠️  build incomplete, retry $i"
done
[ -f .next/BUILD_ID ] || { echo "❌ 빌드 실패, 재시작 건너뜀"; exit 1; }

pm2 restart band 2>/dev/null || pm2 start npm --name band -- start -- -p 3002
pm2 save
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 배포 완료 ✅"
