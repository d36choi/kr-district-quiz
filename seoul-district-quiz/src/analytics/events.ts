import { Analytics, Device } from '@apps-in-toss/web-framework'
import { getRegion, type RegionPackId } from '../data/regions'
import { REGION_MAP_ASSET_VERSIONS } from '../data/mapAssets'
import type { CourseQuestionType } from '../game/courseGenerator'
import type { ProgressStage } from '../game/progress'

export type RegionSelectionSource = 'map' | 'list' | 'search'

type RegionPackViewedArgs = Readonly<{
  packId: RegionPackId
}>

type RegionSelectedArgs = Readonly<{
  packId: RegionPackId
  regionId: string
  source: RegionSelectionSource
}>

type CourseStartedArgs = Readonly<{
  courseId: string
  targetRegionId: string
}>

type AnswerSubmittedArgs = Readonly<{
  regionId: string
  questionType: CourseQuestionType
  correct: boolean
  stageBefore: ProgressStage
}>

type CourseCompletedArgs = Readonly<{
  courseId: string
  scoredCount: number
  correctCount: number
}>

type ReviewPromptShownArgs = Readonly<{
  dueCount: number
}>

type ReviewSessionCompletedArgs = Readonly<{
  scoredCount: number
  correctCount: number
  stageUpCount: number
}>

type MapLoadFailedArgs = Readonly<{
  packId: RegionPackId
  assetVersion: string
}>

function isPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPackId(value: unknown): value is RegionPackId {
  return value === 'seoul' || value === 'gyeonggi'
}

function isRegionId(value: unknown): value is string {
  return typeof value === 'string' && getRegion(value) !== undefined
}

function isCourseId(value: unknown): value is string {
  // App constructs course IDs only as region:<catalog target ID>.
  return typeof value === 'string' && value.startsWith('region:') && isRegionId(value.slice(7))
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isQuestionType(value: unknown): value is CourseQuestionType {
  return value === 'recognition' || value === 'map-selection' || value === 'silhouette' || value === 'text-recall'
}

function fireAndForget(call: () => Promise<void> | void | undefined): void {
  try {
    const pending = call()
    if (pending) void pending.catch(() => undefined)
  } catch {
    // Analytics and haptic support must never affect the learning flow.
  }
}

function logEvent(logName: string, params: Record<string, string | number | boolean>): void {
  fireAndForget(() => Analytics?.log?.({
    log_name: logName,
    log_type: 'event',
    params,
  }))
}

export function trackRegionPackViewed(args: RegionPackViewedArgs): void {
  if (!isPayload(args) || !isPackId(args.packId)) return
  const { packId } = args
  fireAndForget(() => Analytics?.screen?.({
    log_name: 'region_pack_viewed',
    pack_id: packId,
  }))
}

export function trackRegionSelected(args: RegionSelectedArgs): void {
  if (!isPayload(args) || !isPackId(args.packId) || !isRegionId(args.regionId)
    || getRegion(args.regionId)?.packId !== args.packId
    || !['map', 'list', 'search'].includes(args.source)) return
  const { packId, regionId, source } = args
  fireAndForget(() => Analytics?.click?.({
    log_name: 'region_selected',
    pack_id: packId,
    region_id: regionId,
    source,
  }))
}

export function trackCourseStarted(args: CourseStartedArgs): void {
  if (!isPayload(args) || !isCourseId(args.courseId) || !isRegionId(args.targetRegionId)
    || args.courseId !== `region:${args.targetRegionId}`) return
  const { courseId, targetRegionId } = args
  logEvent('course_started', {
    course_id: courseId,
    target_region_id: targetRegionId,
  })
}

export function trackAnswerSubmitted(args: AnswerSubmittedArgs): void {
  if (!isPayload(args) || !isRegionId(args.regionId) || !isQuestionType(args.questionType)
    || typeof args.correct !== 'boolean' || !isCount(args.stageBefore) || args.stageBefore > 4) return
  const { regionId, questionType, correct, stageBefore } = args
  logEvent('answer_submitted', {
    region_id: regionId,
    question_type: questionType,
    correct,
    stage_before: stageBefore,
  })
}

export function trackCourseCompleted(args: CourseCompletedArgs): void {
  if (!isPayload(args) || !isCourseId(args.courseId) || !isCount(args.scoredCount)
    || !isCount(args.correctCount) || args.correctCount > args.scoredCount) return
  const { courseId, scoredCount, correctCount } = args
  logEvent('course_completed', {
    course_id: courseId,
    scored_count: scoredCount,
    correct_count: correctCount,
  })
}

export function trackReviewPromptShown(args: ReviewPromptShownArgs): void {
  if (!isPayload(args) || !isCount(args.dueCount)) return
  const { dueCount } = args
  logEvent('review_prompt_shown', { due_count: dueCount })
}

export function trackReviewSessionCompleted(args: ReviewSessionCompletedArgs): void {
  if (!isPayload(args) || !isCount(args.scoredCount) || !isCount(args.correctCount)
    || !isCount(args.stageUpCount) || args.correctCount > args.scoredCount || args.stageUpCount > args.correctCount) return
  const { scoredCount, correctCount, stageUpCount } = args
  logEvent('review_session_completed', {
    scored_count: scoredCount,
    correct_count: correctCount,
    stage_up_count: stageUpCount,
  })
}

export function trackMapLoadFailed(args: MapLoadFailedArgs): void {
  if (!isPayload(args) || !isPackId(args.packId) || args.assetVersion !== REGION_MAP_ASSET_VERSIONS[args.packId]) return
  const { packId, assetVersion } = args
  logEvent('map_load_failed', {
    pack_id: packId,
    asset_version: assetVersion,
  })
}

export function triggerAnswerHaptic(correct: boolean): void {
  fireAndForget(() => Device?.triggerHaptic?.({ type: correct ? 'success' : 'error' }))
}
