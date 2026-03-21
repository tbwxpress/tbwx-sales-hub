'use client'

export default function PoweredBy() {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-dim">
      <span className="text-xs">Powered & Built by</span>
      <a
        href="https://nofluff.pro"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs font-semibold text-[#5cc8ff] hover:text-[#7dd6ff] transition-colors"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nofluff-icon.png" alt="NoFluff.Pro" width={16} height={16} className="rounded-sm" />
        NoFluff.Pro
      </a>
    </div>
  )
}
