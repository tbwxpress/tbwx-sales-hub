'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'

// Only load the modal once the user actually clicks the button.
const RequestUpdatesModal = dynamic(() => import('./RequestUpdatesModal'), {
  loading: () => null,
  ssr: false,
})

interface Props {
  agentId: string
  agentName: string
}

export default function RequestUpdatesButton({ agentId, agentName }: Props) {
  const [open, setOpen] = useState(false)
  // Track whether the modal has ever been opened so we can keep it mounted
  // for fade-out animations, but skip mounting it (and its chunk) entirely
  // until the first interaction.
  const [hasOpened, setHasOpened] = useState(false)

  return (
    <>
      <button
        onClick={() => {
          setHasOpened(true)
          setOpen(true)
        }}
        className="text-xs bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent rounded-md px-3 py-1.5 font-medium transition-colors"
      >
        🔔 Request updates from {agentName}
      </button>
      {hasOpened && (
        <RequestUpdatesModal
          open={open}
          onClose={() => setOpen(false)}
          agentId={agentId}
          agentName={agentName}
          onSent={(n) => toast.success(`Sent ${n} update requests to ${agentName}`)}
        />
      )}
    </>
  )
}
