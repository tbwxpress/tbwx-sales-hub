import { ReactNode } from 'react'

export default function Card({ children, className = '', interactive = false }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return (
    <div
      className={`rounded-lg p-4 ${interactive ? 'hover:shadow-md cursor-pointer' : ''} ${className}`}
      style={{ backgroundColor: 'var(--color-card)', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)' }}
    >
      {children}
    </div>
  )
}
