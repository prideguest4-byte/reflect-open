import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NoteRow } from '@reflect/core'
import {
  applyNoteRowOverlay,
  reconcileNoteRowOverlay,
  resetNoteRowOverlays,
  setNoteRowOverlay,
  useNoteRowOverlay,
} from './note-row-overlay'

function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    path: 'notes/a.md',
    title: 'A',
    dailyDate: null,
    isPrivate: false,
    hasConflict: false,
    gistUrl: null,
    gistStale: false,
    ...overrides,
  }
}

const URL = 'https://gist.github.com/alex/g1'

beforeEach(() => {
  resetNoteRowOverlays()
})
afterEach(() => {
  resetNoteRowOverlays()
})

describe('applyNoteRowOverlay', () => {
  it('merges overlay fields over the row', () => {
    expect(applyNoteRowOverlay(noteRow(), { gistUrl: URL })?.gistUrl).toBe(URL)
  })

  it('passes a null row through — the overlay only sharpens an existing row', () => {
    expect(applyNoteRowOverlay(null, { gistUrl: URL })).toBeNull()
  })

  it('returns the same row reference when there is no overlay', () => {
    const row = noteRow({ gistUrl: 'kept' })
    expect(applyNoteRowOverlay(row, null)).toBe(row)
  })
})

describe('useNoteRowOverlay', () => {
  it('reflects a set overlay and scopes it to the path', () => {
    const { result } = renderHook(() => useNoteRowOverlay('notes/a.md'))
    const other = renderHook(() => useNoteRowOverlay('notes/b.md'))
    expect(result.current).toBeNull()

    act(() => setNoteRowOverlay('notes/a.md', { gistUrl: URL }))
    expect(result.current?.gistUrl).toBe(URL)
    expect(other.result.current).toBeNull()
  })
})

describe('reconcileNoteRowOverlay', () => {
  it('holds the overlay while the index still lags, retires it once they agree', () => {
    const { result } = renderHook(() => useNoteRowOverlay('notes/a.md'))
    act(() => setNoteRowOverlay('notes/a.md', { gistUrl: URL }))

    act(() => reconcileNoteRowOverlay('notes/a.md', noteRow({ gistUrl: null })))
    expect(result.current?.gistUrl).toBe(URL) // index hasn't caught up

    act(() => reconcileNoteRowOverlay('notes/a.md', noteRow({ gistUrl: URL })))
    expect(result.current).toBeNull() // index agrees → retired
  })

  it('holds the overlay against a null row (nothing to compare yet)', () => {
    const { result } = renderHook(() => useNoteRowOverlay('notes/a.md'))
    act(() => setNoteRowOverlay('notes/a.md', { gistUrl: URL }))
    act(() => reconcileNoteRowOverlay('notes/a.md', null))
    expect(result.current?.gistUrl).toBe(URL)
  })
})

describe('resetNoteRowOverlays', () => {
  it('drops every overlay (e.g. on a graph switch)', () => {
    const { result } = renderHook(() => useNoteRowOverlay('notes/a.md'))
    act(() => setNoteRowOverlay('notes/a.md', { gistUrl: URL }))
    expect(result.current?.gistUrl).toBe(URL)

    act(() => resetNoteRowOverlays())
    expect(result.current).toBeNull()
  })
})
