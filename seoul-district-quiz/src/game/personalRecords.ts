import { Storage } from '@apps-in-toss/web-framework'
import { ALL_DISTRICT_NAMES } from '../data/districts'

export type AnswerMode = 'choice' | 'text'
export type SessionKind = 'regular' | 'review'

export type PersonalRecordsV1 = {
  version: 1
  fastestPerfectSetMs: Record<AnswerMode, number | null>
  currentCorrectStreak: number
  bestCorrectStreak: number
  masteredDistricts: string[]
}

export type RecordStorage = Pick<typeof Storage, 'getItem' | 'setItem'>

export const PERSONAL_RECORDS_STORAGE_KEY = 'seoul-district-quiz:personal-records:v1'

export function createEmptyPersonalRecords(): PersonalRecordsV1 {
  return {
    version: 1,
    fastestPerfectSetMs: { choice: null, text: null },
    currentCorrectStreak: 0,
    bestCorrectStreak: 0,
    masteredDistricts: [],
  }
}

function parseDuration(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function parseCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

function parseMasteredDistricts(value: unknown) {
  if (!Array.isArray(value)) return []
  const validDistricts = new Set(ALL_DISTRICT_NAMES)
  return [...new Set(value.filter((district): district is string => typeof district === 'string' && validDistricts.has(district)))]
}

export function parsePersonalRecords(value: string | null): PersonalRecordsV1 {
  if (!value) return createEmptyPersonalRecords()

  try {
    const parsed = JSON.parse(value) as Partial<PersonalRecordsV1>
    if (parsed.version !== 1 || !parsed.fastestPerfectSetMs) return createEmptyPersonalRecords()

    const currentCorrectStreak = parseCount(parsed.currentCorrectStreak)
    const bestCorrectStreak = Math.max(currentCorrectStreak, parseCount(parsed.bestCorrectStreak))

    return {
      version: 1,
      fastestPerfectSetMs: {
        choice: parseDuration(parsed.fastestPerfectSetMs.choice),
        text: parseDuration(parsed.fastestPerfectSetMs.text),
      },
      currentCorrectStreak,
      bestCorrectStreak,
      masteredDistricts: parseMasteredDistricts(parsed.masteredDistricts),
    }
  } catch {
    return createEmptyPersonalRecords()
  }
}

export function recordAnswer(
  records: PersonalRecordsV1,
  result: { correct: boolean; sessionKind: SessionKind; district?: string },
): PersonalRecordsV1 {
  const recordsWithMastery = result.correct && result.district
    ? recordMasteredDistrict(records, result.district)
    : records

  if (result.sessionKind === 'review') return recordsWithMastery

  const currentCorrectStreak = result.correct ? recordsWithMastery.currentCorrectStreak + 1 : 0
  return {
    ...recordsWithMastery,
    currentCorrectStreak,
    bestCorrectStreak: Math.max(recordsWithMastery.bestCorrectStreak, currentCorrectStreak),
  }
}

export function recordMasteredDistrict(records: PersonalRecordsV1, district: string): PersonalRecordsV1 {
  if (!ALL_DISTRICT_NAMES.includes(district) || records.masteredDistricts.includes(district)) return records
  return {
    ...records,
    masteredDistricts: [...records.masteredDistricts, district],
  }
}

export function recordCompletedSet(
  records: PersonalRecordsV1,
  result: {
    mode: AnswerMode
    sessionKind: SessionKind
    correctCount: number
    totalQuestions: number
    totalDurationMs: number
  },
): PersonalRecordsV1 {
  const isPerfectRegularSet = result.sessionKind === 'regular'
    && result.totalQuestions === 5
    && result.correctCount === 5
    && Number.isFinite(result.totalDurationMs)
    && result.totalDurationMs > 0

  if (!isPerfectRegularSet) return records

  const previousBest = records.fastestPerfectSetMs[result.mode]
  if (previousBest !== null && previousBest <= result.totalDurationMs) return records

  return {
    ...records,
    fastestPerfectSetMs: {
      ...records.fastestPerfectSetMs,
      [result.mode]: result.totalDurationMs,
    },
  }
}

export async function loadPersonalRecords(storage: RecordStorage = Storage) {
  const value = await storage.getItem(PERSONAL_RECORDS_STORAGE_KEY)
  return parsePersonalRecords(value)
}

export async function savePersonalRecords(records: PersonalRecordsV1, storage: RecordStorage = Storage) {
  await storage.setItem(PERSONAL_RECORDS_STORAGE_KEY, JSON.stringify(records))
}
