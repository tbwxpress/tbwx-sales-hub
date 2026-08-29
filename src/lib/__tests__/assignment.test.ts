import { describe, it, expect } from 'vitest'
import { resolveAssignee } from '../assignment'

const pool = [{ name: 'Anmol' }, { name: 'Happy' }]

describe('resolveAssignee', () => {
  it('keeps an owner who is already on the lead', () => {
    const d = resolveAssignee('Happy', pool, 0)
    expect(d.assignedTo).toBe('Happy')
    expect(d.reason).toBe('kept-existing-owner')
  })

  it('does not spend a rotation slot when it keeps an owner', () => {
    // The bug this prevents: an admin-set batch (67 Anmol / 29 Happy) was
    // re-rotated into 101/2 on 29 Aug because every lead consumed a slot.
    expect(resolveAssignee('Happy', pool, 0).consumedRotationSlot).toBe(false)
    expect(resolveAssignee('', pool, 0).consumedRotationSlot).toBe(true)
  })

  it('rotates when the lead has no owner', () => {
    expect(resolveAssignee('', pool, 0).assignedTo).toBe('Anmol')
    expect(resolveAssignee(undefined, pool, 1).assignedTo).toBe('Happy')
    expect(resolveAssignee('   ', pool, 2).assignedTo).toBe('Anmol')
  })

  it('ignores an owner who is no longer in the pool — paused or departed', () => {
    // Happy is lead_pool_paused in prod, so she is not in activeAgents; a lead
    // still carrying her name must not keep collecting new work through her.
    const d = resolveAssignee('Happy', [{ name: 'Anmol' }], 0)
    expect(d.assignedTo).toBe('Anmol')
    expect(d.reason).toBe('rotated')
  })

  it('handles an empty pool without inventing an agent', () => {
    const d = resolveAssignee('', [], 3)
    expect(d.assignedTo).toBe('')
    expect(d.consumedRotationSlot).toBe(false)
    expect(d.reason).toBe('no-agents')
  })

  it('keeps a valid owner even when the pool is otherwise busy', () => {
    expect(resolveAssignee('Anmol', pool, 7).assignedTo).toBe('Anmol')
  })

  it('rotates evenly across a run of unowned leads', () => {
    let counter = 0
    const picked: string[] = []
    for (let i = 0; i < 6; i++) {
      const d = resolveAssignee('', pool, counter)
      picked.push(d.assignedTo)
      if (d.consumedRotationSlot) counter++
    }
    expect(picked).toEqual(['Anmol', 'Happy', 'Anmol', 'Happy', 'Anmol', 'Happy'])
  })

  it('an owned lead in the middle of a run does not skew the rotation', () => {
    let counter = 0
    const picked: string[] = []
    for (const owner of ['', '', 'Anmol', '', '']) {
      const d = resolveAssignee(owner, pool, counter)
      picked.push(d.assignedTo)
      if (d.consumedRotationSlot) counter++
    }
    expect(picked).toEqual(['Anmol', 'Happy', 'Anmol', 'Anmol', 'Happy'])
  })

  it('handles a negative counter without crashing', () => {
    expect(pool.map(p => p.name)).toContain(resolveAssignee('', pool, -3).assignedTo)
  })
})
