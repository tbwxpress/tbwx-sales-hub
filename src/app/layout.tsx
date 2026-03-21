import type { Metadata } from 'next'
import './globals.css'
import { BRAND } from '@/config/client'

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.description,
  icons: { icon: BRAND.logo },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content={process.env.NEXT_PUBLIC_THEME_COLOR || '#1a1209'} />
      </head>
      <body className="bg-bg text-text min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
