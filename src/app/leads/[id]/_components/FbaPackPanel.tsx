'use client'

// FBA Pack — the fixed-format Location Booking Confirmation, sent by the
// agent in one tap. Prefills from the lead, everything editable; the send is
// blocked until the signed FBA + payment proof are attached. The same tap
// creates the SOP launch project and brings back the partner's journey link.

import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'

type SentPack = { id: string; invite_url: string | null; sent_by: string; sent_at: string }

export default function FbaPackPanel({
  lead,
  agentName,
}: {
  lead: { phone: string; full_name: string; email: string; city: string }
  agentName: string
}) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inviteUrl: string | null } | null>(null)
  const [history, setHistory] = useState<SentPack[]>([])

  useEffect(() => {
    fetch(`/api/fba-pack?phone=${encodeURIComponent(lead.phone)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setHistory(d.data || [])
      })
      .catch(() => {})
  }, [lead.phone, result])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSending(true)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('leadPhone', lead.phone)
      const res = await fetch('/api/fba-pack', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Send failed — try again.')
      } else {
        setResult({ inviteUrl: data.inviteUrl ?? null })
      }
    } catch {
      setError('Connection problem — try again.')
    } finally {
      setSending(false)
    }
  }

  const inputCls =
    'w-full bg-elevated/50 border border-border rounded px-2.5 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent'
  const labelCls = 'block text-[10px] font-semibold text-dim uppercase tracking-wide mb-1'

  return (
    <div className="bg-card rounded-lg border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-dim uppercase tracking-wide">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          FBA Pack — Booking Confirmation
          {history.length > 0 && <span className="ml-1 text-[10px] text-muted">(sent {history.length})</span>}
        </span>
        <ChevronRight className={`w-4 h-4 text-dim transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border/60 pt-3">
          {result ? (
            <div className="space-y-2 text-xs">
              <p className="text-success font-medium">
                ✓ Sent — Management, gsquareco and the partner all have it.
              </p>
              {result.inviteUrl && (
                <p className="text-dim break-all">
                  Partner&apos;s SOP journey link (also in the email — share on WhatsApp too):{' '}
                  <span className="text-text">{result.inviteUrl}</span>
                </p>
              )}
              <button
                onClick={() => setResult(null)}
                className="text-[10px] text-accent hover:underline"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelCls}>Partner name *</label>
                  <input name="partnerName" defaultValue={lead.full_name} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Partner email *</label>
                  <input name="partnerEmail" type="email" defaultValue={lead.email} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>City *</label>
                  <input name="city" defaultValue={lead.city} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Franchise fee *</label>
                  <input name="franchiseFee" placeholder="e.g. ₹2,00,000 + GST" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Booking received *</label>
                  <input name="bookingAmount" placeholder="e.g. ₹25,000" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>UTR / payment ref</label>
                  <input name="utr" className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Shop address *</label>
                <input name="address" required className={inputCls} />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelCls}>Royalty waive-off</label>
                  <select name="waiveMonths" defaultValue="0" className={inputCls}>
                    <option value="0">None — standard (5%)</option>
                    <option value="1">1 month waived</option>
                    <option value="2">2 months waived</option>
                    <option value="3">3 months waived</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Additional remarks</label>
                  <input name="remarks" placeholder="anything extra agreed" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelCls}>Your name (signature) *</label>
                  <input name="agentName" defaultValue={agentName} required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Your company phone</label>
                  <input name="agentPhone" placeholder="number partners can call" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelCls}>FBA signed copy (PDF) *</label>
                  <input name="fbaSigned" type="file" accept="application/pdf,image/*" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Payment proof *</label>
                  <input name="paymentProof" type="file" accept="application/pdf,image/*" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>FBA draft copy</label>
                  <input name="fbaDraft" type="file" accept="application/pdf,image/*" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Other documents</label>
                  <input name="extra" type="file" accept="application/pdf,image/*" multiple className={inputCls} />
                </div>
              </div>

              {error && <p className="text-xs text-danger font-medium">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="w-full bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold px-3 py-2 rounded transition-colors disabled:opacity-50"
              >
                {sending
                  ? 'Sending…'
                  : 'Send Booking Confirmation (Management + Partner, CC GSquare)'}
              </button>
              <p className="text-[10px] text-muted">
                Files are auto-renamed ({'City_Name_FBA_Signed.pdf'}) and the partner&apos;s SOP
                onboarding starts automatically.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
