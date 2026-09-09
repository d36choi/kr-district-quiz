// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptyPersonalRecords,
  LEGACY_PERSONAL_RECORDS_STORAGE_KEY,
  PERSONAL_RECORDS_STORAGE_KEY,
  recordRegionAnswer,
} from '../game/personalRecords'
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
    storage.setItem.mockImplementationOnce(async () => {
      await firstWrite.promise
      throw new Error('first save unavailable')
    })
    const { result } = renderHook(() => usePersonalRecords())
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'))

    act(() => result.current.updateRecords(answer('seoul:mapo', '2026-09-09T12:00:00+09:00')))
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1))

    let retryPromise!: Promise<ReturnType<typeof createEmptyPersonalRecords>>
    act(() => { retryPromise = result.current.retryLoad() })
    act(() => result.current.updateRecords(answer('seoul:jongno', '2026-09-09T12:01:00+09:00')))
    expect(result.current.recordsV2.currentCombo).toBe(2)

    retryRead.resolve(emptyJson)
    expect(storage.getItem).toHaveBeenCalledTimes(1)
    firstWrite.resolve()
    await act(async () => { await retryPromise })
    expect(result.current.recordsV2.currentCombo).toBe(2)

    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(3))
  })

  it('rejects a retry snapshot that predates an already-pending local write', async () => {
    const emptyJson = JSON.stringify(createEmptyPersonalRecords())
    const retryRead = deferred<string | null>()
    storage.getItem
      .mockResolvedValueOnce(emptyJson)
      .mockImplementationOnce(() => retryRead.promise)
    const pendingWrite = deferred<void>()
    storage.setItem.mockImplementationOnce(async () => {
      await pendingWrite.promise
      throw new Error('first save unavailable')
    })
    const { result } = renderHook(() => usePersonalRecords())
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'))

    act(() => result.current.updateRecords(answer('seoul:mapo', '2026-09-09T12:00:00+09:00')))
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1))
    expect(result.current.recordsV2.currentCombo).toBe(1)

    let retryPromise!: Promise<ReturnType<typeof createEmptyPersonalRecords>>
    act(() => { retryPromise = result.current.retryLoad() })
    retryRead.resolve(emptyJson)
    expect(storage.getItem).toHaveBeenCalledTimes(1)
    pendingWrite.resolve()
    await act(async () => { await retryPromise })

    expect(result.current.recordsV2.currentCombo).toBe(1)
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(2))
  })

  it('replays an optimistic update over an unresolved initial V2 load before saving', async () => {
    const initialRead = deferred<string | null>()
    const existing = answer('seoul:jongno', '2026-09-08T12:00:00+09:00')(
      createEmptyPersonalRecords(),
    )
    const saved: ReturnType<typeof createEmptyPersonalRecords>[] = []
    storage.getItem.mockImplementationOnce(() => initialRead.promise)
    storage.setItem.mockImplementation(async (_key: string, value: string) => {
      saved.push(JSON.parse(value))
    })
    const { result } = renderHook(() => usePersonalRecords())

    act(() => result.current.updateRecords(answer('seoul:mapo', '2026-09-09T12:00:00+09:00')))
    expect(result.current.recordsV2.progressByRegion['seoul:mapo']).toBeDefined()

    initialRead.resolve(JSON.stringify(existing))
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'))
    await waitFor(() => {
      expect(result.current.recordsV2.progressByRegion['seoul:jongno']).toBeDefined()
      expect(result.current.recordsV2.progressByRegion['seoul:mapo']).toBeDefined()
      expect(saved.at(-1)?.progressByRegion['seoul:jongno']).toBeDefined()
      expect(saved.at(-1)?.progressByRegion['seoul:mapo']).toBeDefined()
    })
  })

  it('replays an optimistic update over unresolved V1 migration and preserves the source', async () => {
    const legacyRead = deferred<string | null>()
    const legacy = JSON.stringify({
      version: 1,
      fastestPerfectSetMs: { choice: 21_500, text: null },
      currentCorrectStreak: 0,
      bestCorrectStreak: 0,
      masteredDistricts: ['마포구'],
    })
    const values = new Map([[LEGACY_PERSONAL_RECORDS_STORAGE_KEY, legacy]])
    storage.getItem.mockImplementation(async (key: string) => {
      if (key === PERSONAL_RECORDS_STORAGE_KEY) return values.get(key) ?? null
      return legacyRead.promise
    })
    storage.setItem.mockImplementation(async (key: string, value: string) => { values.set(key, value) })
    const { result } = renderHook(() => usePersonalRecords())
    await waitFor(() => expect(storage.getItem).toHaveBeenCalledWith(LEGACY_PERSONAL_RECORDS_STORAGE_KEY))

    act(() => result.current.updateRecords(answer('seoul:jongno', '2026-09-09T12:00:00+09:00')))
    legacyRead.resolve(legacy)

    await waitFor(() => {
      const persisted = JSON.parse(values.get(PERSONAL_RECORDS_STORAGE_KEY) ?? '{}')
      expect(result.current.recordsV2.progressByRegion['seoul:mapo']).toBeDefined()
      expect(result.current.recordsV2.progressByRegion['seoul:jongno']).toBeDefined()
      expect(persisted.progressByRegion['seoul:mapo']).toBeDefined()
      expect(persisted.progressByRegion['seoul:jongno']).toBeDefined()
    })
    expect(values.get(LEGACY_PERSONAL_RECORDS_STORAGE_KEY)).toBe(legacy)
  })

  it('orders a migration retry after a pending local save and restores newer progress', async () => {
    const legacy = JSON.stringify({
      version: 1,
      fastestPerfectSetMs: { choice: null, text: null },
      currentCorrectStreak: 0,
      bestCorrectStreak: 0,
      masteredDistricts: ['마포구'],
    })
    const values = new Map([[LEGACY_PERSONAL_RECORDS_STORAGE_KEY, legacy]])
    storage.getItem
      .mockResolvedValueOnce(JSON.stringify(createEmptyPersonalRecords()))
      .mockImplementation(async (key: string) => values.get(key) ?? null)
    const pendingSave = deferred<void>()
    let writeCount = 0
    storage.setItem.mockImplementation(async (key: string, value: string) => {
      writeCount += 1
      if (writeCount === 1) {
        await pendingSave.promise
        throw new Error('first save unavailable')
      }
      values.set(key, value)
    })
    const { result } = renderHook(() => usePersonalRecords())
    await waitFor(() => expect(result.current.loadStatus).toBe('ready'))

    act(() => result.current.updateRecords(answer('seoul:jongno', '2026-09-09T12:00:00+09:00')))
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1))
    let retryPromise!: Promise<ReturnType<typeof createEmptyPersonalRecords>>
    act(() => { retryPromise = result.current.retryLoad() })

    expect(storage.getItem).toHaveBeenCalledTimes(1)
    pendingSave.resolve()
    await act(async () => { await retryPromise })

    await waitFor(() => {
      const persisted = JSON.parse(values.get(PERSONAL_RECORDS_STORAGE_KEY) ?? '{}')
      expect(persisted.progressByRegion['seoul:mapo']).toBeDefined()
      expect(persisted.progressByRegion['seoul:jongno']).toBeDefined()
    })
    expect(values.get(LEGACY_PERSONAL_RECORDS_STORAGE_KEY)).toBe(legacy)
  })
})
