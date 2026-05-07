import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NewsPulse',
  description: 'AI-powered news aggregator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
