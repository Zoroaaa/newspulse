import type { Metadata, Viewport } from 'next'
import ErrorBoundary from '@/components/ErrorBoundary'
import SWRegister from '@/components/SWRegister'
import './globals.css'

export const viewport: Viewport = {
  themeColor: '#D85A30',
}

export const metadata: Metadata = {
  title: 'NewsPulse',
  description: 'AI-powered news aggregator',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <SWRegister />
      </body>
    </html>
  )
}
