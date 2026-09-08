export type ProgressStage = 0 | 1 | 2 | 3 | 4

/**
 * Progress is deliberately serializable so callers can persist it directly.
 * `lastPromotionSessionId` is optional for compatibility with records created
 * before session-aware promotion was introduced.
 */
export type RegionProgress = {
  regionId: string
  stage: ProgressStage
  attempts: number
  correctAnswers: number
  lastAnsweredAt: string | null
  nextReviewAt: string | null
  lastQuestionType: string | null
  lastPromotionSessionId?: string
}

export type ReviewDate = Date | string
export type LearningSession = string | {
  id?: string
  sessionId?: string
  learningSessionId?: string
}

const REVIEW_INTERVAL_DAYS: Record<ProgressStage, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
  4: 21,
}

// Learning dates in this app use Korea Standard Time, regardless of the
// device/runtime timezone. Explicitly offset strings retain their own offset.
const DEFAULT_OFFSET_MINUTES = 9 * 60

export function createRegionProgress(regionId: string): RegionProgress {
  return {
    regionId,
    stage: 0,
    attempts: 0,
    correctAnswers: 0,
    lastAnsweredAt: null,
    nextReviewAt: null,
    lastQuestionType: null,
  }
}

function parseReviewDate(value: ReviewDate): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError('answeredAt must be a valid date')
  return date
}

function getOffsetMinutes(value: ReviewDate): number {
  if (typeof value !== 'string') return DEFAULT_OFFSET_MINUTES

  if (/Z$/i.test(value)) return 0
  const match = value.match(/([+-])(\d{2}):?(\d{2})$/)
  if (!match) return DEFAULT_OFFSET_MINUTES

  const hours = Number(match[2])
  const minutes = Number(match[3])
  if (hours > 23 || minutes > 59) return DEFAULT_OFFSET_MINUTES
  return (match[1] === '-' ? -1 : 1) * (hours * 60 + minutes)
}

/** Add calendar days in the date's intended local offset, then serialize UTC. */
function addCalendarDays(value: ReviewDate, days: number): Date {
  const date = parseReviewDate(value)
  const offsetMinutes = getOffsetMinutes(value)
  const localTime = new Date(date.getTime() + offsetMinutes * 60_000)
  const shifted = new Date(Date.UTC(
    localTime.getUTCFullYear(),
    localTime.getUTCMonth(),
    localTime.getUTCDate() + days,
    localTime.getUTCHours(),
    localTime.getUTCMinutes(),
    localTime.getUTCSeconds(),
    localTime.getUTCMilliseconds(),
  ))

  return new Date(shifted.getTime() - offsetMinutes * 60_000)
}

export function getNextReviewAt(stage: ProgressStage, answeredAt: ReviewDate): string | null {
  const days = REVIEW_INTERVAL_DAYS[stage]
  if (days === 0) return null
  return addCalendarDays(answeredAt, days).toISOString()
}

function getSessionId(session: LearningSession | undefined): string | undefined {
  if (typeof session === 'string') return session || undefined
  return session?.sessionId || session?.learningSessionId || session?.id || undefined
}

export function applyScoredAnswer(
  progress: RegionProgress,
  correct: boolean,
  answeredAt: ReviewDate,
  session?: LearningSession,
): RegionProgress {
  const sessionId = getSessionId(session)
  const currentStage = progress.stage
  let nextStage: ProgressStage = correct
    ? Math.min(currentStage + 1, 4) as ProgressStage
    : Math.max(currentStage - 1, 0) as ProgressStage

  // Stage 3 and above require a new learning session for every promotion.
  // Legacy three-argument calls have no session identity and retain the
  // original deterministic stage progression behavior.
  if (correct && sessionId && nextStage >= 3 && progress.lastPromotionSessionId === sessionId) {
    nextStage = currentStage
  }

  const result: RegionProgress = {
    ...progress,
    stage: nextStage,
    attempts: progress.attempts + 1,
    correctAnswers: progress.correctAnswers + (correct ? 1 : 0),
    lastAnsweredAt: parseReviewDate(answeredAt).toISOString(),
    nextReviewAt: getNextReviewAt(nextStage, answeredAt),
  }

  if (correct && sessionId && nextStage > currentStage) {
    result.lastPromotionSessionId = sessionId
  }

  return result
}

export function isReviewDue(progress: RegionProgress, now: ReviewDate): boolean {
  if (!progress.nextReviewAt) return false
  return parseReviewDate(now).getTime() >= parseReviewDate(progress.nextReviewAt).getTime()
}
