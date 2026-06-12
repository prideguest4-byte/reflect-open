import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphInfo, Settings } from '@reflect/core'

const getSecret = vi.hoisted(() => vi.fn<(name: string) => Promise<string | null>>())
const transcribeAudio = vi.hoisted(() => vi.fn<() => Promise<string>>())
const appendToDailyNote = vi.hoisted(() => vi.fn<() => Promise<void>>())
const failOperation = vi.hoisted(() => vi.fn<(message: string) => void>())
const toggleSidebar = vi.hoisted(() => vi.fn())

const recorderControls = vi.hoisted(() => ({
  startSpy: vi.fn(),
  stopSpy: vi.fn(),
  cancelSpy: vi.fn(),
  stopResult: null as { blob: Blob; mimeType: string; durationMs: number } | null,
  elapsedMs: 0,
  supported: true,
}))

const sidebarState = vi.hoisted(() => ({ collapsed: false }))

vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  getSecret,
  transcribeAudio,
  appendToDailyNote,
}))

vi.mock('@/hooks/use-audio-recorder', () => ({
  isRecordingSupported: () => recorderControls.supported,
  useAudioRecorder: () => {
    const [status, setStatus] = useState<'idle' | 'requesting' | 'recording'>('idle')
    return {
      status,
      elapsedMs: recorderControls.elapsedMs,
      stream: null,
      start: async () => {
        recorderControls.startSpy()
        setStatus('recording')
      },
      stop: async () => {
        recorderControls.stopSpy()
        setStatus('idle')
        return recorderControls.stopResult
      },
      cancel: () => {
        recorderControls.cancelSpy()
        setStatus('idle')
      },
    }
  },
}))

const SETTINGS = vi.hoisted(() => ({
  current: {
    aiModels: [{ id: 'cfg-openai', provider: 'openai', model: 'gpt-5.1', keyHint: 'wxyz1' }],
    defaultAiModelId: 'cfg-openai',
  },
}))

vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: SETTINGS.current as unknown as Settings }),
}))
vi.mock('@/providers/sidebar-provider', () => ({
  useSidebar: () => ({ collapsed: sidebarState.collapsed, toggleSidebar }),
}))
vi.mock('@/lib/provider-fetch', () => ({
  providerFetch: vi.fn(),
}))
vi.mock('@/lib/operations', () => ({
  startOperation: () => ({ progress: vi.fn(), done: vi.fn(), fail: failOperation }),
}))

const { AudioMemoProvider, useAudioMemo } = await import('./audio-memo-provider')

const GRAPH: GraphInfo = { root: '/notes', name: 'Notes', cloudSync: null, generation: 3 }

function wrapper({ children }: { children: ReactNode }): ReactElement {
  return <AudioMemoProvider graph={GRAPH}>{children}</AudioMemoProvider>
}

const RECORDING = {
  blob: new Blob(['audio'], { type: 'audio/mp4' }),
  mimeType: 'audio/mp4',
  durationMs: 4000,
}

beforeEach(() => {
  vi.clearAllMocks()
  recorderControls.stopResult = RECORDING
  recorderControls.elapsedMs = 0
  recorderControls.supported = true
  sidebarState.collapsed = false
  SETTINGS.current = {
    aiModels: [{ id: 'cfg-openai', provider: 'openai', model: 'gpt-5.1', keyHint: 'wxyz1' }],
    defaultAiModelId: 'cfg-openai',
  }
  getSecret.mockResolvedValue('sk-live-key')
  transcribeAudio.mockResolvedValue('memo transcript')
  appendToDailyNote.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('AudioMemoProvider', () => {
  it('toggle records, then stops, transcribes with the configured key, and appends to today', async () => {
    const { result } = renderHook(() => useAudioMemo(), { wrapper })
    expect(result.current.available).toBe(true)

    await act(async () => {
      result.current.toggle()
    })
    expect(result.current.phase).toBe('recording')

    await act(async () => {
      result.current.toggle()
    })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    expect(getSecret).toHaveBeenCalledWith('ai-api-key:cfg-openai')
    expect(transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'sk-live-key',
        audio: RECORDING.blob,
        mimeType: 'audio/mp4',
      }),
    )
    expect(appendToDailyNote).toHaveBeenCalledWith({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      text: 'memo transcript',
      generation: 3,
    })
  })

  it('a too-short recording is discarded without transcription', async () => {
    recorderControls.stopResult = null
    const { result } = renderHook(() => useAudioMemo(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })
    await act(async () => {
      result.current.toggle()
    })

    expect(result.current.phase).toBe('idle')
    expect(transcribeAudio).not.toHaveBeenCalled()
  })

  it('a transcription failure parks an error whose retry re-transcribes', async () => {
    transcribeAudio.mockRejectedValueOnce({ kind: 'network', message: 'provider down' })
    const { result } = renderHook(() => useAudioMemo(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })
    await act(async () => {
      result.current.toggle()
    })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error).toBe('provider down')
    expect(result.current.canRetry).toBe(true)

    await act(async () => {
      result.current.retry()
    })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(transcribeAudio).toHaveBeenCalledTimes(2)
    expect(appendToDailyNote).toHaveBeenCalledTimes(1)
  })

  it('an append failure retries the append only — transcription is never paid twice', async () => {
    appendToDailyNote.mockRejectedValueOnce({ kind: 'io', message: 'disk full' })
    const { result } = renderHook(() => useAudioMemo(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })
    await act(async () => {
      result.current.toggle()
    })
    await waitFor(() => expect(result.current.phase).toBe('error'))

    await act(async () => {
      result.current.retry()
    })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(transcribeAudio).toHaveBeenCalledTimes(1)
    expect(appendToDailyNote).toHaveBeenCalledTimes(2)
    expect(appendToDailyNote).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'memo transcript' }),
    )
  })

  it('an empty transcript surfaces as a non-retryable error', async () => {
    transcribeAudio.mockResolvedValue('')
    const { result } = renderHook(() => useAudioMemo(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })
    await act(async () => {
      result.current.toggle()
    })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.canRetry).toBe(false)
    expect(appendToDailyNote).not.toHaveBeenCalled()

    act(() => {
      result.current.discard()
    })
    expect(result.current.phase).toBe('idle')
  })

  it('collapsing the sidebar mid-recording stops and saves', async () => {
    const { result, rerender } = renderHook(() => useAudioMemo(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })
    expect(result.current.phase).toBe('recording')

    sidebarState.collapsed = true
    await act(async () => {
      rerender()
    })

    await waitFor(() => expect(appendToDailyNote).toHaveBeenCalled())
  })

  it('a failure while the sidebar is collapsed surfaces through operations', async () => {
    transcribeAudio.mockRejectedValueOnce({ kind: 'network', message: 'provider down' })
    const { result, rerender } = renderHook(() => useAudioMemo(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })
    sidebarState.collapsed = true
    await act(async () => {
      rerender()
    })

    await waitFor(() => expect(failOperation).toHaveBeenCalledWith('provider down'))
  })

  it('starting from a collapsed sidebar expands it first', async () => {
    sidebarState.collapsed = true
    const { result } = renderHook(() => useAudioMemo(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })

    expect(toggleSidebar).toHaveBeenCalled()
    expect(recorderControls.startSpy).toHaveBeenCalled()
  })

  it('is unavailable without an OpenAI or Gemini model, and toggle is a no-op', async () => {
    SETTINGS.current = {
      aiModels: [
        { id: 'claude', provider: 'anthropic', model: 'claude-fable-5', keyHint: 'wxyz1' },
      ],
      defaultAiModelId: 'claude',
    }
    const { result } = renderHook(() => useAudioMemo(), { wrapper })

    expect(result.current.available).toBe(false)
    expect(result.current.unavailableReason).toMatch(/OpenAI or Gemini/)

    await act(async () => {
      result.current.toggle()
    })
    expect(result.current.phase).toBe('idle')
    expect(recorderControls.startSpy).not.toHaveBeenCalled()
  })

  it('cancel discards the recording without saving', async () => {
    const { result } = renderHook(() => useAudioMemo(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })
    act(() => {
      result.current.cancel()
    })

    expect(result.current.phase).toBe('idle')
    expect(recorderControls.cancelSpy).toHaveBeenCalled()
    expect(transcribeAudio).not.toHaveBeenCalled()
  })
})
