import { describe, expect, it } from 'vitest'
import { getNeighbors } from '../data/adjacency'
import { REGIONS_BY_ID } from '../data/regions'
import { createRegionProgress, type RegionProgress } from './progress'
import {
  buildConfirmationQuestions,
  buildCourse,
  buildDueReviewCourse,
  type CourseQuestion,
} from './courseGenerator'

const now = new Date('2026-09-08T12:00:00+09:00')

function emptyProgress(): Readonly<Record<string, RegionProgress>> {
  return {}
}

function fixtureProgress(): Readonly<Record<string, RegionProgress>> {
  const due = {
    ...createRegionProgress('seoul:mapo'),
    stage: 2 as const,
    nextReviewAt: '2026-09-07T00:00:00.000Z',
  }

  return { [due.regionId]: due }
}

function progressAt(
  regionId: string,
  stage: RegionProgress['stage'],
  nextReviewAt: string | null = null,
): RegionProgress {
  return { ...createRegionProgress(regionId), stage, nextReviewAt }
}

describe('course generation', () => {
  it('오늘의 복습은 오래 밀린 지역부터 최대 5개만 출제한다', () => {
    const regionIds = ['seoul:mapo', 'seoul:jongno', 'seoul:gangnam', 'gyeonggi:hanam', 'gyeonggi:suwon', 'gyeonggi:yongin']
    const progressByRegion = Object.fromEntries(regionIds.map((regionId, index) => [
      regionId,
      progressAt(regionId, 1, `2026-09-0${index + 1}T00:00:00.000Z`),
    ]))

    const plan = buildDueReviewCourse(progressByRegion, now)

    expect(plan?.scoredQuestions.map((question) => question.regionId)).toEqual(regionIds.slice(0, 5))
  })

  it('오늘의 복습은 만기 지역이 적으면 새 지역으로 채우지 않는다', () => {
    const progressByRegion = {
      'seoul:mapo': progressAt('seoul:mapo', 1, '2026-09-01T00:00:00.000Z'),
      'gyeonggi:hanam': progressAt('gyeonggi:hanam', 2, '2026-09-02T00:00:00.000Z'),
    }

    const plan = buildDueReviewCourse(progressByRegion, now)

    expect(plan?.scoredQuestions.map((question) => question.regionId)).toEqual(['seoul:mapo', 'gyeonggi:hanam'])
  })

  it('오늘의 복습 대상이 없으면 코스를 만들지 않는다', () => {
    expect(buildDueReviewCourse({}, now)).toBeUndefined()
  })

  it('관심 지역 2·인접 지역 2·복습 1의 5문제를 만든다', () => {
    const plan = buildCourse('gyeonggi:seongnam', fixtureProgress(), now, () => 0.42)

    expect(plan.scoredQuestions).toHaveLength(5)
    expect(plan.scoredQuestions.filter((question) => question.bucket === 'target')).toHaveLength(2)
    expect(plan.scoredQuestions.filter((question) => question.bucket === 'neighbor')).toHaveLength(2)
    expect(plan.scoredQuestions.filter((question) => question.bucket === 'review')).toHaveLength(1)
  })

  it('복습 대상이 없으면 낮은 숙련도 지역으로 채운다', () => {
    const plan = buildCourse('gyeonggi:suwon', emptyProgress(), now, () => 0.1)

    expect(plan.scoredQuestions).toHaveLength(5)
    expect(new Set(plan.scoredQuestions.map((question) => question.regionId)).size).toBe(5)
  })

  it('하위 구가 있는 관심 도시는 도시 자체와 하위 구를 출제한다', () => {
    const plan = buildCourse('gyeonggi:seongnam', emptyProgress(), now, () => 0.42)
    const targetIds = plan.scoredQuestions
      .filter((question) => question.bucket === 'target')
      .map((question) => question.regionId)

    expect(targetIds).toContain('gyeonggi:seongnam')
    expect(targetIds.some((regionId) => regionId.startsWith('gyeonggi:seongnam:'))).toBe(true)
  })

  it('인접 지역이 없는 관심 범위도 중복 없이 유한하게 대체 출제한다', () => {
    expect(getNeighbors('seoul')).toEqual([])

    const plan = buildCourse('seoul', emptyProgress(), now, () => 0.42)
    const neighborQuestions = plan.scoredQuestions.filter(
      (question) => question.bucket === 'neighbor',
    )

    expect(neighborQuestions).toHaveLength(2)
    expect(new Set(plan.scoredQuestions.map((question) => question.regionId)).size).toBe(5)
  })

  it('서울 관심 지역의 코스에 경기도 지역을 섞지 않는다', () => {
    const progressByRegion = Object.fromEntries(
      getNeighbors('seoul:songpa').map((regionId) => [
        regionId,
        progressAt(regionId, regionId.startsWith('gyeonggi:') ? 0 : 4),
      ]),
    )

    const plan = buildCourse('seoul:songpa', progressByRegion, now, () => 0.42)
    expect(plan.scoredQuestions.every((question) => question.regionId.startsWith('seoul:'))).toBe(true)
  })

  it('종로구 코스는 종로구와 서울 내 직접 인접 지역만 출제한다', () => {
    const plan = buildCourse('seoul:jongno', emptyProgress(), now, () => 0.42)
    const relevantRegionIds = new Set([
      'seoul:jongno',
      ...getNeighbors('seoul:jongno').filter((regionId) => regionId.startsWith('seoul:')),
    ])

    expect(plan.scoredQuestions).toHaveLength(5)
    expect(plan.scoredQuestions.every((question) => relevantRegionIds.has(question.regionId))).toBe(true)
  })

  it('인접 후보와 복습 후보가 겹쳐도 같은 지역을 두 번 출제하지 않는다', () => {
    const progressByRegion = {
      'gyeonggi:hanam': progressAt(
        'gyeonggi:hanam',
        1,
        '2026-09-01T00:00:00.000Z',
      ),
    }

    const plan = buildCourse('seoul:songpa', progressByRegion, now, () => 0.42)

    expect(new Set(plan.scoredQuestions.map((question) => question.regionId)).size).toBe(5)
  })

  it('인접 버킷에 같은 지역을 중복 출제하지 않는다', () => {
    const plan = buildCourse('gyeonggi:yeoncheon', emptyProgress(), now, () => 0.42)
    const neighborIds = plan.scoredQuestions
      .filter((question) => question.bucket === 'neighbor')
      .map((question) => question.regionId)

    expect(neighborIds).toHaveLength(2)
    expect(new Set(neighborIds).size).toBe(2)
  })

  it('학습 범위 안에서 단계보다 복습 예정일이 오래 지난 지역을 먼저 고른다', () => {
    const progressByRegion = {
      'gyeonggi:gwangju': progressAt('gyeonggi:gwangju', 4, '2026-09-01T00:00:00.000Z'),
      'gyeonggi:yongin': progressAt('gyeonggi:yongin', 1, '2026-09-02T00:00:00.000Z'),
    }

    const plan = buildCourse('gyeonggi:seongnam', progressByRegion, now, () => 0.99)
    const review = plan.scoredQuestions.find((question) => question.bucket === 'review')

    expect(review?.regionId).toBe('gyeonggi:gwangju')
  })

  it('학습 범위 안에서 복습 예정일이 같으면 단계가 낮은 지역을 먼저 고른다', () => {
    const dueAt = '2026-09-01T00:00:00.000Z'
    const progressByRegion = {
      'gyeonggi:gwangju': progressAt('gyeonggi:gwangju', 3, dueAt),
      'gyeonggi:yongin': progressAt('gyeonggi:yongin', 1, dueAt),
    }

    const plan = buildCourse('gyeonggi:seongnam', progressByRegion, now, () => 0)
    const review = plan.scoredQuestions.find((question) => question.bucket === 'review')

    expect(review?.regionId).toBe('gyeonggi:yongin')
  })

  it('복습할 지역이 없으면 학습 범위의 가장 낮은 단계 지역을 복습 버킷에 넣는다', () => {
    const lowStageRegionIds = new Set([
      'gyeonggi:gwacheon',
      'gyeonggi:gwangju',
      'gyeonggi:yongin',
    ])
    const progressByRegion = Object.fromEntries(
      Object.values(REGIONS_BY_ID)
        .filter((region) => region.parentId !== null)
        .map((region) => [region.id, progressAt(region.id, lowStageRegionIds.has(region.id) ? 0 : 4)]),
    )

    const plan = buildCourse('gyeonggi:seongnam', progressByRegion, now, () => 0.42)
    const review = plan.scoredQuestions.find((question) => question.bucket === 'review')

    expect(review?.regionId.startsWith('gyeonggi:')).toBe(true)
    expect(lowStageRegionIds.has(review?.regionId ?? '')).toBe(true)
  })

  it.each([
    { stage: 0 as const, expected: 'map-selection' },
    { stage: 1 as const, expected: 'map-selection' },
    { stage: 2 as const, expected: 'map-selection' },
    { stage: 3 as const, expected: 'map-selection' },
    { stage: 4 as const, expected: 'map-selection' },
  ])('$stage단계에 허용된 $expected 문제를 만든다', ({ stage, expected }) => {
    const progressByRegion = {
      'gyeonggi:seongnam': progressAt('gyeonggi:seongnam', stage),
    }

    const plan = buildCourse('gyeonggi:seongnam', progressByRegion, now, () => 0.42)
    const target = plan.scoredQuestions.find(
      (question) => question.regionId === 'gyeonggi:seongnam',
    )

    expect(target?.questionType).toBe(expected)
  })

  it('코스를 만들어도 전달받은 진도는 변경하지 않는다', () => {
    const progressByRegion = fixtureProgress()
    const before = structuredClone(progressByRegion)

    buildCourse('gyeonggi:seongnam', progressByRegion, now, () => 0.42)

    expect(progressByRegion).toEqual(before)
  })

  it('오답 확인 문제는 앞의 두 지역과 정답을 유지하고 채점하지 않는다', () => {
    const wrongQuestions: readonly CourseQuestion[] = [
      {
        regionId: 'seoul:mapo',
        answer: '마포구',
        bucket: 'review',
        questionType: 'text-recall',
        scored: true,
      },
      {
        regionId: 'gyeonggi:hanam',
        answer: '하남시',
        bucket: 'neighbor',
        questionType: 'map-selection',
        scored: true,
      },
      {
        regionId: 'gyeonggi:suwon',
        answer: '수원시',
        bucket: 'target',
        questionType: 'recognition',
        scored: true,
      },
    ]

    const confirmations = buildConfirmationQuestions(wrongQuestions)

    expect(confirmations.map(({ regionId, answer, scored }) => ({ regionId, answer, scored }))).toEqual([
      { regionId: 'seoul:mapo', answer: '마포구', scored: false },
      { regionId: 'gyeonggi:hanam', answer: '하남시', scored: false },
    ])
    expect(wrongQuestions.every((question) => question.scored)).toBe(true)
  })
})
