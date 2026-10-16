// 연습 녹음 중엔 화면을 악보로 꽉 채운다 — 아래 탭바 숨김 (globals.css 의 html[data-immersive])
export function setImmersive(on: boolean) {
  if (typeof document === 'undefined') return
  if (on) document.documentElement.dataset.immersive = '1'
  else delete document.documentElement.dataset.immersive
}
