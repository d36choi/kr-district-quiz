import { Storage } from '@apps-in-toss/web-framework'
import { getRegion, getTopLevelRegions } from '../data/regions'
import {
  applyScoredAnswer,
  applyReviewAnswer,
  createRegionProgress,
  getNextReviewAt,
  type LearningSession,
  type ProgressStage,
  type RegionProgress,
  type ReviewDate,
} from './progress'

export type AnswerMode = 'choice' | 'text'
export type SessionKind = 'regular' | 'review'

type LegacyPersonalRecordFields = {
  fastestPerfectSetMs: Record<AnswerMode, number | null>
  currentCorrectStreak: number
  bestCorrectStreak: number
  masteredDistricts: string[]
}

export type PersonalRecordsV1 = LegacyPersonalRecordFields & {
  version: 1
}

export type DailyStreak = {
  current: number
  best: number
  /** Asia/Seoul local calendar date (`YYYY-MM-DD`). */
  lastCompletedDate: string | null
}

export type PersonalRecordsV2 = LegacyPersonalRecordFields & {
  version: 2
  progressByRegion: Record<string, RegionProgress>
  dailyStreak: DailyStreak
  currentCombo: number
  bestCombo: number
}

export type RecordStorage = Pick<typeof Storage, 'getItem' | 'setItem'>

export const PERSONAL_RECORDS_STORAGE_KEY = 'seoul-district-quiz:personal-records:v2'
export const LEGACY_PERSONAL_RECORDS_STORAGE_KEY = 'seoul-district-quiz:personal-records:v1'

type UnknownRecord = Record<string, unknown>

const SEOUL_DISTRICT_BY_ALIAS = new Map(
  getTopLevelRegions('seoul').flatMap((region) => region.aliases.map((alias) => [alias, region] as const)),
)

function parseDuration(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function parseCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFastestRecords(value: unknown): Record<AnswerMode, number | null> {
  const fastest = isObject(value) ? value : {}
  return {
    choice: parseDuration(fastest.choice),
    text: parseDuration(fastest.text),
  }
}

function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function parseNullableTimestamp(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return null
  return value
}

function parseProgressStage(value: unknown): ProgressStage | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4
    ? value as ProgressStage
    : undefined
}

function parseRegionProgress(key: string, value: unknown): RegionProgress | undefined {
  if (!isObject(value) || !getRegion(key) || value.regionId !== key) return undefined

  const stage = parseProgressStage(value.stage)
  const attempts = parseCount(value.attempts)
  const correctAnswers = parseCount(value.correctAnswers)
  const lastAnsweredAt = parseNullableTimestamp(value.lastAnsweredAt)
  const storedNextReviewAt = parseNullableTimestamp(value.nextReviewAt)
  const lastQuestionType = typeof value.lastQuestionType === 'string' ? value.lastQuestionType : null
  const promotionSession = value.lastPromotionSessionId

  if (
    stage === undefined
    || correctAnswers > attempts
  ) return undefined

  const nextReviewAt = storedNextReviewAt ?? (
    stage > 0 && attempts > 0 && lastAnsweredAt
      ? getNextReviewAt(stage, new Date(lastAnsweredAt))
      : null
  )

  const progress: RegionProgress = {
    regionId: key,
    stage,
    attempts,
    correctAnswers,
    lastAnsweredAt,
    nextReviewAt,
    lastQuestionType,
  }
  if (promotionSession === null || typeof promotionSession === 'string') {
    progress.lastPromotionSessionId = promotionSession
  }
  if ((value.reviewOutcome === 'correct' || value.reviewOutcome === 'wrong')
    && typeof value.reviewOutcomeCount === 'number' && Number.isInteger(value.reviewOutcomeCount)
    && value.reviewOutcomeCount >= 0 && isValidCalendarDate(value.lastReviewDate)) {
    progress.reviewOutcome = value.reviewOutcome
    progress.reviewOutcomeCount = value.reviewOutcomeCount
    progress.lastReviewDate = value.lastReviewDate
  }
  return progress
}

function parseProgressByRegion(value: unknown): Record<string, RegionProgress> {
  if (!isObject(value)) return {}

  const progressByRegion: Record<string, RegionProgress> = {}
  for (const [regionId, candidate] of Object.entries(value)) {
    const progress = parseRegionProgress(regionId, candidate)
    if (progress) progressByRegion[regionId] = progress
  }
  return progressByRegion
}

function parseDailyStreak(value: unknown): DailyStreak {
  const streak = isObject(value) ? value : {}
  const current = parseCount(streak.current)
  return {
    current,
    best: Math.max(current, parseCount(streak.best)),
    lastCompletedDate: isValidCalendarDate(streak.lastCompletedDate) ? streak.lastCompletedDate : null,
  }
}

type PersonalRecordsV2Core = Omit<
  PersonalRecordsV2,
  'currentCorrectStreak' | 'bestCorrectStreak' | 'masteredDistricts'
>

function projectLegacyFields(records: PersonalRecordsV2Core): PersonalRecordsV2 {
  const masteredDistricts = Object.values(records.progressByRegion)
    .filter((progress) => progress.stage > 0)
    .map((progress) => getRegion(progress.regionId))
    .filter((region) => region?.packId === 'seoul' && region.level === 'district')
    .map((region) => region!.name)

  return {
    ...records,
    version: 2,
    currentCorrectStreak: records.currentCombo,
    bestCorrectStreak: records.bestCombo,
    masteredDistricts,
  }
}

export function createEmptyPersonalRecords(): PersonalRecordsV2 {
  return projectLegacyFields({
    version: 2,
    fastestPerfectSetMs: { choice: null, text: null },
    progressByRegion: {},
    dailyStreak: { current: 0, best: 0, lastCompletedDate: null },
    currentCombo: 0,
    bestCombo: 0,
  })
}

function parseV2(value: UnknownRecord): PersonalRecordsV2 {
  const currentCombo = parseCount(value.currentCombo)
  return projectLegacyFields({
    version: 2,
    fastestPerfectSetMs: parseFastestRecords(value.fastestPerfectSetMs),
    progressByRegion: parseProgressByRegion(value.progressByRegion),
    dailyStreak: parseDailyStreak(value.dailyStreak),
    currentCombo,
    bestCombo: Math.max(currentCombo, parseCount(value.bestCombo)),
  })
}

export function migratePersonalRecordsV1(records: PersonalRecordsV1 | PersonalRecordsV2): PersonalRecordsV2 {
  if (records.version === 2) return parseV2(records as unknown as UnknownRecord)

  const raw = records as unknown as UnknownRecord
  const progressByRegion: Record<string, RegionProgress> = {}
  const masteredDistricts = Array.isArray(raw.masteredDistricts) ? raw.masteredDistricts : []

  for (const districtName of masteredDistricts) {
    if (typeof districtName !== 'string') continue
    const region = SEOUL_DISTRICT_BY_ALIAS.get(districtName)
    if (!region || progressByRegion[region.id]) continue
    progressByRegion[region.id] = {
      ...createRegionProgress(region.id),
      stage: 1,
      attempts: 1,
      correctAnswers: 1,
    }
  }

  const currentCombo = parseCount(raw.currentCorrectStreak)
  return projectLegacyFields({
    version: 2,
    fastestPerfectSetMs: parseFastestRecords(raw.fastestPerfectSetMs),
    progressByRegion,
    dailyStreak: { current: 0, best: 0, lastCompletedDate: null },
    currentCombo,
    bestCombo: Math.max(currentCombo, parseCount(raw.bestCorrectStreak)),
  })
}

export function parsePersonalRecords(value: string | null): PersonalRecordsV2 {
  if (!value) return createEmptyPersonalRecords()

  try {
    const parsed: unknown = JSON.parse(value)
    if (!isObject(parsed)) return createEmptyPersonalRecords()
    if (parsed.version === 2) return parseV2(parsed)
    if (parsed.version === 1) return migratePersonalRecordsV1(parsed as unknown as PersonalRecordsV1)
    return createEmptyPersonalRecords()
  } catch {
    return createEmptyPersonalRecords()
  }
}

export type RegionAnswerResult = {
  regionId: string
  correct: boolean
  answeredAt: ReviewDate
  questionType: string
  /** A course/session boundary used by spaced-review promotion rules. */
  sessionId?: string
  courseId?: string
  review?: boolean
  session?: LearningSession
}

export function recordRegionAnswer(
  records: PersonalRecordsV2,
  result: RegionAnswerResult,
): PersonalRecordsV2 {
  if (!getRegion(result.regionId)) return records

  const previous = records.progressByRegion[result.regionId] ?? createRegionProgress(result.regionId)
  const session = result.session ?? result.sessionId ?? result.courseId
  const input = { ...previous, lastQuestionType: result.questionType }
  const progress = result.review
    ? applyReviewAnswer(input, result.correct, result.answeredAt)
    : applyScoredAnswer(input, result.correct, result.answeredAt, session)
  const currentCombo = result.correct ? records.currentCombo + 1 : 0

  return projectLegacyFields({
    ...records,
    progressByRegion: { ...records.progressByRegion, [result.regionId]: progress },
    currentCombo,
    bestCombo: Math.max(records.bestCombo, currentCombo),
  })
}

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1_000
const DAY_MS = 24 * 60 * 60 * 1_000

function toKoreanDateKey(value: ReviewDate): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError('date must be valid')
  return new Date(date.getTime() + KOREA_OFFSET_MS).toISOString().slice(0, 10)
}

function calendarDayDifference(later: string, earlier: string): number {
  return (Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / DAY_MS
}

export function recordCourseCompleted(
  records: PersonalRecordsV2,
  completedAt: ReviewDate = new Date(),
): PersonalRecordsV2 {
  const completedDate = toKoreanDateKey(completedAt)
  const previousDate = records.dailyStreak.lastCompletedDate
  if (previousDate === completedDate) {
    return records.currentCombo === 0
      ? records
      : projectLegacyFields({ ...records, currentCombo: 0 })
  }

  const current = previousDate && calendarDayDifference(completedDate, previousDate) === 1
    ? records.dailyStreak.current + 1
    : 1

  return projectLegacyFields({
    ...records,
    currentCombo: 0,
    dailyStreak: {
      current,
      best: Math.max(records.dailyStreak.best, current),
      lastCompletedDate: completedDate,
    },
  })
}

export function getDailyStreak(
  records: PersonalRecordsV2,
  at: ReviewDate = new Date(),
): number {
  const lastCompletedDate = records.dailyStreak.lastCompletedDate
  if (!lastCompletedDate) return 0
  const elapsedDays = calendarDayDifference(toKoreanDateKey(at), lastCompletedDate)
  return elapsedDays === 0 || elapsedDays === 1 ? records.dailyStreak.current : 0
}

function asV2(records: PersonalRecordsV1 | PersonalRecordsV2): PersonalRecordsV2 {
  return records.version === 2 ? records : migratePersonalRecordsV1(records)
}

function syncLegacyFields(records: PersonalRecordsV2): PersonalRecordsV2 {
  const projected = projectLegacyFields(records)
  const sameMasteredDistricts = projected.masteredDistricts.length === records.masteredDistricts.length
    && projected.masteredDistricts.every((district, index) => district === records.masteredDistricts[index])
  return projected.currentCorrectStreak === records.currentCorrectStreak
    && projected.bestCorrectStreak === records.bestCorrectStreak
    && sameMasteredDistricts
    ? records
    : projected
}

/** @deprecated Use recordRegionAnswer for regional courses. */
export function recordAnswer(
  records: PersonalRecordsV1 | PersonalRecordsV2,
  result: { correct: boolean; sessionKind: SessionKind; district?: string },
): PersonalRecordsV2 {
  const v2 = syncLegacyFields(asV2(records))
  if (result.sessionKind === 'review' && (!result.correct || !result.district)) {
    return v2
  }

  const recordsWithMastery = result.correct && result.district
    ? recordMasteredDistrict(v2, result.district)
    : v2

  if (result.sessionKind === 'review') return recordsWithMastery

  const currentCombo = result.correct ? recordsWithMastery.currentCombo + 1 : 0
  return projectLegacyFields({
    ...recordsWithMastery,
    currentCombo,
    bestCombo: Math.max(recordsWithMastery.bestCombo, currentCombo),
  })
}

/** @deprecated Mastery is now represented by progressByRegion. */
export function recordMasteredDistrict(
  records: PersonalRecordsV1 | PersonalRecordsV2,
  district: string,
): PersonalRecordsV2 {
  const v2 = syncLegacyFields(asV2(records))
  const region = SEOUL_DISTRICT_BY_ALIAS.get(district)
  if (!region || v2.progressByRegion[region.id]?.stage > 0) return v2

  return projectLegacyFields({
    ...v2,
    progressByRegion: {
      ...v2.progressByRegion,
      [region.id]: {
        ...createRegionProgress(region.id),
        stage: 1,
        attempts: 1,
        correctAnswers: 1,
      },
    },
  })
}

/** @deprecated Kept for the existing five-question Seoul mode. */
export function recordCompletedSet(
  records: PersonalRecordsV1 | PersonalRecordsV2,
  result: {
    mode: AnswerMode
    sessionKind: SessionKind
    correctCount: number
    totalQuestions: number
    totalDurationMs: number
  },
): PersonalRecordsV2 {
  const v2 = syncLegacyFields(asV2(records))
  const isPerfectRegularSet = result.sessionKind === 'regular'
    && result.totalQuestions === 5
    && result.correctCount === 5
    && Number.isFinite(result.totalDurationMs)
    && result.totalDurationMs > 0

  if (!isPerfectRegularSet) return v2

  const previousBest = v2.fastestPerfectSetMs[result.mode]
  if (previousBest !== null && previousBest <= result.totalDurationMs) return v2

  return projectLegacyFields({
    ...v2,
    fastestPerfectSetMs: {
      ...v2.fastestPerfectSetMs,
      [result.mode]: result.totalDurationMs,
    },
  })
}

export class PersonalRecordsMigrationError extends Error {
  migratedRecords: PersonalRecordsV2

  constructor(cause: unknown, migratedRecords: PersonalRecordsV2) {
    super(cause instanceof Error ? cause.message : 'Failed to save migrated personal records', { cause })
    this.name = 'PersonalRecordsMigrationError'
    this.migratedRecords = migratedRecords
  }
}

function containsV1(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value)
    return isObject(parsed) && parsed.version === 1
  } catch {
    return false
  }
}

export async function loadPersonalRecords(storage: RecordStorage = Storage): Promise<PersonalRecordsV2> {
  const currentValue = await storage.getItem(PERSONAL_RECORDS_STORAGE_KEY)
  if (currentValue !== null) return parsePersonalRecords(currentValue)

  const legacyValue = await storage.getItem(LEGACY_PERSONAL_RECORDS_STORAGE_KEY)
  if (legacyValue === null || !containsV1(legacyValue)) return createEmptyPersonalRecords()

  const migratedRecords = parsePersonalRecords(legacyValue)
  try {
    await savePersonalRecords(migratedRecords, storage)
  } catch (error) {
    throw new PersonalRecordsMigrationError(error, migratedRecords)
  }
  return migratedRecords
}

export async function savePersonalRecords(
  records: PersonalRecordsV2,
  storage: RecordStorage = Storage,
): Promise<void> {
  await storage.setItem(PERSONAL_RECORDS_STORAGE_KEY, JSON.stringify(records))
}
