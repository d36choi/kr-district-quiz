import { describe, expect, it } from 'vitest'
import { createRegionalQuestion } from '../data/districts'
import { REGIONS_BY_ID } from '../data/regions'
import { buildCourse, buildWeakReviewCourse, getWeakRegions } from './courseGenerator'
import { createRegionProgress, type RegionProgress } from './progress'

const now = new Date('2026-09-15T00:00:00Z')
const random = () => 0.42
const missed = (id: string): RegionProgress => ({ ...createRegionProgress(id), attempts: 2, correctAnswers: 0 })

describe('다시 풀기', () => {
  it('오답이 없으면 복습 코스를 만들지 않는다', () => {
    expect(buildWeakReviewCourse({}, now, random)).toBeUndefined()
  })

  it('복습일이 없는 0단계 오답을 포함하고 부족한 문제를 중복 없이 채운다', () => {
    const progress = { 'seoul:mapo': missed('seoul:mapo') }
    const before = structuredClone(progress)
    const plan = buildWeakReviewCourse(progress, now, random)!
    expect(plan.scoredQuestions[0].regionId).toBe('seoul:mapo')
    expect(plan.scoredQuestions).toHaveLength(5)
    expect(new Set(plan.scoredQuestions.map((question) => question.regionId)).size).toBe(5)
    expect(plan.scoredQuestions.every((question) => question.scored)).toBe(true)
    expect(progress).toEqual(before)
  })

  it('두 지역팩의 오답을 함께 고르되 잘 익힌 지역과 잘못된 ID는 제외한다', () => {
    const progress = {
      a: missed('seoul:mapo'), b: missed('gyeonggi:hanam'),
      c: { ...missed('seoul:jongno'), stage: 3 as const }, d: missed('unknown'),
    }
    expect(getWeakRegions(progress).map((item) => item.regionId).toSorted()).toEqual(['gyeonggi:hanam', 'seoul:mapo'])
    expect(buildWeakReviewCourse(progress, now, random)?.scoredQuestions.slice(0, 2).map((item) => item.regionId).toSorted())
      .toEqual(['gyeonggi:hanam', 'seoul:mapo'])
  })

  it('같은 단계로 다시 풀 때 직전 유형을 반복하지 않는다', () => {
    const id = 'seoul:mapo'
    const progress = { [id]: { ...createRegionProgress(id), stage: 4 as const, lastQuestionType: 'text-recall' } }
    expect(buildCourse(id, progress, now, random).scoredQuestions[0].questionType).toBe('map-selection')
  })

  it('모든 지역의 반복 코스에서 인접 문제는 같은 지도 범위에 정답이 하나뿐이다', () => {
    const regions = Object.values(REGIONS_BY_ID).filter((region) => region.parentId !== null)
    const progress = Object.fromEntries(regions.map((region) => [region.id, {
      ...createRegionProgress(region.id), stage: 2 as const, attempts: 2, correctAnswers: 2, lastQuestionType: 'map-selection',
    }]))
    let count = 0
    for (const region of regions) {
      for (const question of buildCourse(region.id, progress, now, random).scoredQuestions) {
        if (question.questionType !== 'adjacency') continue
        count += 1
        const display = createRegionalQuestion(question, random)
        const reference = REGIONS_BY_ID[question.referenceRegionId!]
        expect(reference.parentId).toBe(REGIONS_BY_ID[question.regionId].parentId)
        expect(display.options).toHaveLength(4)
        expect(new Set(display.options).size).toBe(4)
        expect(display.options?.filter((name) => reference.neighborIds.some((id) => REGIONS_BY_ID[id].name === name)))
          .toEqual([question.answer])
      }
    }
    expect(count).toBeGreaterThan(0)
  })

  it('잘못된 인접 관계로 문제를 만들지 않는다', () => {
    expect(() => createRegionalQuestion({ regionId: 'seoul:mapo', answer: '마포구',
      referenceRegionId: 'gyeonggi:suwon', questionType: 'adjacency', bucket: 'neighbor', scored: true })).toThrow(RangeError)
  })

  it('객관식 오답 후보도 다시 뽑는다', () => {
    const question = { regionId: 'seoul:mapo', answer: '마포구', questionType: 'recognition' as const, bucket: 'target' as const, scored: true }
    expect(createRegionalQuestion(question, () => 0).options?.toSorted())
      .not.toEqual(createRegionalQuestion(question, () => 0.99).options?.toSorted())
  })
})
