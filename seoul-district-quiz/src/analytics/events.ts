import { Analytics, Device } from '@apps-in-toss/web-framework'
import type { RegionPackId } from '../data/regions'
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

export function trackRegionPackViewed({ packId }: RegionPackViewedArgs): void {
  fireAndForget(() => Analytics?.screen?.({
    log_name: 'region_pack_viewed',
    pack_id: packId,
  }))
}

export function trackRegionSelected({ packId, regionId, source }: RegionSelectedArgs): void {
  fireAndForget(() => Analytics?.click?.({
    log_name: 'region_selected',
    pack_id: packId,
    region_id: regionId,
    source,
  }))
}

export function trackCourseStarted({ courseId, targetRegionId }: CourseStartedArgs): void {
  logEvent('course_started', {
    course_id: courseId,
    target_region_id: targetRegionId,
  })
}

export function trackAnswerSubmitted({ regionId, questionType, correct, stageBefore }: AnswerSubmittedArgs): void {
  logEvent('answer_submitted', {
    region_id: regionId,
    question_type: questionType,
    correct,
    stage_before: stageBefore,
  })
}

export function trackCourseCompleted({ courseId, scoredCount, correctCount }: CourseCompletedArgs): void {
  logEvent('course_completed', {
    course_id: courseId,
    scored_count: scoredCount,
    correct_count: correctCount,
  })
}

export function trackReviewPromptShown({ dueCount }: ReviewPromptShownArgs): void {
  logEvent('review_prompt_shown', { due_count: dueCount })
}

export function trackReviewSessionCompleted({ scoredCount, correctCount, stageUpCount }: ReviewSessionCompletedArgs): void {
  logEvent('review_session_completed', {
    scored_count: scoredCount,
    correct_count: correctCount,
    stage_up_count: stageUpCount,
  })
}

export function trackMapLoadFailed({ packId, assetVersion }: MapLoadFailedArgs): void {
  logEvent('map_load_failed', {
    pack_id: packId,
    asset_version: assetVersion,
  })
}

export function triggerAnswerHaptic(correct: boolean): void {
  fireAndForget(() => Device?.triggerHaptic?.({ type: correct ? 'success' : 'error' }))
}
