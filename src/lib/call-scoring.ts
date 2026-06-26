// AI quality-scoring for recorded telecalling calls.
//
// Gemini 2.5 Flash reads the call audio directly — so transcription AND scoring
// happen in a single request (no separate speech-to-text service). The model is
// asked to return strict JSON we store as the call's "report card".

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODEL = process.env.CALL_SCORING_MODEL || 'gemini-2.5-flash'

export interface ReportDimension {
  name: string
  score: number
  note: string
}

export interface ReportCard {
  transcript: string
  overall_score: number
  dimensions: ReportDimension[]
  strengths: string[]
  coaching: string[]
  flagged_moment: string
}

const RUBRIC_DIMENSIONS = [
  'Greeting & intro',
  'Discovery (needs first)',
  'Pitch accuracy',
  'Objection handling',
  'Tone / sentiment',
  'Talk-to-listen ratio',
  'Clear next step',
]

const PROMPT = `You are a QA reviewer for the telecalling team of The Belgian Waffle Xpress (TBWX), a franchise brand in India.
The attached audio is a sales call between a TELECALLER (the "Agent") and a prospective franchise LEAD. The conversation may be in Hindi, English, or Hinglish.

Do two things:
1. Transcribe the call. Label each line "Agent:" or "Lead:".
2. Score the AGENT's performance for quality and coaching.

Return ONLY a JSON object (no markdown, no commentary) with EXACTLY this shape:
{
  "transcript": "full transcript with Agent:/Lead: labels and newlines",
  "overall_score": <number 0-10, one decimal ok>,
  "dimensions": [
    ${RUBRIC_DIMENSIONS.map(d => `{ "name": "${d}", "score": <0-10>, "note": "<one short sentence>" }`).join(',\n    ')}
  ],
  "strengths": ["<short bullet>", "..."],
  "coaching": ["<specific, actionable coaching point>", "..."],
  "flagged_moment": "<the single most important moment to review, with a rough time or quote — empty string if none>"
}

Scoring guidance: reward genuine discovery before pitching, accurate franchise facts, calm objection handling, a healthy talk-to-listen balance, and a concrete locked next step. Penalize dismissiveness, dodging price, and calls that end with no commitment.`

function parseJsonLoose(text: string): unknown {
  // Strip ```json fences and grab the outermost {...} block.
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1))
    }
    throw new Error('Gemini response was not valid JSON')
  }
}

function coerceReportCard(raw: unknown): ReportCard {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const dims = Array.isArray(o.dimensions) ? o.dimensions : []
  return {
    transcript: String(o.transcript || ''),
    overall_score: Number(o.overall_score) || 0,
    dimensions: dims.map((d) => {
      const dd = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
      return { name: String(dd.name || ''), score: Number(dd.score) || 0, note: String(dd.note || '') }
    }),
    strengths: Array.isArray(o.strengths) ? o.strengths.map(String) : [],
    coaching: Array.isArray(o.coaching) ? o.coaching.map(String) : [],
    flagged_moment: String(o.flagged_moment || ''),
  }
}

/**
 * Transcribe + score a call recording. `mp3` is the raw audio bytes.
 * Throws on hard failures so the caller can store the recording unscored.
 */
export async function scoreCallAudio(mp3: Buffer | ArrayBuffer): Promise<ReportCard> {
  const key = process.env.GOOGLE_AI_API_KEY
  if (!key) throw new Error('Missing GOOGLE_AI_API_KEY')

  const buf = Buffer.isBuffer(mp3) ? mp3 : Buffer.from(mp3)
  const base64 = buf.toString('base64')

  const res = await fetch(`${GEMINI_API}/${MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'audio/mpeg', data: base64 } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Gemini scoring failed (${res.status}): ${JSON.stringify(json)?.slice(0, 300)}`)
  }

  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
  if (!text.trim()) throw new Error('Gemini returned an empty response')

  return coerceReportCard(parseJsonLoose(text))
}
