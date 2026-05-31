import type { Metadata } from 'next'
import { Bricolage_Grotesque, Geist, Caveat } from 'next/font/google'
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  KanbanSquare,
  Calendar,
  BarChart3,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})
const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  weight: ['400', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sales Hub — Preview',
}

const NAV_ITEMS = [
  { href: '/v2/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/v2/leads', label: 'Leads', icon: Users },
  { href: '/v2/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/v2/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { href: '/v2/today', label: 'Today', icon: Calendar },
  { href: '/v2/agent-stats', label: 'Stats', icon: BarChart3 },
]

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`theme-newsstand min-h-screen ${bricolage.variable} ${geist.variable} ${caveat.variable}`}>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <Link href="/v2/dashboard" className="flex items-center gap-2 px-2 py-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-accent)', color: 'var(--color-text)' }}
              >
                <span className="display text-base font-extrabold">T</span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="display text-[15px] font-extrabold">TBWX</span>
                <span className="text-[10px] text-muted-foreground">Sales Hub · Preview</span>
              </div>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={
                      <Link href={item.href}>
                        <item.icon className="size-4" strokeWidth={1.75} />
                        <span>{item.label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            <div
              className="mx-2 my-2 border-t"
              style={{ borderColor: 'var(--color-border-light, rgba(0,0,0,0.1))' }}
            />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link href="/dashboard">
                      <ArrowLeft className="size-4" strokeWidth={1.75} />
                      <span>Back to current design</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="flex items-center justify-between editorial-border px-6 h-14">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Preview build</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <kbd className="px-1.5 py-0.5 text-[10px] border-2 border-current rounded">⌘K</kbd>
              <span>to search</span>
            </div>
          </header>
          <main className="p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster richColors position="top-right" />
    </div>
  )
}
