import { describe, expect, it } from 'vitest'
import { ALL_DISTRICT_NAMES, DISTRICT_NAME_BY_MAP_ID, shuffleDistricts } from './districts'

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
