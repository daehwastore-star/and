# 🎸 밴드 합주 매니저

밴드 멤버들끼리 쓰는 합주 스케줄 조율 + 정산 웹앱.

## 멤버

- 메인: 최예설, 김태형, 김병석, 안진영, 강폴
- 객원: 장효주

(첫 실행 시 자동 등록됨)

## 기능

### 📅 합주 스케줄 투표
- 후보 날짜/시간을 여러 개 올리고 멤버들이 ⭕/❌ 투표
- 가장 많이 되는 시간에 👑 표시
- 투표 마감/재오픈

### 💸 합주비 · 뒤풀이 정산
- **합주비**: 참석자 엔빵
- **지각**: 지각한 사람은 1시간 비용의 절반을 추가 부담, 남은 금액을 전원이 나눔
- **뒤풀이**: 뒤풀이 참석자끼리만 엔빵
- 합주 시간은 2시간 기본, 3시간 선택 가능
- 참여 인원 / 합주비 / 뒤풀이비 기록이 전부 남음

## 기술 스택

- Next.js 16 (App Router) + React 19
- Prisma 7 + SQLite (better-sqlite3)
- Tailwind CSS 4
- 로그인 없음 — 멤버끼리 링크 공유해서 사용

## 개발

```bash
npm install
npx prisma db push      # dev.db 생성
npx prisma generate
npm run dev
```

## 배포

```bash
npm install
npx prisma db push
npx prisma generate
npm run build
npm run start           # 기본 3000 포트, -p 로 변경 가능
```

`npx tsc --noEmit` 으로 타입 체크 후 배포 권장.
