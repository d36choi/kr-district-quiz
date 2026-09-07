import { describe, expect, it } from 'vitest'
import { getNeighbors } from './adjacency'
import { REGIONS_BY_ID, getRegion } from './regions'

describe('서울·경기 인접 관계', () => {
  it('모든 인접 관계는 존재하는 지역끼리 양방향으로 연결된다', () => {
    for (const region of Object.values(REGIONS_BY_ID)) {
      for (const neighborId of getNeighbors(region.id)) {
        expect(REGIONS_BY_ID[neighborId], `${region.id} -> ${neighborId}`).toBeDefined()
        expect(getNeighbors(neighborId), `${neighborId} -> ${region.id}`).toContain(region.id)
      }
    }
  })

  it('서울 강동구와 경기 하남시는 행정 경계를 공유하는 교차 지역팩 이웃이다', () => {
    expect(getNeighbors('seoul:gangdong')).toContain('gyeonggi:hanam')
    expect(getNeighbors('gyeonggi:hanam')).toContain('seoul:gangdong')
  })

  it('구리시와 하남시는 한 꼭짓점에서만 만나므로 이웃에서 제외한다', () => {
    expect(getNeighbors('gyeonggi:guri')).not.toContain('gyeonggi:hanam')
    expect(getNeighbors('gyeonggi:hanam')).not.toContain('gyeonggi:guri')
  })

  it('세부 구 사이의 공유 경계를 조회한다', () => {
    expect(getNeighbors('gyeonggi:seongnam:bundang')).toContain(
      'gyeonggi:seongnam:jungwon',
    )
    expect(getNeighbors('gyeonggi:suwon:yeongtong')).toContain(
      'gyeonggi:yongin:suji',
    )
  })

  it('조회 결과와 지역 레코드의 이웃 목록은 같은 읽기 전용 값이다', () => {
    const neighbors = getNeighbors('gyeonggi:seongnam')

    expect(neighbors).toBe(getNeighbors('gyeonggi:seongnam'))
    expect(neighbors).toBe(getRegion('gyeonggi:seongnam')?.neighborIds)
    expect(Object.isFrozen(neighbors)).toBe(true)
    expect(getNeighbors('not-a-region')).toEqual([])
    expect(Object.isFrozen(getNeighbors('not-a-region'))).toBe(true)
  })
})
