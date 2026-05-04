import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import {
  getOptInTemplateName,
  getMarketingFirstTemplateName,
  setOptInTemplateName,
  setMarketingFirstTemplateName,
  TEMPLATE_DEFAULTS,
} from '@/lib/template-settings'

export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const [optIn, marketingFirst] = await Promise.all([
      getOptInTemplateName(),
      getMarketingFirstTemplateName(),
    ])

    return NextResponse.json({
      success: true,
      data: {
        opt_in: optIn,
        marketing_first: marketingFirst,
        defaults: { opt_in: TEMPLATE_DEFAULTS.OPT_IN, marketing_first: TEMPLATE_DEFAULTS.MARKETING_FIRST },
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { opt_in, marketing_first } = await req.json()

    if (typeof opt_in === 'string' && opt_in.trim()) {
      await setOptInTemplateName(opt_in.trim())
    }
    if (typeof marketing_first === 'string' && marketing_first.trim()) {
      await setMarketingFirstTemplateName(marketing_first.trim())
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
