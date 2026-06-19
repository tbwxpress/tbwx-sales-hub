'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, GitBranch } from 'lucide-react'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'
import PipelineStageEditor from '@/components/PipelineStageEditor'

export default function PipelineStagesAdminPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)

  // Admin guard — mirrors /admin: bounce non-admins to /dashboard, render
  // nothing until the role is confirmed.
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
            <GitBranch className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text">Pipeline Stages</h1>
            <p className="text-sm text-dim mt-0.5">
              Customize the columns of your sales board — rename, recolor, reorder, or retire stages.
            </p>
          </div>
        </div>

        {/* Editor card */}
        <div className="bg-card border border-border rounded-xl p-5">
          <PipelineStageEditor />
        </div>
      </div>
      <PoweredBy />
    </div>
  )
}
