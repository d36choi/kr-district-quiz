import { describe, expect, it } from 'vitest'
import {
  REGION_PACKS,
  REGIONS_BY_ID,
  buildRegionCatalog,
  getRegion,
  getTopLevelRegions,
} from './regions'
import type { Region } from './regions'

function createTestRegion(id: string, geometryId = id): Region {
  return {
    id,
    packId: 'seoul',
    name: id,
    level: 'district',
    parentId: 'seoul',
    geometryId,
    neighborIds: [],
    aliases: [],
  }
}

describe('서울·경기 지역 카탈로그', () => {
  it('경기 최상위 지역은 정확히 31개 시·군이다', () => {
    const regions = getTopLevelRegions('gyeonggi')

    expect(regions).toHaveLength(31)
    expect(new Set(regions.map(({ id }) => id)).size).toBe(31)
    expect(regions.map(({ name }) => name).toSorted()).toEqual(
      [
        '가평군',
        '고양시',
        '과천시',
        '광명시',
        '광주시',
        '구리시',
        '군포시',
        '김포시',
        '남양주시',
        '동두천시',
        '부천시',
        '성남시',
        '수원시',
        '시흥시',
        '안산시',
        '안성시',
        '안양시',
        '양주시',
        '양평군',
        '여주시',
        '연천군',
        '오산시',
        '용인시',
        '의왕시',
        '의정부시',
        '이천시',
        '파주시',
        '평택시',
        '포천시',
        '하남시',
        '화성시',
      ].toSorted(),
    )
  })

  it('카탈로그 생성 중 중복 지역 ID를 거부한다', () => {
    expect(() =>
      buildRegionCatalog([
        createTestRegion('seoul:duplicate', 'geometry:first'),
        createTestRegion('seoul:duplicate', 'geometry:second'),
      ]),
    ).toThrowError('Duplicate region id: seoul:duplicate')
  })

  it('카탈로그 생성 중 중복 geometry ID를 거부한다', () => {
    expect(() =>
      buildRegionCatalog([
        createTestRegion('seoul:first', 'geometry:duplicate'),
        createTestRegion('seoul:second', 'geometry:duplicate'),
      ]),
    ).toThrowError('Duplicate region geometryId: geometry:duplicate')
  })

  it('전체 카탈로그의 지역 ID는 빠짐없이 고유하다', () => {
    const regions = Object.values(REGIONS_BY_ID)

    expect(regions).toHaveLength(68)
    expect(new Set(regions.map(({ id }) => id)).size).toBe(68)
  })

  it('전체 카탈로그의 geometry ID는 빠짐없이 고유하다', () => {
    const regions = Object.values(REGIONS_BY_ID)

    expect(regions).toHaveLength(68)
    expect(new Set(regions.map(({ geometryId }) => geometryId)).size).toBe(68)
  })

  it('세부 구는 올바른 도시의 자식으로 연결된다', () => {
    expect(getRegion('gyeonggi:seongnam:bundang')?.parentId).toBe('gyeonggi:seongnam')
    expect(getRegion('gyeonggi:suwon:yeongtong')?.level).toBe('district')
    expect(getRegion('gyeonggi:yongin:suji')?.parentId).toBe('gyeonggi:yongin')
  })

  it('검색과 정답 정규화를 위한 도시·세부 구 별칭을 제공한다', () => {
    expect(getRegion('gyeonggi:seongnam')?.aliases).toEqual(
      expect.arrayContaining(['성남', '성남시']),
    )
    expect(getRegion('gyeonggi:seongnam:bundang')?.aliases).toEqual(
      expect.arrayContaining(['분당', '분당구', '성남시 분당구']),
    )
  })

  it('각 지역팩은 조회 가능한 루트와 고정된 최상위 목록을 가진다', () => {
    expect(getRegion(REGION_PACKS.seoul.rootRegionId)?.name).toBe('서울특별시')
    expect(getRegion(REGION_PACKS.gyeonggi.rootRegionId)?.name).toBe('경기도')
    expect(getTopLevelRegions('seoul')).toHaveLength(25)
    expect(Object.isFrozen(getTopLevelRegions('gyeonggi'))).toBe(true)
    expect(Object.isFrozen(REGIONS_BY_ID)).toBe(true)
  })

  it('등록되지 않은 지역 ID는 조회되지 않는다', () => {
    expect(getRegion('gyeonggi:not-a-region')).toBeUndefined()
  })
})
