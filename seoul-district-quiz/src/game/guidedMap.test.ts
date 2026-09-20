import { describe, expect, it } from 'vitest'
import { guidedCandidates } from './guidedMap'
import { REGIONS_BY_ID } from '../data/regions'
import { buildCourse, buildConfirmationQuestions } from './courseGenerator'
import { createRegionProgress } from './progress'

describe('경기 위치 학습', () => {
  it('모든 경기 지역은 같은 상위 지역의 세 후보에 정답을 한 번 포함한다', () => {
    for (const region of Object.values(REGIONS_BY_ID).filter((item) => item.packId === 'gyeonggi' && item.parentId)) {
      const ids = guidedCandidates(region.id, () => 0.42)
      expect(ids).toHaveLength(3)
      expect(new Set(ids).size).toBe(3)
      expect(ids).toContain(region.id)
      expect(ids.every((id) => REGIONS_BY_ID[id].parentId === region.parentId)).toBe(true)
    }
  })
  it('수정구는 성남의 세 구 안에서 고르며 정답 자리도 바뀐다', () => {
    const id = 'gyeonggi:seongnam:sujeong'
    expect(guidedCandidates(id).toSorted()).toEqual(['gyeonggi:seongnam:bundang', 'gyeonggi:seongnam:jungwon', id].toSorted())
    expect(guidedCandidates(id, () => 0)).not.toEqual(guidedCandidates(id, () => 0.99))
    expect(guidedCandidates('invalid')).toEqual([])
  })
  it('처음부터 위치 선택 문제를 내고 3단계부터 전체 지도 도전을 허용한다', () => {
    const id = 'gyeonggi:gwangju'
    for (const stage of [0, 1, 2, 3, 4] as const) {
      const plan = buildCourse(id, { [id]: { ...createRegionProgress(id), stage } }, new Date(), () => 0.42)
      const question = plan.scoredQuestions[0]
      expect(question.questionType).toBe('map-selection')
      expect('showStudy' in question).toBe(false)
      expect(question.allowFullMap).toBe(stage >= 3)
      const confirmation = buildConfirmationQuestions([question])[0]
      expect('showStudy' in confirmation).toBe(false)
      expect(confirmation.scored).toBe(false)
      expect(confirmation.allowFullMap).toBe(false)
    }
  })
})
