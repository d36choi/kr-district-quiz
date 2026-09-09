// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyPersonalRecords, recordRegionAnswer } from '../game/personalRecords'
import { usePersonalRecords } from './usePersonalRecords'

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}))

vi.mock('@apps-in-toss/web-framework', () => ({ Storage: storage }))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function answer(regionId: string, answeredAt: string) {
  return (records: ReturnType<typeof createEmptyPersonalRecords>) => recordRegionAnswer(records, {
    regionId,
    correct: true,
    answeredAt,
    questionType: 'recognition',
    sessionId: 'course-a',
  })
}

describe('usePersonalRecords write coordination', () => {
  beforeEach(() => {
    storage.getItem.mockReset()
    storage.setItem.mockReset()
  })

  afterEach(() => cleanup())

  it('updates each record synchronously while serializing immutable storage snapshots', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify(createEmptyPersonalRecords()))
    const firstWrite = deferred<void>()
    const writtenCombos: number[] = []
    storage.setItem.mockImplementation(async (_key: string, value: string) => {
      writtenCombos.push(JSON.parse(value).currentCombo)
      if (writtenCombos.length === 1) await firstWrite.promise
    })
    const { result } = renderHook(() => usePersonalRecords())
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'))

    act(() => result.current.updateRecords(answer('seoul:mapo', '2026-09-09T12:00:00+09:00')))
    expect(result.current.recordsV2.currentCombo).toBe(1)
    await waitFor(() => expect(writtenCombos).toEqual([1]))

    act(() => result.current.updateRecords(answer('seoul:jongno', '2026-09-09T12:01:00+09:00')))
    expect(result.current.recordsV2.currentCombo).toBe(2)
    expect(writtenCombos).toEqual([1])

    firstWrite.resolve()
    await waitFor(() => expect(writtenCombos).toEqual([1, 2]))
  })

  it('does not let an older retry-load snapshot replace newer in-memory progress', async () => {
    const emptyJson = JSON.stringify(createEmptyPersonalRecords())
    const retryRead = deferred<string | null>()
    storage.getItem
      .mockResolvedValueOnce(emptyJson)
      .mockImplementationOnce(() => retryRead.promise)
    const firstWrite = deferred<void>()
    storage.setItem.mockImplementationOnce(() => firstWrite.promise)
    const { result } = renderHook(() => usePersonalRecords())
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'))

    act(() => result.current.updateRecords(answer('seoul:mapo', '2026-09-09T12:00:00+09:00')))
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1))

    let retryPromise!: Promise<ReturnType<typeof createEmptyPersonalRecords>>
    act(() => { retryPromise = result.current.retryLoad() })
    act(() => result.current.updateRecords(answer('seoul:jongno', '2026-09-09T12:01:00+09:00')))
    expect(result.current.recordsV2.currentCombo).toBe(2)

    retryRead.resolve(emptyJson)
    await act(async () => { await retryPromise })
    expect(result.current.recordsV2.currentCombo).toBe(2)

    firstWrite.resolve()
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(2))
  })

  it('rejects a retry snapshot that predates an already-pending local write', async () => {
    const emptyJson = JSON.stringify(createEmptyPersonalRecords())
    const retryRead = deferred<string | null>()
    storage.getItem
      .mockResolvedValueOnce(emptyJson)
      .mockImplementationOnce(() => retryRead.promise)
    const pendingWrite = deferred<void>()
    storage.setItem.mockImplementationOnce(() => pendingWrite.promise)
    const { result } = renderHook(() => usePersonalRecords())
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'))

    act(() => result.current.updateRecords(answer('seoul:mapo', '2026-09-09T12:00:00+09:00')))
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1))
    expect(result.current.recordsV2.currentCombo).toBe(1)

    let retryPromise!: Promise<ReturnType<typeof createEmptyPersonalRecords>>
    act(() => { retryPromise = result.current.retryLoad() })
    retryRead.resolve(emptyJson)
    await act(async () => { await retryPromise })

    expect(result.current.recordsV2.currentCombo).toBe(1)
    pendingWrite.resolve()
  })
})
