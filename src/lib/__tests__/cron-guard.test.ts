import { describe, it, expect, vi, afterEach } from 'vitest'
import { withCronLock, isCronRunning, createCronContext } from '../cron-guard'

/**
 * The incident this guards against: an hourly cron (work-autobounce) ran for
 * 9+ minutes at ~100% CPU, and the next tick / a manual POST started a second
 * copy on top of it. withCronLock must let exactly one run of a job through at
 * a time and hand the job a budget it can check.
 */

const ok = (body: unknown = { success: true }) => Response.json(body)

// A run we can hold open and finish from the test.
function heldRun() {
  let release!: () => void
  const gate = new Promise<void>(r => { release = r })
  return { gate, release }
}

describe('withCronLock', () => {
  afterEach(() => { vi.useRealTimers() })

  it('runs the job and returns its response', async () => {
    const res = await withCronLock('t-basic', { budgetMs: 1000 }, async () => ok({ ran: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ran: true })
    expect(isCronRunning('t-basic')).toBe(false)
  })

  it('answers 409 "already running" while a run is in flight, then frees the lock', async () => {
    const { gate, release } = heldRun()
    const first = withCronLock('t-overlap', { budgetMs: 60_000 }, async () => { await gate; return ok() })
    expect(isCronRunning('t-overlap')).toBe(true)

    const second = await withCronLock('t-overlap', { budgetMs: 60_000 }, async () => ok({ ran: 'second' }))
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ skipped: true, reason: 'already running', job: 't-overlap' })

    release()
    expect((await first).status).toBe(200)
    expect(isCronRunning('t-overlap')).toBe(false)
    const third = await withCronLock('t-overlap', { budgetMs: 60_000 }, async () => ok({ ran: 'third' }))
    expect(await third.json()).toEqual({ ran: 'third' })
  })

  it('keeps different jobs independent', async () => {
    const { gate, release } = heldRun()
    const a = withCronLock('t-job-a', { budgetMs: 60_000 }, async () => { await gate; return ok() })
    const b = await withCronLock('t-job-b', { budgetMs: 60_000 }, async () => ok({ job: 'b' }))
    expect(b.status).toBe(200)
    release()
    await a
  })

  it('releases the lock when the job throws', async () => {
    await expect(
      withCronLock('t-throw', { budgetMs: 1000 }, async () => { throw new Error('boom') }),
    ).rejects.toThrow('boom')
    expect(isCronRunning('t-throw')).toBe(false)
  })

  it('lets a new run take over a lock held past staleMs (a hung run must not disable the job)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { gate, release } = heldRun()
    const hung = withCronLock('t-stale', { budgetMs: 1000, staleMs: 5000 }, async () => { await gate; return ok({ run: 'hung' }) })

    vi.setSystemTime(new Date('2026-10-07T00:00:04Z'))
    expect((await withCronLock('t-stale', { budgetMs: 1000, staleMs: 5000 }, async () => ok())).status).toBe(409)

    vi.setSystemTime(new Date('2026-10-07T00:00:06Z'))
    const { gate: gate2, release: release2 } = heldRun()
    const fresh = withCronLock('t-stale', { budgetMs: 1000, staleMs: 5000 }, async () => { await gate2; return ok({ run: 'fresh' }) })
    expect(errSpy).toHaveBeenCalled()

    // The hung run finishing late must NOT release the fresh run's lock.
    release()
    await hung
    expect(isCronRunning('t-stale')).toBe(true)
    release2()
    expect(await (await fresh).json()).toEqual({ run: 'fresh' })
    expect(isCronRunning('t-stale')).toBe(false)
    errSpy.mockRestore()
  })

  it('passes a budget the job can check', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'))
    let seen: { left0: number; out0: boolean; left1: number; out1: boolean } | null = null
    await withCronLock('t-budget', { budgetMs: 90_000 }, async (ctx) => {
      const left0 = ctx.timeLeft()
      const out0 = ctx.outOfTime()
      vi.setSystemTime(new Date('2026-10-07T00:01:31Z'))
      seen = { left0, out0, left1: ctx.timeLeft(), out1: ctx.outOfTime() }
      return ok()
    })
    expect(seen).toEqual({ left0: 90_000, out0: false, left1: 0, out1: true })
  })
})

describe('createCronContext', () => {
  it('is out of time immediately with a zero budget', () => {
    const ctx = createCronContext(0)
    expect(ctx.outOfTime()).toBe(true)
    expect(ctx.timeLeft()).toBe(0)
  })
})
