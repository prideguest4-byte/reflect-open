type EditAndTogglePhase = 'edit' | 'toggle'

interface EditAndToggleError {
  readonly phase: EditAndTogglePhase
  readonly cause: unknown
}

/** Wrap a failed edit-and-toggle sub-write so reconciliation can use the right cached row. */
export function editAndToggleError(phase: EditAndTogglePhase, cause: unknown): EditAndToggleError {
  return { phase, cause }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Return whether an unknown thrown value was produced by {@link editAndToggleError}. */
export function isEditAndToggleError(value: unknown): value is EditAndToggleError {
  if (!isRecord(value)) {
    return false
  }
  const phase = value['phase']
  return (phase === 'edit' || phase === 'toggle') && 'cause' in value
}
