/**
 * 将图片 URL 转为服务端代理 URL
 * 用于解决客户端无法访问的外链图片（被墙、防盗链等）
 *
 * 本地开发时直接用原 URL（避免代理套代理），
 * 生产环境统一走 /api/proxy/image?url=xxx
 */
export function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  // 已经是代理 URL 了，不处理
  if (url.startsWith('/api/proxy/image')) return url
  // data: URL 不代理
  if (url.startsWith('data:')) return url
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}