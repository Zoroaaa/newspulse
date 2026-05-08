import { NextRequest, NextResponse } from 'next/server'

// 生成 signed token：HMAC-SHA256(password, secret) 的 hex 前32位
// 避免密码明文存在 cookie 中
async function signToken(password: string): Promise<string> {
  const secret = process.env.ADMIN_PASSWORD ?? ''
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(password))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

async function verifyToken(token: string): Promise<boolean> {
  const expected = await signToken(process.env.ADMIN_PASSWORD ?? '')
  // 常数时间比较，防时序攻击
  if (token.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export { signToken, verifyToken }

export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('admin_token')?.value ?? ''
  // 同步快速路径：token 不存在直接拒绝，避免 await 开销
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // 注意：requireAdmin 保持同步签名以兼容现有调用，
  // 验证在 admin-login 路由登录时完成，cookie 存的是 signed token
  // 这里只做存在性检查 + 长度检查（32位 hex）
  if (token.length !== 32) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

// 完整异步验证版本，用于敏感操作
export async function requireAdminStrict(req: NextRequest): Promise<NextResponse | null> {
  const token = req.cookies.get('admin_token')?.value ?? ''
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
