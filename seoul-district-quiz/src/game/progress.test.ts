import { describe, expect, it } from 'vitest'
import {
  applyScoredAnswer,
  createRegionProgress,
  getNextReviewAt,
  isReviewDue,
} from './progress'

describe('region learning progress', () => {
  it('정답은 단계를 올리고 1·3·7·21일 뒤에 복습하도록 예약한다', () => {
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

  it('단계별 복습 간격은 0단계에서 없고 4단계에서 21일로 유지된다', () => {
    const at = new Date('2026-09-07T23:30:00+09:00')

    expect(getNextReviewAt(0, at)).toBeNull()
    expect(getNextReviewAt(1, at)).toBe('2026-09-08T14:30:00.000Z')
    expect(getNextReviewAt(2, at)).toBe('2026-09-10T14:30:00.000Z')
    expect(getNextReviewAt(3, at)).toBe('2026-09-14T14:30:00.000Z')
    expect(getNextReviewAt(4, at)).toBe('2026-09-28T14:30:00.000Z')
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
    expect(promoted.stage).toBe(3)
    expect(promoted.lastPromotionSessionId).toBe('session-b')
  })
})
