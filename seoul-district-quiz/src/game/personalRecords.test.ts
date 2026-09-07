import { describe, expect, it } from 'vitest'
import {
  createEmptyPersonalRecords,
  loadPersonalRecords,
  parsePersonalRecords,
  recordAnswer,
  recordCompletedSet,
  recordMasteredDistrict,
  savePersonalRecords,
  PERSONAL_RECORDS_STORAGE_KEY,
  type RecordStorage,
} from './personalRecords'

describe('personal records', () => {
  it('starts with empty mode records and streaks', () => {
    expect(parsePersonalRecords(null)).toEqual(createEmptyPersonalRecords())
  })

  it('recovers safely from malformed or unsupported data', () => {
    expect(parsePersonalRecords('{broken')).toEqual(createEmptyPersonalRecords())
    expect(parsePersonalRecords(JSON.stringify({ version: 2 }))).toEqual(createEmptyPersonalRecords())
  })

  it('normalizes invalid fields without clearing valid records', () => {
    const records = parsePersonalRecords(JSON.stringify({
      version: 1,
      fastestPerfectSetMs: { choice: 21_500, text: -1 },
      currentCorrectStreak: 4,
      bestCorrectStreak: 2,
      masteredDistricts: ['마포구', '마포구', '없는구', 3],
    }))

    expect(records.fastestPerfectSetMs).toEqual({ choice: 21_500, text: null })
    expect(records.currentCorrectStreak).toBe(4)
    expect(records.bestCorrectStreak).toBe(4)
    expect(records.masteredDistricts).toEqual(['마포구'])
  })

  it('continues a regular streak and resets it after a wrong answer', () => {
    const first = recordAnswer(createEmptyPersonalRecords(), { correct: true, sessionKind: 'regular' })
    const second = recordAnswer(first, { correct: true, sessionKind: 'regular' })
    const reset = recordAnswer(second, { correct: false, sessionKind: 'regular' })

    expect(second.currentCorrectStreak).toBe(2)
    expect(second.bestCorrectStreak).toBe(2)
    expect(reset.currentCorrectStreak).toBe(0)
    expect(reset.bestCorrectStreak).toBe(2)
  })

  it('does not change streaks during review', () => {
    const records = { ...createEmptyPersonalRecords(), currentCorrectStreak: 3, bestCorrectStreak: 5 }
    expect(recordAnswer(records, { correct: false, sessionKind: 'review' })).toBe(records)
  })

  it('collects a district once when it is answered correctly', () => {
    const first = recordAnswer(createEmptyPersonalRecords(), {
      correct: true,
      sessionKind: 'regular',
      district: '마포구',
    })
    const duplicate = recordMasteredDistrict(first, '마포구')
    const invalid = recordMasteredDistrict(first, '없는구')

    expect(first.masteredDistricts).toEqual(['마포구'])
    expect(duplicate).toBe(first)
    expect(invalid).toBe(first)
  })

  it('keeps mastery progress while preserving streaks during review', () => {
    const records = { ...createEmptyPersonalRecords(), currentCorrectStreak: 3, bestCorrectStreak: 5 }
    const next = recordAnswer(records, { correct: true, sessionKind: 'review', district: '종로구' })

    expect(next.masteredDistricts).toEqual(['종로구'])
    expect(next.currentCorrectStreak).toBe(3)
    expect(next.bestCorrectStreak).toBe(5)
  })

  it('stores the fastest perfect five-question set by mode', () => {
    const choice = recordCompletedSet(createEmptyPersonalRecords(), {
      mode: 'choice', sessionKind: 'regular', correctCount: 5, totalQuestions: 5, totalDurationMs: 30_000,
    })
    const slowerChoice = recordCompletedSet(choice, {
      mode: 'choice', sessionKind: 'regular', correctCount: 5, totalQuestions: 5, totalDurationMs: 34_000,
    })
    const text = recordCompletedSet(slowerChoice, {
      mode: 'text', sessionKind: 'regular', correctCount: 5, totalQuestions: 5, totalDurationMs: 52_000,
    })

    expect(text.fastestPerfectSetMs).toEqual({ choice: 30_000, text: 52_000 })
  })

  it.each([
    { sessionKind: 'review' as const, correctCount: 5, totalQuestions: 5, totalDurationMs: 10_000 },
    { sessionKind: 'regular' as const, correctCount: 4, totalQuestions: 5, totalDurationMs: 10_000 },
    { sessionKind: 'regular' as const, correctCount: 5, totalQuestions: 3, totalDurationMs: 10_000 },
    { sessionKind: 'regular' as const, correctCount: 5, totalQuestions: 5, totalDurationMs: 0 },
  ])('ignores ineligible set results: %o', (result) => {
    const records = createEmptyPersonalRecords()
    expect(recordCompletedSet(records, { mode: 'choice', ...result })).toBe(records)
  })

  it('loads and saves the versioned record through the AIT storage contract', async () => {
    const storedRecords = { ...createEmptyPersonalRecords(), currentCorrectStreak: 2, bestCorrectStreak: 4 }
    const values = new Map([[PERSONAL_RECORDS_STORAGE_KEY, JSON.stringify(storedRecords)]])
    const storage: RecordStorage = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value) },
    }

    await expect(loadPersonalRecords(storage)).resolves.toEqual(storedRecords)

    const nextRecords = recordAnswer(storedRecords, { correct: true, sessionKind: 'regular' })
    await savePersonalRecords(nextRecords, storage)
    expect(values.get(PERSONAL_RECORDS_STORAGE_KEY)).toBe(JSON.stringify(nextRecords))
  })

  it('surfaces storage failures for the UI fallback', async () => {
    const storage: RecordStorage = {
      getItem: async () => { throw new Error('unavailable') },
      setItem: async () => { throw new Error('unavailable') },
    }

    await expect(loadPersonalRecords(storage)).rejects.toThrow('unavailable')
    await expect(savePersonalRecords(createEmptyPersonalRecords(), storage)).rejects.toThrow('unavailable')
  })
})
