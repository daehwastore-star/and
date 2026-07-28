import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

async function getConfig(key: string): Promise<string | null> {
  const row = await prisma.appConfig.findUnique({ where: { key } })
  return row?.value ?? null
}

async function setConfig(key: string, value: string) {
  await prisma.appConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

// VAPID 키는 첫 사용 시 자동 생성해 DB에 보관 (.env 불필요)
export async function getVapidPublicKey(): Promise<string> {
  let pub = await getConfig('vapidPublicKey')
  const priv = await getConfig('vapidPrivateKey')
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys()
    await setConfig('vapidPublicKey', keys.publicKey)
    await setConfig('vapidPrivateKey', keys.privateKey)
    pub = keys.publicKey
  }
  return pub
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

// 구독된 모든 기기에 발송. 만료된 구독은 자동 삭제.
export async function sendPushToAll(payload: PushPayload): Promise<number> {
  const pub = await getVapidPublicKey()
  const priv = await getConfig('vapidPrivateKey')
  if (!priv) return 0
  webpush.setVapidDetails('mailto:daehwastore@gmail.com', pub, priv)

  const subs = await prisma.pushSubscription.findMany()
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      )
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
      }
    }
  }
  return sent
}

export { getConfig as getAppConfig, setConfig as setAppConfig }
