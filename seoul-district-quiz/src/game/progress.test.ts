import { describe, expect, it } from 'vitest'
import {
  applyScoredAnswer,
  applyReviewAnswer,
  createRegionProgress,
  getNextReviewAt,
  isReviewDue,
} from './progress'

describe('region learning progress', () => {
  it('복습 정답은 서로 다른 현지 날짜에 2회 연속 맞혀야 한 단계 오른다', () => {
    const initial = { ...createRegionProgress('seoul:mapo'), stage: 1 as const }
    const first = applyReviewAnswer(initial, true, '2026-09-07T09:00:00+09:00')
    const sameDay = applyReviewAnswer(first, true, '2026-09-07T20:00:00+09:00')
    const promoted = applyReviewAnswer(sameDay, true, '2026-09-08T08:00:00+09:00')

    expect(first.stage).toBe(1)
    expect(sameDay.stage).toBe(1)
    expect(promoted.stage).toBe(2)
  })

  it('복습 오답은 서로 다른 현지 날짜에 2회 연속 틀려야 한 단계 내려간다', () => {
    const initial = { ...createRegionProgress('seoul:mapo'), stage: 2 as const }
    const first = applyReviewAnswer(initial, false, '2026-09-07T09:00:00+09:00')
    const reset = applyReviewAnswer(first, true, '2026-09-08T09:00:00+09:00')
    const wrongAgain = applyReviewAnswer(reset, false, '2026-09-09T09:00:00+09:00')
    const demoted = applyReviewAnswer(wrongAgain, false, '2026-09-10T09:00:00+09:00')

    expect(first.stage).toBe(2)
    expect(reset.stage).toBe(2)
    expect(wrongAgain.stage).toBe(2)
    expect(demoted.stage).toBe(1)
  })
  it('정답은 단계를 올리고 현지 날짜의 자정부터 복습하도록 예약한다', () => {
    const at = new Date('2026-09-07T00:00:00+09:00')
    const first = applyScoredAnswer(createRegionProgress('gyeonggi:seongnam'), true, at)
    const second = applyScoredAnswer(first, true, at)

    expect(first.stage).toBe(1)
    expect(second.stage).toBe(2)
    expect(first.nextReviewAt).toBe('2026-09-07T15:00:00.000Z')
    expect(second.nextReviewAt).toBe('2026-09-09T15:00:00.000Z')
  })

  it('오답은 단계를 내리며 최저 단계 아래로 내려가지 않는다', () => {
    const progress = { ...createRegionProgress('seoul:mapo'), stage: 0 as const }

    expect(applyScoredAnswer(progress, false, new Date('2026-09-07T00:00:00+09:00')).stage).toBe(0)
  })

  it('단계별 복습 간격은 1·3·7·14일이며 해당 현지 날짜 자정에 열린다', () => {
    const at = new Date('2026-09-07T23:30:00+09:00')

    expect(getNextReviewAt(0, at)).toBeNull()
    expect(getNextReviewAt(1, at)).toBe('2026-09-07T15:00:00.000Z')
    expect(getNextReviewAt(2, at)).toBe('2026-09-09T15:00:00.000Z')
    expect(getNextReviewAt(3, at)).toBe('2026-09-13T15:00:00.000Z')
    expect(getNextReviewAt(4, at)).toBe('2026-09-20T15:00:00.000Z')
  })

  it('복습 예정 시각 전에는 미도래이고 정확한 시각부터 도래한다', () => {
    const at = new Date('2026-09-07T00:00:00+09:00')
    const progress = applyScoredAnswer(createRegionProgress('gyeonggi:seongnam'), true, at)

    expect(isReviewDue(progress, new Date('2026-09-07T14:59:59.999Z'))).toBe(false)
    expect(isReviewDue(progress, new Date('2026-09-07T15:00:00.000Z'))).toBe(true)
  })

  it('stage 3 이상은 같은 학습 세션에서 연속 정답으로 승급하지 않는다', () => {
    const at = new Date('2026-09-07T00:00:00+09:00')
    const initial = createRegionProgress('gyeonggi:seongnam')
    const first = applyScoredAnswer(initial, true, at, 'session-a')
    const second = applyScoredAnswer(first, true, at, 'session-a')
    const blocked = applyScoredAnswer(second, true, at, 'session-a')
    const promoted = applyScoredAnswer(blocked, true, at, 'session-b')

    expect(second.stage).toBe(2)
    expect(blocked.stage).toBe(2)
    expect(blocked.attempts).toBe(3)
    expect(blocked.correctAnswers).toBe(3)
    expect(blocked.lastAnsweredAt).toBe('2026-09-06T15:00:00.000Z')
    expect(promoted.stage).toBe(3)
    expect(promoted.lastPromotionSessionId).toBe('session-b')
  })

  it('세션이 없는 정답은 stage 2를 넘지 않는다', () => {
    const at = new Date('2026-09-07T00:00:00+09:00')
    const initial = createRegionProgress('gyeonggi:seongnam')
    const first = applyScoredAnswer(initial, true, at)
    const second = applyScoredAnswer(first, true, at)
    const third = applyScoredAnswer(second, true, at)

    expect(first.stage).toBe(1)
    expect(second.stage).toBe(2)
    expect(third.stage).toBe(2)
    expect(third.attempts).toBe(3)
    expect(third.correctAnswers).toBe(3)
  })

  it('stage 3에 오른 세션은 같은 세션에서 stage 4로 승급하지 않는다', () => {
    const at = new Date('2026-09-07T00:00:00+09:00')
    const initial = createRegionProgress('gyeonggi:seongnam')
    const stageOne = applyScoredAnswer(initial, true, at, 'session-a')
    const stageTwo = applyScoredAnswer(stageOne, true, at, 'session-a')
    const stageThree = applyScoredAnswer(stageTwo, true, at, 'session-b')
    const blocked = applyScoredAnswer(stageThree, true, at, 'session-b')
    const promoted = applyScoredAnswer(blocked, true, at, 'session-c')

    expect(stageThree.stage).toBe(3)
    expect(blocked.stage).toBe(3)
    expect(promoted.stage).toBe(4)
  })

  it.each([
    { stage: 2 as const, laterStage: 3 as const },
    { stage: 3 as const, laterStage: 4 as const },
  ])('세션 메타데이터가 없는 legacy stage $stage 기록은 첫 세션을 기준으로 삼는다', ({ stage, laterStage }) => {
    const at = new Date('2026-09-07T00:00:00+09:00')
    const legacy = { ...createRegionProgress('gyeonggi:seongnam'), stage }
    const baseline = applyScoredAnswer(legacy, true, at, 'session-a')
    const promoted = applyScoredAnswer(baseline, true, at, 'session-b')

    expect(baseline.stage).toBe(stage)
    expect(baseline.lastPromotionSessionId).toBe('session-a')
    expect(promoted.stage).toBe(laterStage)
  })
})
