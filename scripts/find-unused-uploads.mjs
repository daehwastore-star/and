#!/usr/bin/env node
// uploads 폴더에서 DB 어디에도 안 걸린 '주인 없는 파일' 을 찾는다.
// (사진은 창고에 들어갔는데 장부에는 안 적힌 것 — 앱 어디에서도 안 보인다)
//
//   node scripts/find-unused-uploads.mjs            # 목록만 보여준다 (기본)
//   node scripts/find-unused-uploads.mjs --delete   # 실제로 지운다
//
// 글쓰기가 중간에 실패하면 파일만 남을 수 있었다(2026-08-08 에 원인은 고쳤다 —
// api/journal 이 이제 저장 전에 전부 검사한다). 기록을 지웠을 때도 파일은 남으니
// 가끔 돌려보는 점검용으로 둔다.
//
// ⚠️ 지우기 전에 반드시 백업을 확인할 것. uploads 는 오프사이트 백업에 들어간다
//    (web 저장소 scripts/backup-offsite.sh).
import { readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'

const DELETE = process.argv.includes('--delete')
const UPLOADS = join(process.cwd(), 'uploads')
const db = new Database(join(process.cwd(), 'dev.db'))

// 파일명이 들어갈 만한 칼럼을 전부 훑는다.
// 주의: 악보처럼 '원본 표시용 이름' 을 따로 담는 칼럼도 같이 걸린다.
// 그건 uploads 에 없는 이름이라 여기선 그냥 무시된다(판정에는 영향 없음).
const referenced = new Set()
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name)
for (const t of tables) {
  for (const c of db.prepare(`PRAGMA table_info("${t}")`).all()) {
    if (!/file|photo|image|preview|thumb|url|path/i.test(c.name)) continue
    try {
      for (const row of db.prepare(`SELECT "${c.name}" v FROM "${t}"`).all()) {
        if (row.v) referenced.add(String(row.v))
      }
    } catch {
      // 조회 안 되는 칼럼은 건너뛴다
    }
  }
}

const files = readdirSync(UPLOADS)
const unused = files.filter(f => !referenced.has(f))
let total = 0
for (const f of unused) total += statSync(join(UPLOADS, f)).size

console.log(`uploads ${files.length}개 중 주인 없는 파일 ${unused.length}개 (${(total / 1024 / 1024).toFixed(2)}MB)`)
for (const f of unused) {
  const st = statSync(join(UPLOADS, f))
  console.log(`  ${f}  ${(st.size / 1024).toFixed(0)}KB  ${st.mtime.toISOString().slice(0, 16)}`)
}

if (!unused.length) process.exit(0)
if (!DELETE) {
  console.log('\n지우려면 --delete 를 붙여 다시 실행하세요.')
  process.exit(0)
}
for (const f of unused) unlinkSync(join(UPLOADS, f))
console.log(`\n${unused.length}개 삭제 완료`)
