/// <reference types="node" />
// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as geometry from './data/geometry'
import { REGIONS_BY_ID } from './data/regions'
import { createEmptyPersonalRecords, type PersonalRecordsV2 } from './game/personalRecords'
import { createRegionProgress } from './game/progress'

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}))

const analytics = vi.hoisted(() => ({
  trackAnswerSubmitted: vi.fn(),
  trackCourseCompleted: vi.fn(),
  trackCourseStarted: vi.fn(),
  trackMapLoadFailed: vi.fn(),
  trackRegionPackViewed: vi.fn(),
  trackRegionSelected: vi.fn(),
  trackReviewPromptShown: vi.fn(),
  trackReviewSessionCompleted: vi.fn(),
  triggerAnswerHaptic: vi.fn(),
}))

vi.hoisted(() => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  })
})

vi.mock('@apps-in-toss/web-framework', () => ({
  SafeAreaInsets: {
    get: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    subscribe: () => () => undefined,
  },
  Storage: storage,
  User: {
    getAnonymousKey: Object.assign(vi.fn(), { isSupported: () => false }),
  },
}))

vi.mock('./analytics/events', () => analytics)

function emptyRecords() {
  return createEmptyPersonalRecords()
}

function recordsWithDueReview(regionId: string): PersonalRecordsV2 {
  const progress = {
    ...createRegionProgress(regionId),
    stage: 1 as const,
    attempts: 1,
    correctAnswers: 1,
    lastAnsweredAt: '2026-09-01T00:00:00.000Z',
    nextReviewAt: '2026-09-02T00:00:00.000Z',
  }
  return {
    ...emptyRecords(),
    progressByRegion: { [regionId]: progress },
  }
}

function recordsAtStageTwo(regionId: string): PersonalRecordsV2 {
  const progress = {
    ...createRegionProgress(regionId),
    stage: 2 as const,
    attempts: 2,
    correctAnswers: 2,
    lastAnsweredAt: '2026-09-01T00:00:00.000Z',
    nextReviewAt: '2026-09-04T00:00:00.000Z',
    lastPromotionSessionId: 'older-session',
  }
  return {
    ...emptyRecords(),
    progressByRegion: { [regionId]: progress },
  }
}

async function openSeongnamCourse(records: PersonalRecordsV2 | null = emptyRecords()) {
  render(<App initialRecords={records ?? undefined} />)
  fireEvent.click(screen.getByRole('button', { name: '새 지역 찾아보기' }))
  const search = screen.getByRole('searchbox', { name: '지역명 검색' })
  fireEvent.change(search, { target: { value: '성남' } })
  fireEvent.click(screen.getByRole('button', { name: /^성남시/u }))
  fireEvent.click(screen.getByRole('button', { name: '성남시 5문제 시작' }))
  return screen.findByText('01')
}

async function openLegacySeoulQuiz(mode: '객관식' | '주관식') {
  render(<App initialRecords={emptyRecords()} />)
  fireEvent.click(screen.getByRole('button', { name: /^서울 도장깨기/u }))
  fireEvent.click(screen.getByRole('button', { name: '퀴즈로 지도 채우기' }))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${mode}`, 'u') }))
  return screen.findByRole('group', { name: '서울 25개 자치구 지도' })
}

async function answerCurrentCourseQuestion(correct: boolean, beforeAnswer?: () => void) {
  const activeRegion = await waitFor(() => {
    const node = document.querySelector<SVGGElement>('[aria-current="true"]')
    expect(node).toBeTruthy()
    return node!
  })
  const answer = activeRegion?.getAttribute('aria-label')?.split(',')[0]
  expect(answer).toBeTruthy()
  const answerGroup = screen.getByRole('group', { name: '답안 선택' })
  const options = within(answerGroup).getAllByRole('button')
  const option = correct
    ? within(answerGroup).getByRole('button', { name: answer })
    : options.find((candidate) => candidate.textContent !== answer)
  expect(option).toBeTruthy()
  beforeAnswer?.()
  fireEvent.click(option!)
  fireEvent.click(screen.getByRole('button', { name: '정답 확인' }))
  fireEvent.click(await screen.findByRole('button', { name: '계속하기' }))
}

beforeEach(() => {
  storage.getItem.mockReset()
  storage.setItem.mockReset()
  Object.values(analytics).forEach((tracker) => tracker.mockReset())
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
  const svg = readFileSync('public/seoul-district.svg', 'utf8')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(svg)))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('regional learning app flow', () => {
  it('서울 객관식은 보기만 답안으로 제공한다', async () => {
    const map = await openLegacySeoulQuiz('객관식')

    expect(screen.getByRole('group', { name: '답안 선택' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '지역 이름' })).toBeNull()
    expect(screen.queryByText('지역 목록에서 선택')).toBeNull()
    expect(within(map).queryAllByRole('button')).toHaveLength(0)
  })

  it('서울 주관식은 이름 입력만 답안으로 제공한다', async () => {
    const map = await openLegacySeoulQuiz('주관식')

    expect(screen.getByRole('textbox', { name: '지역 이름' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: '답안 선택' })).toBeNull()
    expect(screen.queryByText('지역 목록에서 선택')).toBeNull()
    expect(within(map).queryAllByRole('button')).toHaveLength(0)
  })

  it('완료 애니메이션 중에도 최종 성과를 접근성 이름으로 제공한다', async () => {
    await openLegacySeoulQuiz('객관식')
    for (let index = 0; index < 5; index += 1) await answerCurrentCourseQuestion(true)

    expect(screen.getByRole('article', { name: '획득 XP 65' })).toBeTruthy()
    expect(screen.getByRole('article', { name: '정확도 100%' })).toBeTruthy()
    expect(screen.getByRole('article', { name: '정답 5/5' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '5문제 연속 정답' })).toBeTruthy()
  })

  it('받침 없는 지역명의 지도 문제에 는을 붙인다', async () => {
    render(<App initialRecords={recordsWithDueReview('gyeonggi:seongnam')} />)
    fireEvent.click(screen.getByRole('button', { name: '오늘의 5문제' }))

    expect(await screen.findByRole('heading', { name: '성남시는 지도에서 어디일까요?' })).toBeTruthy()
  })

  it('지도 선택 문제는 지도만 답안으로 제공한다', async () => {
    render(<App initialRecords={recordsWithDueReview('gyeonggi:seongnam')} />)
    fireEvent.click(screen.getByRole('button', { name: '오늘의 5문제' }))

    expect(await screen.findByText('지도에서 성남시를 선택해 주세요.')).toBeTruthy()
    expect(screen.queryByText('지역 목록에서 선택')).toBeNull()
    expect(screen.queryByRole('searchbox', { name: '지역명 검색' })).toBeNull()
    expect(screen.getByRole('group', { name: '경기 31개 시·군 지도' })).toBeTruthy()
  })

  it('받침 없는 지역명의 완료 문구에 를을 붙인다', async () => {
    await openSeongnamCourse()
    for (let index = 0; index < 5; index += 1) await answerCurrentCourseQuestion(true)

    expect(await screen.findByRole('heading', { name: '성남시를한 번 더 익혔어요' })).toBeTruthy()
  })

  it('오늘의 5문제는 실제 승급만 집계하고 확인 문제와 재방문은 복습 완료를 중복 기록하지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-12T00:00:00.000Z'))
    const records = emptyRecords()
    for (const region of Object.values(REGIONS_BY_ID)) {
      if (region.parentId === null) continue
      records.progressByRegion[region.id] = {
        ...createRegionProgress(region.id),
        stage: region.id === 'gyeonggi:seongnam' ? 1 : 2,
        attempts: 2,
        correctAnswers: 2,
        lastAnsweredAt: '2026-09-01T00:00:00.000Z',
        nextReviewAt: region.id === 'gyeonggi:seongnam'
          ? '2026-09-02T00:00:00.000Z'
          : '2026-09-20T00:00:00.000Z',
        // Legacy stage 2 requires a session baseline, so a correct answer
        // does not promote it. Only the stage 1 target should advance.
      }
    }
    render(<StrictMode><App initialRecords={records} /></StrictMode>)
    expect(analytics.trackReviewPromptShown).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '오늘의 5문제' }))
    const map = await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    fireEvent.click(within(map).getByRole('button', { name: /^성남시/u }))
    fireEvent.click(screen.getByRole('button', { name: '정답 확인' }))
    fireEvent.click(screen.getByRole('button', { name: '계속하기' }))
    for (let index = 1; index < 5; index += 1) await answerCurrentCourseQuestion(index !== 1)
    expect(analytics.trackAnswerSubmitted).toHaveBeenCalledTimes(5)
    expect(analytics.trackAnswerSubmitted.mock.calls[0][0]).toEqual({
      regionId: 'gyeonggi:seongnam', questionType: 'map-selection', correct: true, stageBefore: 1,
    })
    expect(new Set(analytics.trackAnswerSubmitted.mock.calls.map(([answer]) => answer.regionId)).size).toBe(5)
    expect(screen.getByText('확인 문제')).toBeTruthy()
    await answerCurrentCourseQuestion(true)
    expect(analytics.trackCourseCompleted).toHaveBeenCalledExactlyOnceWith({
      courseId: 'region:gyeonggi:seongnam', scoredCount: 5, correctCount: 4,
    })
    expect(analytics.trackReviewSessionCompleted).toHaveBeenCalledExactlyOnceWith({
      scoredCount: 5, correctCount: 4, stageUpCount: 1,
    })
    fireEvent.click(screen.getByRole('button', { name: '오답만 복습 (1)' }))
    await answerCurrentCourseQuestion(true)
    fireEvent.click(screen.getByRole('button', { name: '오늘 학습 마치기' }))
    expect(analytics.trackAnswerSubmitted).toHaveBeenCalledTimes(5)
    expect(analytics.trackCourseCompleted).toHaveBeenCalledTimes(1)
    expect(analytics.trackReviewSessionCompleted).toHaveBeenCalledTimes(1)
  })

  it('StrictMode에서 팩 조회는 실제 팩 전환과 선택 화면 재방문마다 한 번씩 기록한다', async () => {
    render(<StrictMode><App initialRecords={emptyRecords()} /></StrictMode>)
    fireEvent.click(screen.getByRole('button', { name: '새 지역 찾아보기' }))
    fireEvent.click(screen.getByRole('tab', { name: '경기' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '지역명 검색' }), { target: { value: '성남' } })
    fireEvent.click(screen.getByRole('tab', { name: '서울' }))
    fireEvent.click(screen.getByRole('tab', { name: '경기' }))
    fireEvent.click(screen.getByRole('button', { name: '홈으로 돌아가기' }))
    fireEvent.click(screen.getByRole('button', { name: '새 지역 찾아보기' }))
    expect(analytics.trackRegionPackViewed.mock.calls).toEqual([
      [{ packId: 'gyeonggi' }], [{ packId: 'seoul' }], [{ packId: 'gyeonggi' }], [{ packId: 'gyeonggi' }],
    ])
    await screen.findByRole('searchbox', { name: '지역명 검색' })
  })

  it('지역 선택 화면은 현재 팩 조회, 검색 선택, 코스 시작을 각각 한 번 기록한다', async () => {
    render(<App initialRecords={emptyRecords()} />)

    fireEvent.click(screen.getByRole('button', { name: '새 지역 찾아보기' }))
    await screen.findByRole('searchbox', { name: '지역명 검색' })
    fireEvent.change(screen.getByRole('searchbox', { name: '지역명 검색' }), { target: { value: '성남' } })
    fireEvent.click(within(screen.getByRole('list', { name: '지역 목록' })).getByRole('button', { name: /^성남시/u }))
    fireEvent.click(screen.getByRole('button', { name: '성남시 5문제 시작' }))

    expect(analytics.trackRegionPackViewed).toHaveBeenCalledTimes(1)
    expect(analytics.trackRegionPackViewed).toHaveBeenCalledWith({ packId: 'gyeonggi' })
    expect(analytics.trackRegionSelected).toHaveBeenCalledTimes(1)
    expect(analytics.trackRegionSelected).toHaveBeenCalledWith({
      packId: 'gyeonggi',
      regionId: 'gyeonggi:seongnam',
      source: 'search',
    })
    expect(analytics.trackCourseStarted).toHaveBeenCalledTimes(1)
    expect(analytics.trackCourseStarted).toHaveBeenCalledWith({
      courseId: 'region:gyeonggi:seongnam',
      targetRegionId: 'gyeonggi:seongnam',
    })
  })

  it('채점 지역 문제의 답안을 한 번만 기록하고 정오답 햅틱을 보낸다', async () => {
    await openSeongnamCourse()
    await answerCurrentCourseQuestion(true)

    expect(analytics.trackAnswerSubmitted).toHaveBeenCalledTimes(1)
    expect(analytics.trackAnswerSubmitted).toHaveBeenCalledWith({
      regionId: 'gyeonggi:seongnam',
      questionType: 'recognition',
      correct: true,
      stageBefore: 0,
    })
    expect(analytics.triggerAnswerHaptic).toHaveBeenCalledTimes(1)
    expect(analytics.triggerAnswerHaptic).toHaveBeenCalledWith(true)
  })

  it('지역 코스의 다섯 채점 문제가 끝날 때 완료 횟수를 한 번 기록한다', async () => {
    await openSeongnamCourse()
    for (let index = 0; index < 5; index += 1) await answerCurrentCourseQuestion(true)

    expect(analytics.trackCourseCompleted).toHaveBeenCalledTimes(1)
    expect(analytics.trackCourseCompleted).toHaveBeenCalledWith({
      courseId: 'region:gyeonggi:seongnam',
      scoredCount: 5,
      correctCount: 5,
    })
    expect(analytics.trackReviewSessionCompleted).not.toHaveBeenCalled()
  })

  it('홈의 복습 안내는 만기 지역 수만 한 번 기록한다', async () => {
    render(<App initialRecords={recordsWithDueReview('gyeonggi:seongnam')} />)

    await waitFor(() => expect(analytics.trackReviewPromptShown).toHaveBeenCalledWith({ dueCount: 1 }))
    expect(analytics.trackReviewPromptShown).toHaveBeenCalledTimes(1)
  })

  it('지역 선택 지도 초기 실패는 검증된 자산 버전으로 한 번만 기록한다', async () => {
    vi.spyOn(geometry, 'loadGeometry').mockRejectedValueOnce(new Error('asset unavailable'))
    render(<App initialRecords={emptyRecords()} />)

    fireEvent.click(screen.getByRole('button', { name: '새 지역 찾아보기' }))
    await screen.findByRole('alert')

    expect(analytics.trackMapLoadFailed).toHaveBeenCalledTimes(1)
    expect(analytics.trackMapLoadFailed).toHaveBeenCalledWith({
      packId: 'gyeonggi',
      assetVersion: 'sgis-2025-q2-sigungu:2025-06-30',
    })
  })

  it('복습 대상이 있으면 홈의 첫 CTA가 오늘의 5문제다', () => {
    render(<App initialRecords={recordsWithDueReview('gyeonggi:seongnam')} />)
    const review = screen.getByRole('button', { name: '오늘의 5문제' })
    const browse = screen.getByRole('button', { name: '새 지역 찾아보기' })
    expect(review.compareDocumentPosition(browse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(review.classList.contains('primary-button')).toBe(true)
    expect(browse.classList.contains('secondary-button')).toBe(true)
    expect(screen.getByText('복습할 지역 1개')).toBeTruthy()
  })

  it('서울 25구 타자 도전 진입점은 지역 선택에서도 계속 노출된다', async () => {
    render(<App initialRecords={emptyRecords()} />)
    const browse = screen.getByRole('button', { name: '새 지역 찾아보기' })
    expect(browse.classList.contains('primary-button')).toBe(true)
    fireEvent.click(browse)
    fireEvent.click(screen.getByRole('tab', { name: '서울' }))
    fireEvent.click(await screen.findByRole('button', { name: /25구 타자/u }))
    expect(await screen.findByRole('heading', { name: /자치구를 입력해 주세요/u })).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: /0 \/ 25 자치구 완료/u })).toBeTruthy()
  })

  it('채점 문제의 정답은 지역 숙련도를 갱신한다', async () => {
    await openSeongnamCourse()
    for (let index = 0; index < 5; index += 1) await answerCurrentCourseQuestion(true)

    expect(await screen.findByText(/성남시 숙련도/u)).toBeTruthy()
    expect(screen.getByText('처음 봄 → 익히는 중')).toBeTruthy()
  })

  it('완료 화면에서 오늘 학습을 마치면 홈으로 돌아간다', async () => {
    await openSeongnamCourse()
    for (let index = 0; index < 5; index += 1) await answerCurrentCourseQuestion(true)

    fireEvent.click(screen.getByRole('button', { name: '오늘 학습 마치기' }))
    expect(await screen.findByRole('heading', { name: /오늘의 지역 학습/u })).toBeTruthy()
    expect(screen.getByText(/최근 학습 · 성남시/u)).toBeTruthy()
  })

  it('오답 확인 문제를 맞혀도 숙련 단계는 다시 바뀌지 않는다', async () => {
    await openSeongnamCourse()
    await answerCurrentCourseQuestion(false)
    for (let index = 1; index < 5; index += 1) await answerCurrentCourseQuestion(true)

    expect(await screen.findByText('확인 문제')).toBeTruthy()
    await answerCurrentCourseQuestion(true)
    expect(await screen.findByText(/성남시 숙련도/u)).toBeTruthy()
    expect(screen.getByText('처음 봄 → 처음 봄')).toBeTruthy()
  })

  it('실루엣 문제는 해당 SVG 도형에 집중하고 새 세션으로 3단계에 진입한다', async () => {
    await openSeongnamCourse(recordsAtStageTwo('gyeonggi:seongnam'))
    expect((await screen.findByText(/문제 지역이 강조/u)).closest('figure')?.classList.contains('map-card--silhouette')).toBe(true)
    for (let index = 0; index < 5; index += 1) await answerCurrentCourseQuestion(true)
    expect(await screen.findByText('익숙해지는 중 → 익숙함')).toBeTruthy()
  })

  it('오답 복습은 안내한 두 문제만 제공하고 완료한 세트의 결과와 저장 기록을 보존한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-11T14:59:00.000Z'))
    let elapsedMs = 0
    vi.spyOn(performance, 'now').mockImplementation(() => elapsedMs)
    storage.getItem.mockResolvedValue(JSON.stringify(emptyRecords()))
    storage.setItem.mockResolvedValue(undefined)
    await openSeongnamCourse(null)
    for (let index = 0; index < 5; index += 1) {
      await answerCurrentCourseQuestion(index >= 3, () => { elapsedMs += 1250 })
    }
    for (let index = 0; index < 2; index += 1) await answerCurrentCourseQuestion(true)

    const summary = screen.getByRole('region', { name: '이번 학습 결과' })
    expect(within(summary).getByText('20')).toBeTruthy()
    expect(within(summary).getByText('2/5')).toBeTruthy()
    expect(within(summary).getByText('6.3초')).toBeTruthy()
    const originalSummary = summary.textContent
    const originalMastery = screen.getByRole('region', { name: '성남시 숙련도' }).textContent
    await waitFor(() => {
      const saved = JSON.parse(storage.setItem.mock.calls.at(-1)?.[1] ?? '{}')
      expect(saved.dailyStreak?.lastCompletedDate).toBe('2026-09-11')
      expect(saved.progressByRegion?.['gyeonggi:seongnam']).toMatchObject({ stage: 0, attempts: 1 })
    })
    const savedBeforeReview = storage.setItem.mock.calls.at(-1)?.[1]
    const writesBeforeReview = storage.setItem.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: '오답만 복습 (2)' }))
    // An unscored replay crossing midnight must not count as another learning day.
    vi.setSystemTime(new Date('2026-09-11T15:01:00.000Z'))
    for (let index = 0; index < 2; index += 1) {
      expect(screen.getByText('확인 문제')).toBeTruthy()
      await answerCurrentCourseQuestion(true, () => { elapsedMs += 2500 })
    }

    expect(screen.getByRole('region', { name: '이번 학습 결과' }).textContent).toBe(originalSummary)
    expect(screen.getByRole('region', { name: '성남시 숙련도' }).textContent).toBe(originalMastery)
    expect(screen.getByRole('button', { name: '오늘 학습 마치기' })).toBeTruthy()
    expect(storage.setItem.mock.calls.at(-1)?.[1]).toBe(savedBeforeReview)
    expect(storage.setItem.mock.calls.length).toBe(writesBeforeReview)
  })
})
