// 사진/영상을 기기에 저장.
// 아이폰(특히 홈 화면 앱)은 <a download> 가 제대로 안 먹는다 — 파일 앱으로 가거나 무반응.
// 대신 공유 시트(navigator.share)에 파일을 실어 보내면 "이미지 저장 / 비디오 저장"
// 버튼으로 사진첩에 바로 들어간다. 공유를 지원하지 않는 환경(PC 등)은 링크 다운로드로 폴백.
export async function saveMediaToDevice(fileUrl: string, filename: string) {
  try {
    const res = await fetch(fileUrl)
    if (res.ok) {
      const blob = await res.blob()
      const file = new File([blob], filename, { type: blob.type })
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] })
        } catch {
          // 사용자가 공유 시트를 닫은 경우 — 아무것도 안 함
        }
        return
      }
    }
  } catch {
    // fetch 실패 → 아래 폴백
  }
  const a = document.createElement('a')
  a.href = `${fileUrl}?download=1&dl=${encodeURIComponent(filename)}`
  a.download = filename
  a.click()
}
