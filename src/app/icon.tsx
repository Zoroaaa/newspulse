import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export default function Icon() {
  return new ImageResponse(
    (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="6" fill="#1a1a1a"/>
        <path
          d="M9 23 L9 8.6 L11.6 8.6 L20.4 20.1 L20.4 8.6 L23 8.6 L23 23 L20.4 23 L11.6 11.5 L11.6 23 Z"
          fill="#D85A30"
          fillRule="evenodd"
        />
      </svg>
    ),
    {
      width: 32,
      height: 32,
    }
  )
}
