import type { Metadata } from 'next'
import './globals.css'
import { BRAND } from '@/config/client'
import CommandPalette from '@/components/CommandPalette'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.description,
  icons: { icon: '/icon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content={process.env.NEXT_PUBLIC_THEME_COLOR || '#1a1209'} />
        {/* Restore saved theme before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme');if(t){var cl=document.documentElement.classList;cl.remove('dark','light');cl.add(t)}}catch(e){}` }} />
      </head>
      <body className="bg-bg text-text min-h-screen antialiased transition-colors duration-200">
        <CommandPalette />
        {children}
      </body>
    </html>
  )
}
