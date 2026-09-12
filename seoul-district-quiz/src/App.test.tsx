/// <reference types="node" />
// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as geometry from './data/geometry'
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
