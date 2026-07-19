// Admin API for WhatsApp Coexistence lines (/admin/wa-numbers).
// Middleware already restricts /api/admin/* to admin sessions; the session
// check here is defense-in-depth, same as the other admin routes.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/api-error'
import {
  listWaNumbers,
  upsertWaNumber,
  setWaNumberAgent,
  markWaNumberSynced,
  getSetting,
  setSetting,
} from '@/lib/db'
import { fetchWabaPhoneNumbers, requestSmbSync, buildEsDialogUrl } from '@/lib/coexistence'

const APP_ID_KEY = 'coex.meta_app_id'
const CONFIG_ID_KEY = 'coex.es_config_id'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const numbers = await listWaNumbers()
    // Attach per-line history-import progress breadcrumbs (written by the webhook).
    const withProgress = await Promise.all(
      numbers.map(async n => {
        let history_progress: unknown = null
        try {
          const raw = await getSetting(`coex.history.${String(n.phone_number_id)}`)
          if (raw) history_progress = JSON.parse(raw)
        } catch { /* breadcrumb is best-effort */ }
        return { ...n, history_progress }
      })
    )

    const appId = (await getSetting(APP_ID_KEY)) || ''
    const configId = (await getSetting(CONFIG_ID_KEY)) || ''
    return NextResponse.json({
      success: true,
      data: {
        numbers: withProgress,
        app_id: appId,
        config_id: configId,
        // Popup fallback when the FB JS SDK can't load — same Embedded Signup
        // flow as a plain OAuth dialog; session events postMessage to opener.
        dialog_url: appId && configId ? buildEsDialogUrl(appId, configId) : '',
        main_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        waba_id: process.env.WHATSAPP_WABA_ID || '',
      },
    })
  } catch (err) {
    console.error('[wa-numbers] GET error:', err)
    return NextResponse.json({ success: false, error: apiError(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }

    const body = await req.json()
    const action = String(body.action || '')

    if (action === 'config') {
      const appId = String(body.app_id || '').trim()
      const configId = String(body.config_id || '').trim()
      if (appId && !/^\d{5,20}$/.test(appId)) {
        return NextResponse.json({ success: false, error: 'App ID must be numeric' }, { status: 422 })
      }
      if (configId && !/^\d{5,20}$/.test(configId)) {
        return NextResponse.json({ success: false, error: 'Configuration ID must be numeric' }, { status: 422 })
      }
      await setSetting(APP_ID_KEY, appId)
      await setSetting(CONFIG_ID_KEY, configId)
      return NextResponse.json({ success: true })
    }

    if (action === 'refresh') {
      const result = await fetchWabaPhoneNumbers()
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'Could not reach Meta' }, { status: 502 })
      }
      const mainId = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
      for (const n of result.numbers || []) {
        await upsertWaNumber({
          phone_number_id: n.id,
          display_number: n.display_phone_number,
          verified_name: n.verified_name,
          is_main: n.id === mainId,
        })
      }
      return NextResponse.json({ success: true, data: { count: (result.numbers || []).length } })
    }

    if (action === 'assign') {
      const phoneNumberId = String(body.phone_number_id || '')
      const agentName = String(body.agent_name || '')
      if (!phoneNumberId) {
        return NextResponse.json({ success: false, error: 'phone_number_id required' }, { status: 422 })
      }
      await setWaNumberAgent(phoneNumberId, agentName)
      return NextResponse.json({ success: true })
    }

    if (action === 'sync') {
      const phoneNumberId = String(body.phone_number_id || '')
      if (!phoneNumberId) {
        return NextResponse.json({ success: false, error: 'phone_number_id required' }, { status: 422 })
      }
      if (phoneNumberId === (process.env.WHATSAPP_PHONE_NUMBER_ID || '')) {
        return NextResponse.json({ success: false, error: 'Main line is not a coexistence number — nothing to sync' }, { status: 422 })
      }
      // Contacts first, then history — Meta requires that order.
      const contacts = await requestSmbSync(phoneNumberId, 'smb_app_state_sync')
      if (contacts.success) await markWaNumberSynced(phoneNumberId, 'contacts')
      const history = await requestSmbSync(phoneNumberId, 'history')
      if (history.success) await markWaNumberSynced(phoneNumberId, 'history')
      const failed = [
        !contacts.success ? `contacts: ${contacts.error}` : '',
        !history.success ? `history: ${history.error}` : '',
      ].filter(Boolean)
      if (failed.length) {
        return NextResponse.json({ success: false, error: failed.join(' | ') }, { status: 502 })
      }
      return NextResponse.json({
        success: true,
        data: { contacts_request_id: contacts.request_id || '', history_request_id: history.request_id || '' },
      })
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 422 })
  } catch (err) {
    console.error('[wa-numbers] POST error:', err)
    return NextResponse.json({ success: false, error: apiError(err) }, { status: 500 })
  }
}
