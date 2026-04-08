'use client'
import { useEffect } from 'react'

export default function Toast({ message, type, onClose }: { message: string; type?: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500)
    return () => clearTimeout(t)
  }, [onClose])

  const isError = type === 'error'
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] toast-enter">
      <div className={`${isError ? 'bg-danger text-white' : 'bg-accent text-[#1a1209]'} px-5 py-2.5 rounded-lg shadow-xl shadow-black/30 text-sm font-medium flex items-center gap-2`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={isError ? "M6 18L18 6M6 6l12 12" : "M5 13l4 4L19 7"} />
        </svg>
        {message}
      </div>
    </div>
  )
}
