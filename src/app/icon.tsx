import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export default function Icon() {
  return new ImageResponse(
    (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="6" fill="#1a1a1a"/>
        <text x="16" y="23" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="20" fill="#D85A30">N</text>
      </svg>
    ),
    {
      width: 32,
      height: 32,
    }
  )
}
