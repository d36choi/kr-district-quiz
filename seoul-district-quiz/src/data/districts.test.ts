import { describe, expect, it } from 'vitest'
import { ALL_DISTRICT_NAMES, createRegionalQuestion, DISTRICT_NAME_BY_MAP_ID, shuffleDistricts } from './districts'

describe('서울 전체 타자 출제 순서', () => {
  it('서울 25개 자치구를 빠짐없이 한 번씩 포함한다', () => {
    const shuffled = shuffleDistricts(() => 0.42)

    expect(shuffled).toHaveLength(25)
    expect(new Set(shuffled).size).toBe(25)
    expect(shuffled.toSorted()).toEqual([...ALL_DISTRICT_NAMES].toSorted())
  })

  it('지도 ID와 자치구 데이터가 정확히 25개로 일치한다', () => {
    expect(Object.keys(DISTRICT_NAME_BY_MAP_ID)).toHaveLength(25)
    expect(ALL_DISTRICT_NAMES).toContain('영등포구')
    expect(ALL_DISTRICT_NAMES).toContain('중구')
  })
})

describe('지역 객관식 보기', () => {
  it.each([
    ['recognition', 'gyeonggi:seongnam', '성남시', 4],
    ['silhouette', 'gyeonggi:seongnam', '성남시', 4],
    ['recognition', 'gyeonggi:seongnam:bundang', '분당구', 4],
    ['silhouette', 'gyeonggi:seongnam:bundang', '분당구', 4],
  ] as const)('%s %s의 정답 위치가 바뀌어도 보기는 중복 없이 정답을 한 번 포함한다', (questionType, regionId, answer, count) => {
    const question = { regionId, answer, questionType, bucket: 'target' as const, scored: true }
    const shifted = createRegionalQuestion(question, () => 0)
    const unshifted = createRegionalQuestion(question, () => 0.999)

    expect(shifted.options?.indexOf(answer)).toBe(3)
    expect(unshifted.options?.indexOf(answer)).toBe(0)
    for (const { options } of [shifted, unshifted]) {
      expect(options).toHaveLength(count)
      expect(new Set(options).size).toBe(count)
      expect(options?.filter((option) => option === answer)).toHaveLength(1)
    }
  })
})
