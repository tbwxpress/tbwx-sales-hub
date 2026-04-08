'use client'

import { useState } from 'react'
import { formatRupeesLegal } from '@/lib/number-to-words'

interface Props {
  leadName: string
  leadPhone: string
  leadRow?: number
  leadCity?: string
  userRole: string
  onClose: () => void
  onSuccess: () => void
}

type DocType = 'FBA' | 'FRANCHISE_AGREEMENT'

interface Fields {
  agreement_date: string
  agreement_term: string
  franchisee_name: string
  franchisee_relation: string
  franchisee_address: string
  franchisee_pan: string
  franchisee_uid: string
  // FBA specific
  num_outlets: string
  outlet_locations: string
  total_franchise_fee: string
  booking_amount_per_outlet: string
  // Agreement specific
  outlet_type: string
  outlet_address: string
  franchise_fee: string
  royalty_pct: string
  min_royalty: string
  royalty_cooling_period: string
  territory_radius: string
}

const INITIAL_FIELDS: Fields = {
  agreement_date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
  agreement_term: 'Three (3) years',
  franchisee_name: '',
  franchisee_relation: '',
  franchisee_address: '',
  franchisee_pan: '',
  franchisee_uid: '',
  num_outlets: '1',
  outlet_locations: '',
  total_franchise_fee: '',
  booking_amount_per_outlet: 'Rs. 20,000 (Rupees Twenty Thousand Only)',
  outlet_type: 'Takeaway Restaurant',
  outlet_address: '',
  franchise_fee: '',
  royalty_pct: '5',
  min_royalty: 'Rs 5,000/- (Five thousand rupees only)',
  royalty_cooling_period: 'Two months',
  territory_radius: '3 square km',
}

const STEPS = ['Document Type', 'Franchisee Details', 'Outlet Details', 'Financial Terms', 'Review & Generate']

export default function AgreementForm({ leadName, leadPhone, leadRow, leadCity, userRole, onClose, onSuccess }: Props) {
  const [step, setStep] = useState(0)
  const [docType, setDocType] = useState<DocType>('FRANCHISE_AGREEMENT')
  const [fields, setFields] = useState<Fields>({ ...INITIAL_FIELDS, franchisee_name: leadName.toUpperCase() })
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [agreementId, setAgreementId] = useState<string | null>(null)

  function updateField(key: keyof Fields, value: string) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  function autoFormatFee(amount: string): string {
    const num = parseInt(amount.replace(/\D/g, ''))
    if (isNaN(num) || num === 0) return ''
    return formatRupeesLegal(num)
  }

  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(fields.franchisee_pan)
  const uidValid = /^\d{12}$/.test(fields.franchisee_uid)

  async function saveDraft() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_phone: leadPhone,
          lead_row: leadRow,
          doc_type: docType,
          fields,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAgreementId(data.id)
        onSuccess()
      } else {
        setError(data.error || 'Failed to save')
      }
    } catch { setError('Network error') }
    setSaving(false)
  }

  async function generatePdf() {
    if (!agreementId) {
      await saveDraft()
      return
    }
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/agreements/${agreementId}/generate`, { method: 'POST' })
      if (res.ok) {
        const html = await res.text()
        const win = window.open('', '_blank')
        if (win) {
          win.document.write(html)
          win.document.close()
          // Auto-trigger print dialog after a short delay
          setTimeout(() => win.print(), 500)
        }
        onSuccess()
        onClose()
      } else {
        const data = await res.json()
        setError(data.error || 'Generation failed')
      }
    } catch { setError('Network error') }
    setGenerating(false)
  }

  const inputCls = "w-full bg-elevated border border-border rounded-md px-3 py-2 text-sm text-text placeholder-dim focus:outline-none focus:border-accent/50"
  const labelCls = "text-xs text-dim block mb-1"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text">Generate Agreement</h2>
            <p className="text-xs text-dim mt-0.5">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
          </div>
          <button onClick={onClose} className="text-dim hover:text-text transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-border'}`} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-danger/10 border border-danger/20 text-danger text-xs">{error}</div>
          )}

          {/* Step 0: Document Type */}
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted mb-4">Which document do you want to generate?</p>
              {[
                { value: 'FBA' as DocType, label: 'Franchise Booking Agreement (FBA)', desc: '3-page booking agreement with slot reservation and initial fee' },
                { value: 'FRANCHISE_AGREEMENT' as DocType, label: 'Franchise Agreement', desc: 'Full 15-page legal franchise agreement with all terms and conditions' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDocType(opt.value)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    docType === opt.value ? 'border-accent bg-accent/10' : 'border-border hover:border-border-light'
                  }`}
                >
                  <div className="text-sm font-semibold text-text">{opt.label}</div>
                  <div className="text-xs text-dim mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* Step 1: Franchisee Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Full Name <span className="text-danger">*</span></label>
                <input value={fields.franchisee_name} onChange={e => updateField('franchisee_name', e.target.value.toUpperCase())} placeholder="e.g. SHIVANI ARORA" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Relation (S/O, W/O, D/O, C/O)</label>
                <input value={fields.franchisee_relation} onChange={e => updateField('franchisee_relation', e.target.value)} placeholder="e.g. c/o ROHIT ARORA" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Full Address <span className="text-danger">*</span></label>
                <textarea value={fields.franchisee_address} onChange={e => updateField('franchisee_address', e.target.value)} placeholder="Full address with PIN code" rows={3} className={inputCls + " resize-none"} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>PAN Number <span className="text-danger">*</span></label>
                  <input value={fields.franchisee_pan} onChange={e => updateField('franchisee_pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} className={`${inputCls} ${fields.franchisee_pan && !panValid ? 'border-danger/50' : ''}`} />
                  {fields.franchisee_pan && !panValid && <p className="text-[10px] text-danger mt-1">Format: 5 letters + 4 digits + 1 letter</p>}
                </div>
                <div>
                  <label className={labelCls}>Aadhar/UID <span className="text-danger">*</span></label>
                  <input value={fields.franchisee_uid} onChange={e => updateField('franchisee_uid', e.target.value.replace(/\D/g, ''))} placeholder="123456789012" maxLength={12} className={`${inputCls} ${fields.franchisee_uid && !uidValid ? 'border-danger/50' : ''}`} />
                  {fields.franchisee_uid && !uidValid && <p className="text-[10px] text-danger mt-1">Must be exactly 12 digits</p>}
                </div>
              </div>
              <div>
                <label className={labelCls}>Agreement Date</label>
                <input value={fields.agreement_date} onChange={e => updateField('agreement_date', e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {/* Step 2: Outlet Details */}
          {step === 2 && (
            <div className="space-y-4">
              {docType === 'FBA' ? (
                <>
                  <div>
                    <label className={labelCls}>Number of Outlets</label>
                    <input type="number" min={1} max={20} value={fields.num_outlets} onChange={e => updateField('num_outlets', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Outlet Locations <span className="text-danger">*</span></label>
                    <textarea value={fields.outlet_locations} onChange={e => updateField('outlet_locations', e.target.value)} placeholder={"1) PHAGWARA-PUNJAB\n2) NAKODAR-PUNJAB\n3) JALANDHAR-PUNJAB"} rows={5} className={inputCls + " resize-none font-mono text-xs"} />
                    <p className="text-[10px] text-dim mt-1">One location per line, numbered. Format: CITY-STATE</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>Outlet Type <span className="text-danger">*</span></label>
                    <select value={fields.outlet_type} onChange={e => updateField('outlet_type', e.target.value)} className={inputCls}>
                      <option value="Takeaway Restaurant">Takeaway Restaurant</option>
                      <option value="Kiosk">Kiosk</option>
                      <option value="Cafe">Cafe</option>
                      <option value="Cloud Kitchen">Cloud Kitchen</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Outlet Full Address <span className="text-danger">*</span></label>
                    <textarea value={fields.outlet_address} onChange={e => updateField('outlet_address', e.target.value)} placeholder="Shop No. 1, Near Royal Dharam Kanta, Piprali Road, Sikar. PIN 332001" rows={3} className={inputCls + " resize-none"} />
                  </div>
                  <div>
                    <label className={labelCls}>Territory Radius</label>
                    <input value={fields.territory_radius} onChange={e => updateField('territory_radius', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Agreement Term</label>
                    <select value={fields.agreement_term} onChange={e => updateField('agreement_term', e.target.value)} className={inputCls}>
                      <option value="Two (2) years">2 Years</option>
                      <option value="Three (3) years">3 Years</option>
                      <option value="Five (5) years">5 Years</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Financial Terms */}
          {step === 3 && (
            <div className="space-y-4">
              {docType === 'FBA' ? (
                <>
                  <div>
                    <label className={labelCls}>Total Franchise Fee (enter number) <span className="text-danger">*</span></label>
                    <input type="number" value={fields.total_franchise_fee.replace(/\D/g, '')} onChange={e => {
                      const num = e.target.value
                      updateField('total_franchise_fee', num ? autoFormatFee(num) : '')
                    }} placeholder="90000" className={inputCls} />
                    {fields.total_franchise_fee && (
                      <p className="text-xs text-accent mt-1">{fields.total_franchise_fee}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Booking Amount Per Outlet</label>
                    <input value={fields.booking_amount_per_outlet} onChange={e => updateField('booking_amount_per_outlet', e.target.value)} className={inputCls} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>Initial Franchise Fee (enter number) <span className="text-danger">*</span></label>
                    <input type="number" value={fields.franchise_fee.replace(/\D/g, '')} onChange={e => {
                      const num = e.target.value
                      updateField('franchise_fee', num ? autoFormatFee(num) : '')
                    }} placeholder="150000" className={inputCls} />
                    {fields.franchise_fee && (
                      <p className="text-xs text-accent mt-1">{fields.franchise_fee}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Royalty %</label>
                      <input value={fields.royalty_pct} onChange={e => updateField('royalty_pct', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Minimum Royalty</label>
                      <input value={fields.min_royalty} onChange={e => updateField('min_royalty', e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Royalty Cooling Period</label>
                    <select value={fields.royalty_cooling_period} onChange={e => updateField('royalty_cooling_period', e.target.value)} className={inputCls}>
                      <option value="One month">1 Month</option>
                      <option value="Two months">2 Months</option>
                      <option value="Three months">3 Months</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Review & Generate */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-warning font-semibold">This is a legal document. Please verify all details below before generating.</p>
              </div>

              <div className="bg-elevated/30 border border-border rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-dim">Document</span><span className="text-text font-medium">{docType === 'FBA' ? 'Franchise Booking Agreement' : 'Franchise Agreement'}</span></div>
                <div className="flex justify-between"><span className="text-dim">Date</span><span className="text-text">{fields.agreement_date}</span></div>
                <div className="border-t border-border/50 my-2" />
                <div className="flex justify-between"><span className="text-dim">Franchisee</span><span className="text-text font-medium">{fields.franchisee_name}</span></div>
                {fields.franchisee_relation && <div className="flex justify-between"><span className="text-dim">Relation</span><span className="text-text">{fields.franchisee_relation}</span></div>}
                <div className="flex justify-between"><span className="text-dim">Address</span><span className="text-text text-right max-w-[60%]">{fields.franchisee_address}</span></div>
                <div className="flex justify-between"><span className="text-dim">PAN</span><span className="text-text font-mono">{fields.franchisee_pan}</span></div>
                <div className="flex justify-between"><span className="text-dim">Aadhar</span><span className="text-text font-mono">{fields.franchisee_uid}</span></div>
                <div className="border-t border-border/50 my-2" />
                {docType === 'FBA' ? (
                  <>
                    <div className="flex justify-between"><span className="text-dim">Outlets</span><span className="text-text">{fields.num_outlets}</span></div>
                    <div><span className="text-dim block mb-1">Locations:</span><pre className="text-text text-xs whitespace-pre-wrap">{fields.outlet_locations}</pre></div>
                    <div className="flex justify-between"><span className="text-dim">Total Fee</span><span className="text-accent font-medium">{fields.total_franchise_fee}</span></div>
                    <div className="flex justify-between"><span className="text-dim">Booking/outlet</span><span className="text-text">{fields.booking_amount_per_outlet}</span></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-dim">Outlet Type</span><span className="text-text">{fields.outlet_type}</span></div>
                    <div className="flex justify-between"><span className="text-dim">Outlet Address</span><span className="text-text text-right max-w-[60%]">{fields.outlet_address}</span></div>
                    <div className="flex justify-between"><span className="text-dim">Term</span><span className="text-text">{fields.agreement_term}</span></div>
                    <div className="flex justify-between"><span className="text-dim">Franchise Fee</span><span className="text-accent font-medium">{fields.franchise_fee}</span></div>
                    <div className="flex justify-between"><span className="text-dim">Royalty</span><span className="text-text">{fields.royalty_pct}% + taxes (min {fields.min_royalty})</span></div>
                    <div className="flex justify-between"><span className="text-dim">Cooling Period</span><span className="text-text">{fields.royalty_cooling_period}</span></div>
                    <div className="flex justify-between"><span className="text-dim">Territory</span><span className="text-text">{fields.territory_radius}</span></div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} className="text-sm text-muted hover:text-text transition-colors">
                &larr; Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                Next &rarr;
              </button>
            ) : (
              <>
                <button
                  onClick={saveDraft}
                  disabled={saving}
                  className="bg-elevated hover:bg-border text-muted text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : agreementId ? 'Draft Saved' : 'Save Draft'}
                </button>
                {userRole === 'admin' && (
                  <button
                    onClick={generatePdf}
                    disabled={generating || !fields.franchisee_name || !fields.franchisee_pan}
                    className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {generating ? 'Generating...' : 'Generate PDF'}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
