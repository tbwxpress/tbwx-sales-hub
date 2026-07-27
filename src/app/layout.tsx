import type { Metadata, Viewport } from 'next'
import './globals.css'
import { BRAND } from '@/config/client'
import CommandPalette from '@/components/CommandPalette'
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp'
import GuidedRedirect from '@/components/GuidedRedirect'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import Script from 'next/script';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.description,
  icons: { icon: '/icon.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: BRAND.short || 'TBWX',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: process.env.NEXT_PUBLIC_THEME_COLOR || '#1a1209',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Restore saved theme before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme');if(t){var cl=document.documentElement.classList;cl.remove('dark','light');cl.add(t)}}catch(e){}` }} />
      </head>
      <body className="min-h-screen antialiased transition-colors duration-200">
        <TooltipProvider>
          <GuidedRedirect />
          <CommandPalette />
          <KeyboardShortcutsHelp />
          <Toaster position="top-right" richColors closeButton />
          {children}
        </TooltipProvider>
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              // updateViaCache:'none' bypasses the HTTP cache when checking
              // for a new worker — without it a CDN-cached sw.js can pin
              // agents to retired app code for up to a day.
              navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
                .then((reg) => {
                  // Re-check for a new worker every time the agent returns to
                  // the tab, and every 30 minutes while it stays open.
                  document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') reg.update().catch(() => {});
                  });
                  setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
                })
                .catch(() => {});
              // When a new worker takes over (it calls skipWaiting on install),
              // reload once so the agent is on current code within seconds of
              // a deploy — never mid-typing twice thanks to the guard flag.
              let reloaded = false;
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (reloaded) return;
                reloaded = true;
                window.location.reload();
              });
            });
          }
        `}</Script>
      </body>
    </html>
  )
}
