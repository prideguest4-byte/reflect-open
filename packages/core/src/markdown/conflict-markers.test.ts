import { describe, expect, it } from 'vitest'
import { detectConflictMarkers, resolveConflictMarkers } from './conflict-markers'

const CONFLICTED = [
  '# Shared',
  '',
  '<<<<<<< this device',
  'edited on a',
  '=======',
  'edited on b',
  '>>>>>>> other device',
  '',
].join('\n')

describe('detectConflictMarkers', () => {
  it('detects a complete labeled marker block', () => {
    expect(detectConflictMarkers(CONFLICTED)).toBe(true)
  })

  it('detects markers with CRLF line endings', () => {
    expect(detectConflictMarkers(CONFLICTED.replaceAll('\n', '\r\n'))).toBe(true)
  })

  it('requires the full sequence in order', () => {
    expect(detectConflictMarkers('plain note body')).toBe(false)
    expect(detectConflictMarkers('<<<<<<< this device\nno separator or end')).toBe(false)
    expect(detectConflictMarkers('=======\n>>>>>>> other device\n<<<<<<< late start')).toBe(false)
  })

  it('ignores prose that merely mentions a marker line', () => {
    const prose = 'Git writes `>>>>>>> theirs` after a `=======` separator.'
    expect(detectConflictMarkers(prose)).toBe(false)
  })

  it('requires a label after the start/end arrows (as git writes them)', () => {
    expect(detectConflictMarkers('<<<<<<<\nx\n=======\ny\n>>>>>>>')).toBe(false)
  })

  it('clears once the user resolves by editing the markers away', () => {
    const resolved = CONFLICTED.split('\n')
      .filter((line) => !line.startsWith('<<<<<<<') && line !== '=======' && !line.startsWith('>>>>>>>'))
      .join('\n')
    expect(detectConflictMarkers(resolved)).toBe(false)
  })
})

describe('resolveConflictMarkers', () => {
  it('keeps this device’s side', () => {
    const resolved = resolveConflictMarkers(CONFLICTED, 'ours')
    expect(resolved).toBe('# Shared\n\nedited on a\n')
    expect(detectConflictMarkers(resolved)).toBe(false)
  })

  it('keeps the other device’s side', () => {
    expect(resolveConflictMarkers(CONFLICTED, 'theirs')).toBe('# Shared\n\nedited on b\n')
  })

  it('keeps both sides in order (the daily-note append case)', () => {
    expect(resolveConflictMarkers(CONFLICTED, 'both')).toBe(
      '# Shared\n\nedited on a\nedited on b\n',
    )
  })

  it('resolves every block and leaves surrounding text byte-identical', () => {
    const twoBlocks = [
      'intro',
      '<<<<<<< this device',
      'a1',
      '=======',
      'b1',
      '>>>>>>> other device',
      'middle  ', // trailing spaces survive
      '<<<<<<< this device',
      'a2',
      '=======',
      'b2',
      '>>>>>>> other device',
      'outro',
    ].join('\n')
    expect(resolveConflictMarkers(twoBlocks, 'theirs')).toBe(
      'intro\nb1\nmiddle  \nb2\noutro',
    )
  })

  it('handles CRLF sources', () => {
    const resolved = resolveConflictMarkers(CONFLICTED.replaceAll('\n', '\r\n'), 'ours')
    expect(resolved).toBe('# Shared\r\n\r\nedited on a\r\n')
  })

  it('tolerates an unterminated block without throwing or dropping text', () => {
    const truncated = 'before\n<<<<<<< this device\nkept line'
    expect(resolveConflictMarkers(truncated, 'ours')).toBe('before\nkept line')
    expect(resolveConflictMarkers(truncated, 'theirs')).toBe('before')
  })

  it('is the identity on unconflicted text', () => {
    expect(resolveConflictMarkers('plain\ntext\n', 'ours')).toBe('plain\ntext\n')
  })
})
