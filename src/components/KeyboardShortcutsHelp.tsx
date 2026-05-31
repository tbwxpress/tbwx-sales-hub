'use client'
import { useEffect, useState } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface Shortcut { key: string; description: string }
interface Section { title: string; shortcuts: Shortcut[] }

const SECTIONS: Section[] = [
  {
    title: 'Inbox',
    shortcuts: [
      { key: '/', description: 'Focus search' },
      { key: 'R', description: 'Focus reply / type a message' },
      { key: 'Esc', description: 'Close active conversation' },
    ],
  },
  {
    title: 'Global',
    shortcuts: [
      { key: '?', description: 'Show this help' },
    ],
  },
]

export default function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      if (e.key === '?' && !isTyping) {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-card border border-border rounded-lg w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text">Keyboard Shortcuts</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setOpen(false)}
                className="text-dim hover:text-text text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </TooltipTrigger>
            <TooltipContent>close (esc)</TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-4">
          {SECTIONS.map(section => (
            <div key={section.title}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-dim mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.shortcuts.map(s => (
                  <li key={s.key} className="flex items-center justify-between text-xs text-muted">
                    <span>{s.description}</span>
                    <kbd className="px-2 py-0.5 bg-elevated border border-border rounded text-[10px] font-mono text-text">
                      {s.key}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-dim mt-4 italic">
          Tip: shortcuts don&apos;t fire while typing.
        </p>
      </div>
    </div>
  )
}
