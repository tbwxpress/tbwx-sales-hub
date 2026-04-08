import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getAgreementById, updateAgreement } from '@/lib/db'
import { readFileSync } from 'fs'
import { join } from 'path'

function loadAndFillTemplate(docType: string, fields: Record<string, string>): string {
  const templateFile = docType === 'FBA' ? 'fba.html' : 'franchise-agreement.html'
  let html = readFileSync(join(process.cwd(), 'src', 'templates', templateFile), 'utf-8')
  for (const [key, value] of Object.entries(fields)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), escapeHtml(value))
  }
  html = html.replace(/\{\{[a-z_]+\}\}/g, '')
  return html
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * GET /api/agreements/[id]/generate — View the filled agreement (any auth user)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params

    const agreement = await getAgreementById(id)
    if (!agreement) {
      return NextResponse.json({ success: false, error: 'Agreement not found' }, { status: 404 })
    }

    let fields: Record<string, string> = {}
    try { fields = JSON.parse(String(agreement.fields || '{}')) } catch { fields = {} }

    const html = loadAndFillTemplate(String(agreement.doc_type), fields)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

/**
 * POST /api/agreements/[id]/generate — Generate PDF from agreement template
 *
 * Admin only. Reads the HTML template, replaces {{placeholders}} with actual
 * field values, converts to PDF via the browser print API (client-side) or
 * server-side HTML rendering.
 *
 * Since Puppeteer is heavy for a Docker container, we use a simpler approach:
 * return the filled HTML that the client renders and prints to PDF via browser.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can generate agreements' }, { status: 403 })
    }

    const { id } = await params
    const agreement = await getAgreementById(id)

    if (!agreement) {
      return NextResponse.json({ success: false, error: 'Agreement not found' }, { status: 404 })
    }

    // Parse fields
    let fields: Record<string, string> = {}
    try { fields = JSON.parse(String(agreement.fields || '{}')) } catch { fields = {} }

    // Validate required fields before generation
    const docType = String(agreement.doc_type)
    const requiredFields = docType === 'FBA'
      ? ['franchisee_name', 'franchisee_address', 'franchisee_pan', 'franchisee_uid', 'agreement_date', 'total_franchise_fee']
      : ['franchisee_name', 'franchisee_address', 'franchisee_pan', 'franchisee_uid', 'agreement_date', 'franchise_fee', 'outlet_address']

    const missing = requiredFields.filter(f => !fields[f]?.trim())
    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
      }, { status: 400 })
    }

    // Load HTML template
    const templateFile = docType === 'FBA' ? 'fba.html' : 'franchise-agreement.html'
    let html: string
    try {
      html = readFileSync(join(process.cwd(), 'src', 'templates', templateFile), 'utf-8')
    } catch {
      return NextResponse.json({ success: false, error: 'Template file not found' }, { status: 500 })
    }

    // Replace all {{placeholder}} variables with actual values
    for (const [key, value] of Object.entries(fields)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      html = html.replace(placeholder, escapeHtml(value))
    }

    // Replace any remaining unfilled placeholders with empty string
    html = html.replace(/\{\{[a-z_]+\}\}/g, '')

    // Update agreement status
    await updateAgreement(id, {
      status: 'GENERATED',
      generated_by: user.name,
      generated_at: new Date().toISOString(),
    })

    // Return the filled HTML — client will render it in a new window for print-to-PDF
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${docType}-${id}.html"`,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'PDF generation failed') }, { status: 500 })
  }
}

