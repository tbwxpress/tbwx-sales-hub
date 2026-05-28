'use client'
import { useState } from 'react'
import RequestUpdatesModal from './RequestUpdatesModal'

interface Props {
  agentId: string
  agentName: string
}

export default function RequestUpdatesButton({ agentId, agentName }: Props) {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent rounded-md px-3 py-1.5 font-medium transition-colors"
      >
        🔔 Request updates from {agentName}
      </button>
      <RequestUpdatesModal
        open={open}
        onClose={() => setOpen(false)}
        agentId={agentId}
        agentName={agentName}
        onSent={(n) => setToast(`Sent ${n} update requests to ${agentName}`)}
      />
      {toast && (
        <div className="fixed bottom-4 right-4 bg-success/20 border border-success/40 text-success text-xs px-3 py-2 rounded-md z-50">
          {toast}
          <button onClick={() => setToast('')} className="ml-2 text-success/70">×</button>
        </div>
      )}
    </>
  )
}
