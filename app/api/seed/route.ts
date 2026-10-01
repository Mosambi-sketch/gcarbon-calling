import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export async function GET() {
  try {
    const seedPath = join(process.cwd(), 'data', 'seed.json')
    
    if (!existsSync(seedPath)) {
      return NextResponse.json({ ok: false, error: 'Seed file not found. Run: node scripts/seed.mjs' })
    }

    const raw = readFileSync(seedPath, 'utf-8')
    const seed = JSON.parse(raw)
    
    return NextResponse.json({ ok: true, data: seed })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
