'use client'

// FBA Pack — the fixed-format Location Booking Confirmation, sent by the
// agent in one tap. Prefills from the lead, everything editable; the send is
// blocked until the signed FBA + payment proof are attached. Submit opens a
// review screen — the agent re-reads every line and types the city to confirm
// before anything is emailed. The same send creates the SOP launch project
// and brings back the partner's journey link.

import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'

type SentPack = {
  id: string
  invite_url: string | null
  sop_project_id: string | null
  sent_by: string
  sent_at: string
}

const SOP_BASE_URL = process.env.NEXT_PUBLIC_SOP_BASE_URL || 'https://sop.tbwxpress.com'

type ReviewSummary = {
  partnerName: string
  partnerEmail: string
  city: string
  address: string
  franchiseFee: string
  bookingAmount: string
  utr: string
  waiveMonths: number
  remarks: string
  agentName: string
  agentPhone: string
  attachments: string[]
}

/** Mirrors the server's tag(): "Krish & Rishita" → "KrishRishita". */
function tag(value: string): string {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 40) || 'TBWX'
}

// Gmail rejects emails over 25MB on the wire; base64 inflates ~33%, so ~18MB
// of raw attachments is the hard ceiling for one email. Same cap as the server.
const MAX_TOTAL_BYTES = 18 * 1024 * 1024

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "200000" → "₹2,00,000". Mirrors the email's formatter so the review screen
 * shows exactly what the partner will read. Non-numeric input passes through. */
function formatMoney(v: string): string {
  const digits = v.replace(/[₹,\s]/g, '')
  return /^\d+$/.test(digits) ? `₹${Number(digits).toLocaleString('en-IN')}` : v
}

/** SQLite UTC "YYYY-MM-DD HH:MM:SS" → readable IST. */
function fmtIst(sqlUtc: string): string {
  const d = new Date(sqlUtc.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime())
    ? sqlUtc
    : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : 'pdf'
}

export default function FbaPackPanel({
  lead,
  agentName,
}: {
  lead: { id: string; phone: string; full_name: string; email: string; city: string }
  agentName: string
}) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inviteUrl: string | null } | null>(null)
  const [history, setHistory] = useState<SentPack[]>([])
  const [pendingFd, setPendingFd] = useState<FormData | null>(null)
  const [review, setReview] = useState<ReviewSummary | null>(null)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    fetch(`/api/fba-pack?phone=${encodeURIComponent(lead.phone)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setHistory(d.data || [])
      })
      .catch(() => {})
  }, [lead.phone, result])

  function onReview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('leadPhone', lead.phone)
    fd.set('leadId', lead.id)

    const str = (k: string) => String(fd.get(k) || '').trim()
    const cityTag = tag(str('city'))
    const nameTag = tag(str('partnerName'))
    const attachments: string[] = []
    const sized: { name: string; size: number }[] = []
    const single: [string, string][] = [
      ['fbaDraft', 'FBA_Draft'],
      ['fbaSigned', 'FBA_Signed'],
      ['paymentProof', 'Payment_Proof'],
    ]
    for (const [slot, label] of single) {
      const f = fd.get(slot)
      if (f instanceof File && f.size > 0) {
        const renamed = `${cityTag}_${nameTag}_${label}.${extOf(f.name)}`
        attachments.push(`${renamed} (${mb(f.size)})`)
        sized.push({ name: renamed, size: f.size })
      }
    }
    let extraIndex = 0
    for (const f of fd.getAll('extra')) {
      if (f instanceof File && f.size > 0 && extraIndex < 6) {
        const renamed = `${cityTag}_${nameTag}_Document_${++extraIndex}.${extOf(f.name)}`
        attachments.push(`${renamed} (${mb(f.size)})`)
        sized.push({ name: renamed, size: f.size })
      }
    }

    // Preflight the Gmail size ceiling here — a clear message beats a failed
    // upload after the agent has already waited on a big transfer.
    const totalBytes = sized.reduce((sum, f) => sum + f.size, 0)
    if (totalBytes > MAX_TOTAL_BYTES) {
      const heaviest = [...sized].sort((a, b) => b.size - a.size)[0]
      setError(
        `Attachments total ${mb(totalBytes)} — one email can carry at most ${mb(MAX_TOTAL_BYTES)} ` +
          `(Gmail's limit). Heaviest file: ${heaviest.name} (${mb(heaviest.size)}). ` +
          `Compress it or remove a document and try again.`
      )
      return
    }

    setPendingFd(fd)
    setReview({
      partnerName: str('partnerName'),
      partnerEmail: str('partnerEmail'),
      city: str('city'),
      address: str('address'),
      franchiseFee: str('franchiseFee'),
      bookingAmount: str('bookingAmount'),
      utr: str('utr'),
      waiveMonths: Number(str('waiveMonths') || '0'),
      remarks: str('remarks'),
      agentName: str('agentName'),
      agentPhone: str('agentPhone'),
      attachments,
    })
    setConfirmText('')
  }

  function backToEdit() {
    setReview(null)
    setPendingFd(null)
    setConfirmText('')
  }

  const confirmOk =
    review !== null && confirmText.trim().toLowerCase() === review.city.trim().toLowerCase()

  const lastSent =
    history.length > 0
      ? history.reduce((a, b) => (a.sent_at > b.sent_at ? a : b))
      : null

  async function onConfirmSend() {
    if (!pendingFd || !confirmOk) return
    setError(null)
    setSending(true)
    try {
      const res = await fetch('/api/fba-pack', { method: 'POST', body: pendingFd })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Send failed — try again.')
      } else {
        setResult({ inviteUrl: data.inviteUrl ?? null })
        backToEdit()
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

  const reviewRow = (label: string, value: string) => (
    <div className="flex gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="w-32 shrink-0 text-[10px] font-semibold text-dim uppercase tracking-wide pt-0.5">
        {label}
      </span>
      <span className="text-xs text-text break-words min-w-0">{value}</span>
    </div>
  )

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
          {lastSent && (
            <p className="text-[10px] text-muted mb-2">
              Last sent {fmtIst(lastSent.sent_at)} by {lastSent.sent_by}.
              {lastSent.sop_project_id && (
                <>
                  {' '}
                  <a
                    href={`${SOP_BASE_URL}/admin/launch/${lastSent.sop_project_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline"
                  >
                    Open SOP journey ↗
                  </a>
                </>
              )}
            </p>
          )}
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
            <>
              {/* Form stays mounted (hidden) during review so files/values survive Back. */}
              <form onSubmit={onReview} className={review ? 'hidden' : 'space-y-3'}>
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
                    <label className={labelCls}>Franchise fee (₹, excl. GST) *</label>
                    <input
                      name="franchiseFee"
                      inputMode="numeric"
                      pattern="[0-9,\s]+"
                      title="Numbers only — GST is added automatically in the email"
                      placeholder="e.g. 200000"
                      required
                      className={inputCls}
                    />
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
                    <label className={labelCls}>Other documents (up to 6, all files ≤18 MB total)</label>
                    <input name="extra" type="file" accept="application/pdf,image/*" multiple className={inputCls} />
                  </div>
                </div>

                {!review && error && <p className="text-xs text-danger font-medium">{error}</p>}

                <button
                  type="submit"
                  className="w-full bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold px-3 py-2 rounded transition-colors"
                >
                  Review before sending →
                </button>
                <p className="text-[10px] text-muted">
                  Nothing is sent yet — the next screen shows the exact email for a final check.
                </p>
              </form>

              {review && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-warning">
                    ⚠ Final check — this email goes to the partner AND management. Read every line.
                  </p>
                  {history.length > 0 && (
                    <p className="text-xs font-bold text-danger">
                      ⛔ Already sent for this lead{lastSent ? ` on ${fmtIst(lastSent.sent_at)} by ${lastSent.sent_by}` : ''}.
                      Sending again emails the partner and management a second time — proceed only
                      if you are correcting a mistake.
                    </p>
                  )}

                  <div className="bg-elevated/40 border border-border rounded p-3">
                    {reviewRow('To', `TBWX Management + ${review.partnerEmail}`)}
                    {reviewRow('CC', 'gsquareco@tbwxpress.com')}
                    {reviewRow('Partner', review.partnerName)}
                    {reviewRow('City', review.city)}
                    {reviewRow('Shop address', review.address)}
                    {reviewRow('Franchise fee', `${formatMoney(review.franchiseFee)} (GST extra)`)}
                    {reviewRow(
                      'Booking received',
                      review.utr
                        ? `${formatMoney(review.bookingAmount)} (UTR: ${review.utr})`
                        : formatMoney(review.bookingAmount)
                    )}
                    {reviewRow(
                      'Royalty in email',
                      review.waiveMonths > 0
                        ? `"First ${review.waiveMonths} month${review.waiveMonths > 1 ? 's' : ''} waived"`
                        : 'Not mentioned — standard terms'
                    )}
                    {review.remarks ? reviewRow('Notes', review.remarks) : null}
                    {reviewRow('Signature', review.agentPhone ? `${review.agentName} · ${review.agentPhone}` : review.agentName)}
                    {reviewRow('Attachments', review.attachments.join(', ') || 'none')}
                  </div>

                  <div>
                    <label className={labelCls}>
                      Type the city name ({review.city}) to confirm everything above is correct
                    </label>
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={review.city}
                      className={inputCls}
                      autoFocus
                    />
                  </div>

                  {error && <p className="text-xs text-danger font-medium">{error}</p>}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={backToEdit}
                      disabled={sending}
                      className="flex-1 bg-elevated/60 hover:bg-elevated text-dim text-xs font-semibold px-3 py-2 rounded transition-colors disabled:opacity-50"
                    >
                      ← Back &amp; edit
                    </button>
                    <button
                      type="button"
                      onClick={onConfirmSend}
                      disabled={!confirmOk || sending}
                      className="flex-1 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold px-3 py-2 rounded transition-colors disabled:opacity-40"
                    >
                      {sending ? 'Sending…' : 'Confirm & Send'}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted">
                    Files are auto-renamed as shown and the partner&apos;s SOP onboarding starts
                    automatically after send.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
