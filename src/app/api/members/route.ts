import { NextResponse } from 'next/server'
import { getMembers } from '@/lib/members'

export async function GET() {
  const members = await getMembers()
  return NextResponse.json({ members })
}
