export function proxyImage(url: string | null | undefined): string | null {
  if (!url) return null
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}
