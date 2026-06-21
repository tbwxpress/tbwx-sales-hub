'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CopyX } from 'lucide-react'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import DuplicateMergeTool from '@/components/DuplicateMergeTool'

export default function DuplicateLeadsAdminPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)

  // Admin guard — mirrors /admin & /admin/pipeline-stages: bounce non-admins to
  // /dashboard, render nothing until the role is confirmed. (/admin/* is also
  // gated server-side by middleware, so this is the second layer.)
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setCurrentUser(d.data)
        if (d.data.role !== 'admin') router.push('/dashboard')
      } else {
        router.push('/login')
      }
    }).catch(() => router.push('/login'))
  }, [router])

  if (!currentUser || currentUser.role !== 'admin') return null

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full animate-fade-in">
        {/* Breadcrumb back to admin */}
        <a
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs text-dim hover:text-accent transition-colors mb-4 focus-ring rounded-md"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin
        </a>

        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
            <CopyX className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">Duplicate Leads</h1>
            <p className="text-sm text-dim mt-0.5">
              Spot leads that share a phone number and safely merge them into one — history kept, nothing lost.
            </p>
          </div>
        </div>

        {/* Tool */}
        <DuplicateMergeTool />
      </div>
      <PoweredBy />
    </div>
  )
}
