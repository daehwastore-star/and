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

# 빌드 flake 대비 최대 2회 재시도.
# 빌드는 반드시 /opt/safe-build.sh 를 거친다 — web·admin 과 같은 자물쇠(한 번에 하나)와
# 메모리·스왑 상한을 함께 받기 위해서다. 예전엔 band 만 이 규칙 밖에 있어서,
# web/admin 빌드가 도는 중에 5분 주기로 끼어들 수 있었다
# (2026-08-06 14:30:01 band 부하 높음 연기 → 9초 뒤 admin 빌드 OOM 사망).
# 아래 load 검사는 1분 평균이라 방금 시작한 빌드를 못 잡는다 — 자물쇠가 진짜 방어다.
# 앱은 켜둔 채 옆(.next-new)에서 짓고, 다 됐을 때만 갈아끼운다.
# 예전엔 .next 를 먼저 지우고 빌드했는데, 자물쇠를 기다리는 동안(최대 20분)
# band 사이트가 통째로 내려간다. web 배포와 같은 무중단 방식으로 맞춘다.
built=""
for i in 1 2; do
  rm -rf .next-new
  NEXT_DIST_DIR=.next-new /opt/safe-build.sh /opt/band build && [ -f .next-new/BUILD_ID ] && { built=1; break; }
  echo "⚠️  build incomplete, retry $i"
done
if [ -n "$built" ]; then
  rm -rf .next-prev
  [ -d .next ] && mv .next .next-prev
  mv .next-new .next
  rm -rf .next-prev
fi
[ -f .next/BUILD_ID ] || { echo "❌ 빌드 실패, 재시작 건너뜀"; exit 1; }

pm2 restart band 2>/dev/null || pm2 start npm --name band -- start -- -p 3002
pm2 save
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 배포 완료 ✅"
