/**
 * Who should own a lead auto-send is about to act on.
 *
 * The rule that matters: an owner already on the lead WINS over the rotation.
 * Assignments get set deliberately — an admin splitting a batch between agents,
 * or a re-enquiry handing someone back to the agent who already knows them —
 * and the round-robin used to overwrite that silently. On 29 Aug an agreed
 * 67/29 split became 101/2 within the hour.
 *
 * Keeping an existing owner also spends no rotation slot, so the round-robin
 * stays even across the leads that genuinely need assigning.
 */
export interface PoolAgent { name: string }

export interface AssigneeDecision {
  /** Agent to use. Empty when the pool is empty and there is no usable owner. */
  assignedTo: string
  /** True when the caller should advance its round-robin counter. */
  consumedRotationSlot: boolean
  reason: 'kept-existing-owner' | 'rotated' | 'no-agents'
}

export function resolveAssignee(
  existingOwner: string | undefined,
  pool: PoolAgent[],
  counter: number,
): AssigneeDecision {
  const owner = (existingOwner || '').trim()

  // Only honour an owner who can still take leads. An agent who left, or was
  // paused out of the pool, must not keep collecting new work.
  if (owner && pool.some(a => a.name === owner)) {
    return { assignedTo: owner, consumedRotationSlot: false, reason: 'kept-existing-owner' }
  }

  if (pool.length === 0) {
    return { assignedTo: '', consumedRotationSlot: false, reason: 'no-agents' }
  }

  const idx = ((counter % pool.length) + pool.length) % pool.length
  return { assignedTo: pool[idx].name, consumedRotationSlot: true, reason: 'rotated' }
}
