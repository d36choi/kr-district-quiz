import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  click: vi.fn(),
  log: vi.fn(),
  screen: vi.fn(),
  triggerHaptic: vi.fn(),
}))

vi.mock('@apps-in-toss/web-framework', () => ({
  Analytics: {
    click: sdk.click,
    log: sdk.log,
    screen: sdk.screen,
  },
  Device: {
    triggerHaptic: sdk.triggerHaptic,
  },
}))

import {
  trackAnswerSubmitted,
  trackCourseCompleted,
  trackCourseStarted,
  trackMapLoadFailed,
  trackRegionPackViewed,
  trackRegionSelected,
  trackReviewPromptShown,
  trackReviewSessionCompleted,
  triggerAnswerHaptic,
} from './events'

beforeEach(() => {
  vi.clearAllMocks()
  sdk.click.mockResolvedValue(undefined)
  sdk.log.mockResolvedValue(undefined)
  sdk.screen.mockResolvedValue(undefined)
  sdk.triggerHaptic.mockResolvedValue(undefined)
})

describe('regional analytics payload contract', () => {
  it('uses screen analytics with only the stable pack id', () => {
    trackRegionPackViewed({ packId: 'gyeonggi' })

    expect(sdk.screen).toHaveBeenCalledOnce()
    expect(sdk.screen).toHaveBeenCalledWith({
      log_name: 'region_pack_viewed',
      pack_id: 'gyeonggi',
    })
    expect(typeof sdk.screen.mock.calls[0][0].pack_id).toBe('string')
  })

  it('uses click analytics with the finite selection source and no search text', () => {
    trackRegionSelected({
      packId: 'gyeonggi',
      regionId: 'gyeonggi:seongnam',
      source: 'search',
      searchText: '성남 분당 아파트',
      address: '경기도 성남시 분당구',
    } as Parameters<typeof trackRegionSelected>[0])

    expect(sdk.click).toHaveBeenCalledOnce()
    expect(sdk.click).toHaveBeenCalledWith({
      log_name: 'region_selected',
      pack_id: 'gyeonggi',
      region_id: 'gyeonggi:seongnam',
      source: 'search',
    })
    const payload = sdk.click.mock.calls[0][0]
    expect(Object.keys(payload).toSorted()).toEqual(['log_name', 'pack_id', 'region_id', 'source'])
    expect([payload.pack_id, payload.region_id, payload.source].every((value) => typeof value === 'string')).toBe(true)
  })

  it('logs course start with only course and target ids', () => {
    trackCourseStarted({ courseId: 'region:gyeonggi:seongnam', targetRegionId: 'gyeonggi:seongnam' })

    expect(sdk.log).toHaveBeenCalledWith({
      log_name: 'course_started',
      log_type: 'event',
      params: {
        course_id: 'region:gyeonggi:seongnam',
        target_region_id: 'gyeonggi:seongnam',
      },
    })
    const payload = sdk.log.mock.calls[0][0].params
    expect(Object.keys(payload).toSorted()).toEqual(['course_id', 'target_region_id'])
    expect(Object.values(payload).every((value) => typeof value === 'string')).toBe(true)
  })

  it('logs a scored answer with ids, question type, correctness, and prior stage only', () => {
    trackAnswerSubmitted({
      regionId: 'gyeonggi:seongnam',
      questionType: 'map-selection',
      correct: true,
      stageBefore: 1,
      answerText: '성남시',
      purpose: '임장 목적',
    } as Parameters<typeof trackAnswerSubmitted>[0])

    expect(sdk.log).toHaveBeenCalledWith({
      log_name: 'answer_submitted',
      log_type: 'event',
      params: {
        region_id: 'gyeonggi:seongnam',
        question_type: 'map-selection',
        correct: true,
        stage_before: 1,
      },
    })
    const payload = sdk.log.mock.calls[0][0].params
    expect(Object.keys(payload).toSorted()).toEqual(['correct', 'question_type', 'region_id', 'stage_before'])
    expect(typeof payload.region_id).toBe('string')
    expect(typeof payload.question_type).toBe('string')
    expect(typeof payload.correct).toBe('boolean')
    expect(typeof payload.stage_before).toBe('number')
  })

  it('logs course completion with exactly one id and two numeric counts', () => {
    trackCourseCompleted({ courseId: 'region:gyeonggi:seongnam', scoredCount: 5, correctCount: 4 })

    expect(sdk.log).toHaveBeenCalledWith({
      log_name: 'course_completed',
      log_type: 'event',
      params: {
        course_id: 'region:gyeonggi:seongnam',
        scored_count: 5,
        correct_count: 4,
      },
    })
    const payload = sdk.log.mock.calls[0][0].params
    expect(Object.keys(payload).toSorted()).toEqual(['correct_count', 'course_id', 'scored_count'])
    expect(typeof payload.course_id).toBe('string')
    expect(typeof payload.scored_count).toBe('number')
    expect(typeof payload.correct_count).toBe('number')
  })

  it('logs review prompt and completion with exact numeric allowlists', () => {
    trackReviewPromptShown({ dueCount: 3 })
    trackReviewSessionCompleted({ scoredCount: 2, correctCount: 1, stageUpCount: 0 })

    expect(sdk.log.mock.calls).toEqual([
      [{ log_name: 'review_prompt_shown', log_type: 'event', params: { due_count: 3 } }],
      [{
        log_name: 'review_session_completed',
        log_type: 'event',
        params: { scored_count: 2, correct_count: 1, stage_up_count: 0 },
      }],
    ])
    expect(Object.keys(sdk.log.mock.calls[0][0].params)).toEqual(['due_count'])
    expect(Object.values(sdk.log.mock.calls[0][0].params).every((value) => typeof value === 'number')).toBe(true)
    expect(Object.keys(sdk.log.mock.calls[1][0].params).toSorted()).toEqual(['correct_count', 'scored_count', 'stage_up_count'])
    expect(Object.values(sdk.log.mock.calls[1][0].params).every((value) => typeof value === 'number')).toBe(true)
  })

  it('logs map failure with stable ids and never includes free-form error text', () => {
    trackMapLoadFailed({
      packId: 'gyeonggi',
      assetVersion: 'sgis-2025-q2-sigungu:2025-06-30',
      errorMessage: '사용자 주소를 포함한 원문 오류',
    } as Parameters<typeof trackMapLoadFailed>[0])

    expect(sdk.log).toHaveBeenCalledWith({
      log_name: 'map_load_failed',
      log_type: 'event',
      params: {
        pack_id: 'gyeonggi',
        asset_version: 'sgis-2025-q2-sigungu:2025-06-30',
      },
    })
    const payload = sdk.log.mock.calls[0][0].params
    expect(Object.keys(payload).toSorted()).toEqual(['asset_version', 'pack_id'])
    expect(Object.values(payload).every((value) => typeof value === 'string')).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('사용자 주소')
  })
})

describe('non-blocking SDK boundary', () => {
  it('swallows synchronous and asynchronous analytics failures', async () => {
    sdk.screen.mockImplementationOnce(() => { throw new Error('sync failure') })
    sdk.log.mockRejectedValueOnce(new Error('async failure'))

    expect(() => trackRegionPackViewed({ packId: 'seoul' })).not.toThrow()
    expect(() => trackCourseStarted({ courseId: 'region:seoul:mapo', targetRegionId: 'seoul:mapo' })).not.toThrow()
    await Promise.resolve()
  })

  it.each([
    [true, 'success'],
    [false, 'error'],
  ] as const)('maps answer correctness %s to %s haptic', (correct, type) => {
    triggerAnswerHaptic(correct)
    expect(sdk.triggerHaptic).toHaveBeenCalledWith({ type })
  })

  it('swallows synchronous and asynchronous haptic failures', async () => {
    sdk.triggerHaptic.mockImplementationOnce(() => { throw new Error('sync failure') })
    expect(() => triggerAnswerHaptic(true)).not.toThrow()

    sdk.triggerHaptic.mockRejectedValueOnce(new Error('async failure'))
    expect(() => triggerAnswerHaptic(false)).not.toThrow()
    await Promise.resolve()
  })
})
