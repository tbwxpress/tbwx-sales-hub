import { ReactNode } from 'react'

export default function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && <div className="mb-4 opacity-40">{icon}</div>}
      <p className="text-heading text-text mb-1">{title}</p>
      {hint && <p className="text-body text-dim max-w-sm mb-4">{hint}</p>}
      {action}
    </div>
  )
}
