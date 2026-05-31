'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import RequestUpdatesModal from './RequestUpdatesModal'

interface Props {
  agentId: string
  agentName: string
}

export default function RequestUpdatesButton({ agentId, agentName }: Props) {
  const [open, setOpen] = useState(false)

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
        onSent={(n) => toast.success(`Sent ${n} update requests to ${agentName}`)}
      />
    </>
  )
}
