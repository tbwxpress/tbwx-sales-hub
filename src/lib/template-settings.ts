/**
 * WhatsApp template name settings — DB-backed so admin can swap templates
 * via the Admin panel without redeploys.
 *
 * Defaults are applied only when the DB has no stored value (e.g. first
 * boot of a new deploy). Admin can override either at any time.
 */

import { getSetting, setSetting } from './db'

export const TEMPLATE_SETTING_KEYS = {
  OPT_IN: 'template.opt_in',
  MARKETING_FIRST: 'template.marketing_first',
} as const

export const TEMPLATE_DEFAULTS = {
  OPT_IN: 'opt_in_message',
  MARKETING_FIRST: 'franchise_inquiry_response',
} as const

export async function getOptInTemplateName(): Promise<string> {
  return (await getSetting(TEMPLATE_SETTING_KEYS.OPT_IN)) || TEMPLATE_DEFAULTS.OPT_IN
}

export async function getMarketingFirstTemplateName(): Promise<string> {
  return (await getSetting(TEMPLATE_SETTING_KEYS.MARKETING_FIRST)) || TEMPLATE_DEFAULTS.MARKETING_FIRST
}

export async function setOptInTemplateName(name: string): Promise<void> {
  await setSetting(TEMPLATE_SETTING_KEYS.OPT_IN, name)
}

export async function setMarketingFirstTemplateName(name: string): Promise<void> {
  await setSetting(TEMPLATE_SETTING_KEYS.MARKETING_FIRST, name)
}
