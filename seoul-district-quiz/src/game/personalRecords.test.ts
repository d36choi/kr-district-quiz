import { describe, expect, it } from 'vitest'
import {
  createEmptyPersonalRecords,
  getDailyStreak,
  LEGACY_PERSONAL_RECORDS_STORAGE_KEY,
  loadPersonalRecords,
  migratePersonalRecordsV1,
  parsePersonalRecords,
  PERSONAL_RECORDS_STORAGE_KEY,
  recordAnswer,
  recordCompletedSet,
  recordCourseCompleted,
  recordMasteredDistrict,
  recordRegionAnswer,
  savePersonalRecords,
  type PersonalRecordsV1,
  type RecordStorage,
} from './personalRecords'

describe('personal records V2', () => {
  it('starts with empty regional, combo, daily-streak, and speed records', () => {
    expect(parsePersonalRecords(null)).toEqual(createEmptyPersonalRecords())
  })

  it('migrates valid V1 Seoul records without inventing historical dates', () => {
    const migrated = migratePersonalRecordsV1({
      version: 1,
      fastestPerfectSetMs: { choice: 21_500, text: null },
      currentCorrectStreak: 3,
      bestCorrectStreak: 5,
      masteredDistricts: ['마포구', '마포', '없는구'],
    })

    expect(migrated.version).toBe(2)
    expect(migrated.fastestPerfectSetMs).toEqual({ choice: 21_500, text: null })
    expect(migrated.currentCombo).toBe(3)
    expect(migrated.bestCombo).toBe(5)
    expect(migrated.dailyStreak).toEqual({ current: 0, best: 0, lastCompletedDate: null })
    expect(migrated.progressByRegion).toEqual({
      'seoul:mapo': {
        regionId: 'seoul:mapo',
        stage: 1,
        attempts: 1,
        correctAnswers: 1,
        lastAnsweredAt: null,
        nextReviewAt: null,
        lastQuestionType: null,
      },
    })
  })

  it('skips malformed V1 entries individually and keeps valid fields', () => {
    const migrated = migratePersonalRecordsV1({
      version: 1,
      fastestPerfectSetMs: { choice: 18_000, text: -4 },
      currentCorrectStreak: -2,
      bestCorrectStreak: 7,
      masteredDistricts: ['종로구', 3, '성남시', null],
    } as unknown as PersonalRecordsV1)

    expect(migrated.fastestPerfectSetMs).toEqual({ choice: 18_000, text: null })
    expect(migrated.currentCombo).toBe(0)
    expect(migrated.bestCombo).toBe(7)
    expect(Object.keys(migrated.progressByRegion)).toEqual(['seoul:jongno'])
  })

  it('parsing and migration are idempotent', () => {
    const first = migratePersonalRecordsV1({
      version: 1,
      fastestPerfectSetMs: { choice: 21_500, text: null },
      currentCorrectStreak: 3,
      bestCorrectStreak: 5,
      masteredDistricts: ['마포구', '마포구'],
    })
    const second = migratePersonalRecordsV1(first)

    expect(second).toEqual(first)
    expect(parsePersonalRecords(JSON.stringify(second))).toEqual(first)
    expect(Object.keys(second.progressByRegion)).toEqual(['seoul:mapo'])
  })

  it('normalizes malformed V2 fields without clearing valid region progress', () => {
    const parsed = parsePersonalRecords(JSON.stringify({
      version: 2,
      fastestPerfectSetMs: { choice: 30_000, text: 'fast' },
      currentCombo: 4,
      bestCombo: 2,
      dailyStreak: { current: 3, best: 2, lastCompletedDate: '2026-09-08' },
      progressByRegion: {
        'seoul:mapo': {
          regionId: 'seoul:mapo', stage: 2, attempts: 3, correctAnswers: 2,
          lastAnsweredAt: '2026-09-08T03:00:00.000Z', nextReviewAt: null,
          lastQuestionType: 'map-selection', lastPromotionSessionId: 'course-a',
        },
        'gyeonggi:hanam': {
          regionId: 'gyeonggi:hanam', stage: 99, attempts: 3, correctAnswers: 2,
          lastAnsweredAt: null, nextReviewAt: null, lastQuestionType: null,
        },
        'unknown:place': {
          regionId: 'unknown:place', stage: 1, attempts: 1, correctAnswers: 1,
          lastAnsweredAt: null, nextReviewAt: null, lastQuestionType: null,
        },
      },
    }))

    expect(parsed.fastestPerfectSetMs).toEqual({ choice: 30_000, text: null })
    expect(parsed.currentCombo).toBe(4)
    expect(parsed.bestCombo).toBe(4)
    expect(parsed.dailyStreak).toEqual({ current: 3, best: 3, lastCompletedDate: '2026-09-08' })
    expect(parsed.progressByRegion).toEqual({
      'seoul:mapo': {
        regionId: 'seoul:mapo', stage: 2, attempts: 3, correctAnswers: 2,
        lastAnsweredAt: '2026-09-08T03:00:00.000Z', nextReviewAt: null,
        lastQuestionType: 'map-selection', lastPromotionSessionId: 'course-a',
      },
    })
  })

  it('normalizes malformed nullable progress metadata without dropping core progress', () => {
    const parsed = parsePersonalRecords(JSON.stringify({
      ...createEmptyPersonalRecords(),
      progressByRegion: {
        'seoul:mapo': {
          regionId: 'seoul:mapo',
          stage: 2,
          attempts: 4,
          correctAnswers: 3,
          lastAnsweredAt: 'not-a-date',
          nextReviewAt: 17,
          lastQuestionType: { unexpected: true },
          lastPromotionSessionId: false,
        },
      },
    }))

    expect(parsed.progressByRegion['seoul:mapo']).toEqual({
      regionId: 'seoul:mapo',
      stage: 2,
      attempts: 4,
      correctAnswers: 3,
      lastAnsweredAt: null,
      nextReviewAt: null,
      lastQuestionType: null,
    })
  })

  it('records region progress and requires another course before stage 3', () => {
    const empty = createEmptyPersonalRecords()
    const first = recordRegionAnswer(empty, {
      regionId: 'gyeonggi:seongnam', correct: true,
      answeredAt: '2026-09-09T09:00:00+09:00', questionType: 'recognition', sessionId: 'course-a',
    })
    const second = recordRegionAnswer(first, {
      regionId: 'gyeonggi:seongnam', correct: true,
      answeredAt: '2026-09-09T09:01:00+09:00', questionType: 'map-selection', sessionId: 'course-a',
    })
    const blocked = recordRegionAnswer(second, {
      regionId: 'gyeonggi:seongnam', correct: true,
      answeredAt: '2026-09-09T09:02:00+09:00', questionType: 'silhouette', sessionId: 'course-a',
    })
    const promoted = recordRegionAnswer(blocked, {
      regionId: 'gyeonggi:seongnam', correct: true,
      answeredAt: '2026-09-10T09:00:00+09:00', questionType: 'text-recall', sessionId: 'course-b',
    })

    expect(first.progressByRegion['gyeonggi:seongnam'].stage).toBe(1)
    expect(second.progressByRegion['gyeonggi:seongnam'].stage).toBe(2)
    expect(blocked.progressByRegion['gyeonggi:seongnam'].stage).toBe(2)
    expect(promoted.progressByRegion['gyeonggi:seongnam'].stage).toBe(3)
    expect(promoted.progressByRegion['gyeonggi:seongnam'].lastQuestionType).toBe('text-recall')
    expect(promoted.progressByRegion['gyeonggi:seongnam'].lastPromotionSessionId).toBe('course-b')
  })

  it('keeps answer combo separate from the daily learning streak', () => {
    const first = recordRegionAnswer(createEmptyPersonalRecords(), {
      regionId: 'seoul:mapo', correct: true,
      answeredAt: '2026-09-09T12:00:00+09:00', questionType: 'recognition', sessionId: 'course-a',
    })
    const wrong = recordRegionAnswer(first, {
      regionId: 'seoul:jongno', correct: false,
      answeredAt: '2026-09-09T12:01:00+09:00', questionType: 'recognition', sessionId: 'course-a',
    })

    expect(first.currentCombo).toBe(1)
    expect(wrong.currentCombo).toBe(0)
    expect(wrong.bestCombo).toBe(1)
    expect(wrong.dailyStreak.current).toBe(0)
  })

  it('ends the current combo at the course boundary without losing its best', () => {
    const answered = recordRegionAnswer(createEmptyPersonalRecords(), {
      regionId: 'seoul:mapo', correct: true,
      answeredAt: '2026-09-09T12:00:00+09:00', questionType: 'recognition', sessionId: 'course-a',
    })
    const completed = recordCourseCompleted(answered, '2026-09-09T12:02:00+09:00')

    expect(completed.currentCombo).toBe(0)
    expect(completed.bestCombo).toBe(1)
    expect(completed.dailyStreak.current).toBe(1)
  })

  it('counts course days in Asia/Seoul for same-day and consecutive completions', () => {
    const first = recordCourseCompleted(createEmptyPersonalRecords(), '2026-09-08T15:30:00.000Z')
    const sameKoreanDay = recordCourseCompleted(first, '2026-09-09T14:59:59.999Z')
    const nextKoreanDay = recordCourseCompleted(sameKoreanDay, '2026-09-09T15:00:00.000Z')

    expect(first.dailyStreak).toEqual({ current: 1, best: 1, lastCompletedDate: '2026-09-09' })
    expect(sameKoreanDay).toBe(first)
    expect(nextKoreanDay.dailyStreak).toEqual({ current: 2, best: 2, lastCompletedDate: '2026-09-10' })
    expect(getDailyStreak(nextKoreanDay, '2026-09-10T23:00:00+09:00')).toBe(2)
  })

  it('resets a gapped completion and reports an expired daily streak as zero', () => {
    const first = recordCourseCompleted(createEmptyPersonalRecords(), '2026-09-07T20:00:00+09:00')

    expect(getDailyStreak(first, '2026-09-09T00:00:00+09:00')).toBe(0)

    const afterGap = recordCourseCompleted(first, '2026-09-10T08:00:00+09:00')
    expect(afterGap.dailyStreak).toEqual({ current: 1, best: 1, lastCompletedDate: '2026-09-10' })
  })
})

describe('storage migration', () => {
  function memoryStorage(values: Map<string, string>): RecordStorage {
    return {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value) },
    }
  }

  it('prefers V2 storage without reading or rewriting legacy V1 data', async () => {
    const v2 = recordCourseCompleted(createEmptyPersonalRecords(), '2026-09-09T12:00:00+09:00')
    const reads: string[] = []
    const writes: string[] = []
    const storage: RecordStorage = {
      getItem: async (key) => {
        reads.push(key)
        return key === PERSONAL_RECORDS_STORAGE_KEY ? JSON.stringify(v2) : JSON.stringify({ version: 1 })
      },
      setItem: async (key) => { writes.push(key) },
    }

    await expect(loadPersonalRecords(storage)).resolves.toEqual(v2)
    expect(reads).toEqual([PERSONAL_RECORDS_STORAGE_KEY])
    expect(writes).toEqual([])
  })

  it('loads legacy V1, persists V2, and leaves the source intact', async () => {
    const legacy = JSON.stringify({
      version: 1,
      fastestPerfectSetMs: { choice: 21_500, text: null },
      currentCorrectStreak: 3,
      bestCorrectStreak: 5,
      masteredDistricts: ['마포구'],
    })
    const values = new Map([[LEGACY_PERSONAL_RECORDS_STORAGE_KEY, legacy]])
    const storage = memoryStorage(values)

    const loaded = await loadPersonalRecords(storage)

    expect(loaded.version).toBe(2)
    expect(loaded.progressByRegion['seoul:mapo'].stage).toBe(1)
    expect(values.get(PERSONAL_RECORDS_STORAGE_KEY)).toBe(JSON.stringify(loaded))
    expect(values.get(LEGACY_PERSONAL_RECORDS_STORAGE_KEY)).toBe(legacy)
  })

  it('preserves V1 source and surfaces a failed migration save', async () => {
    const legacy = JSON.stringify({
      version: 1,
      fastestPerfectSetMs: { choice: null, text: null },
      currentCorrectStreak: 0,
      bestCorrectStreak: 0,
      masteredDistricts: ['종로구'],
    })
    const storage: RecordStorage = {
      getItem: async (key) => key === LEGACY_PERSONAL_RECORDS_STORAGE_KEY ? legacy : null,
      setItem: async () => { throw new Error('quota exceeded') },
    }

    await expect(loadPersonalRecords(storage)).rejects.toMatchObject({
      message: 'quota exceeded',
      migratedRecords: expect.objectContaining({ version: 2 }),
    })
    await expect(storage.getItem(LEGACY_PERSONAL_RECORDS_STORAGE_KEY)).resolves.toBe(legacy)
  })

  it('saves only the V2 key and surfaces ordinary storage failures', async () => {
    const values = new Map<string, string>()
    await savePersonalRecords(createEmptyPersonalRecords(), memoryStorage(values))
    expect(values.has(PERSONAL_RECORDS_STORAGE_KEY)).toBe(true)
    expect(values.has(LEGACY_PERSONAL_RECORDS_STORAGE_KEY)).toBe(false)

    const unavailable: RecordStorage = {
      getItem: async () => { throw new Error('unavailable') },
      setItem: async () => { throw new Error('unavailable') },
    }
    await expect(loadPersonalRecords(unavailable)).rejects.toThrow('unavailable')
    await expect(savePersonalRecords(createEmptyPersonalRecords(), unavailable)).rejects.toThrow('unavailable')
  })
})

describe('legacy App compatibility', () => {
  it('preserves legacy streak, mastery, and perfect-set behavior through V2 projections', () => {
    const first = recordAnswer(createEmptyPersonalRecords(), {
      correct: true, sessionKind: 'regular', district: '마포구',
    })
    const duplicate = recordMasteredDistrict(first, '마포구')
    const reset = recordAnswer(first, { correct: false, sessionKind: 'regular' })
    const fastest = recordCompletedSet(reset, {
      mode: 'choice', sessionKind: 'regular', correctCount: 5,
      totalQuestions: 5, totalDurationMs: 30_000,
    })

    expect(first.currentCorrectStreak).toBe(1)
    expect(first.masteredDistricts).toEqual(['마포구'])
    expect(duplicate).toBe(first)
    expect(reset.currentCorrectStreak).toBe(0)
    expect(reset.bestCorrectStreak).toBe(1)
    expect(fastest.fastestPerfectSetMs.choice).toBe(30_000)
  })

  it('keeps authoritative V2 combo fields when compatibility projections are stale', () => {
    const records = {
      ...createEmptyPersonalRecords(),
      currentCombo: 2,
      bestCombo: 4,
      currentCorrectStreak: 30,
      bestCorrectStreak: 50,
    }

    const reviewed = recordAnswer(records, { correct: false, sessionKind: 'review' })
    expect(reviewed.currentCombo).toBe(2)
    expect(reviewed.bestCombo).toBe(4)
    expect(reviewed.currentCorrectStreak).toBe(2)
    expect(reviewed.bestCorrectStreak).toBe(4)

    const ignoredSet = recordCompletedSet(records, {
      mode: 'choice', sessionKind: 'regular', correctCount: 4,
      totalQuestions: 5, totalDurationMs: 30_000,
    })
    expect(ignoredSet.currentCorrectStreak).toBe(2)
    expect(ignoredSet.bestCorrectStreak).toBe(4)

    const mastered = recordAnswer(records, {
      correct: true,
      sessionKind: 'review',
      district: '종로구',
    })
    expect(mastered.masteredDistricts).toEqual(['종로구'])
    expect(mastered.currentCorrectStreak).toBe(2)
    expect(mastered.bestCorrectStreak).toBe(4)
  })

  it('keeps the fastest eligible perfect set by mode', () => {
    const choice = recordCompletedSet(createEmptyPersonalRecords(), {
      mode: 'choice', sessionKind: 'regular', correctCount: 5,
      totalQuestions: 5, totalDurationMs: 30_000,
    })
    const slowerChoice = recordCompletedSet(choice, {
      mode: 'choice', sessionKind: 'regular', correctCount: 5,
      totalQuestions: 5, totalDurationMs: 34_000,
    })
    const text = recordCompletedSet(slowerChoice, {
      mode: 'text', sessionKind: 'regular', correctCount: 5,
      totalQuestions: 5, totalDurationMs: 52_000,
    })

    expect(text.fastestPerfectSetMs).toEqual({ choice: 30_000, text: 52_000 })
  })

  it.each([
    { sessionKind: 'review' as const, correctCount: 5, totalQuestions: 5, totalDurationMs: 10_000 },
    { sessionKind: 'regular' as const, correctCount: 4, totalQuestions: 5, totalDurationMs: 10_000 },
    { sessionKind: 'regular' as const, correctCount: 5, totalQuestions: 3, totalDurationMs: 10_000 },
    { sessionKind: 'regular' as const, correctCount: 5, totalQuestions: 5, totalDurationMs: 0 },
  ])('ignores ineligible legacy set results: %o', (result) => {
    const records = createEmptyPersonalRecords()
    expect(recordCompletedSet(records, { mode: 'choice', ...result })).toBe(records)
  })
})
