import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import gyeonggiDistrictsSvg from '../assets/maps/gyeonggi-districts.svg?raw'
import gyeonggiMunicipalitiesSvg from '../assets/maps/gyeonggi-municipalities.svg?raw'
import { getTopLevelRegions } from './regions'
import { loadGeometry, parseGeometryManifest, parseGeometrySvg } from './geometry'

Object.assign(globalThis, { DOMParser })

const DETAIL_REGION_IDS = [
  'gyeonggi:suwon:jangan',
  'gyeonggi:suwon:gwonseon',
  'gyeonggi:suwon:paldal',
  'gyeonggi:suwon:yeongtong',
  'gyeonggi:seongnam:sujeong',
  'gyeonggi:seongnam:jungwon',
  'gyeonggi:seongnam:bundang',
  'gyeonggi:yongin:cheoin',
  'gyeonggi:yongin:giheung',
  'gyeonggi:yongin:suji',
]

function svgWithPaths(paths: string, viewBox = '0 0 10 10') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" data-source-id="sgis-2025-q2-sigungu" data-base-date="2025-06-30" data-source-sha256="f1cf0f9de453ac7eaacb273f39cee52851183372b9ddfda428a967c3a670b2c6">${paths}</svg>`
}

describe('경기 지역 경계', () => {
  it('경기도 전체 SVG는 카탈로그와 같은 31개 최상위 시군 path를 제공한다', () => {
    const paths = parseGeometrySvg(gyeonggiMunicipalitiesSvg)

    expect(paths.filter((path) => path.level === 'city' || path.level === 'county')).toHaveLength(31)
    expect(paths.map((path) => path.regionId).toSorted()).toEqual(
      getTopLevelRegions('gyeonggi').map((region) => region.id).toSorted(),
    )
  })

  it('세부 SVG는 정확히 수원·성남·용인의 10개 구 ID를 제공한다', () => {
    expect(parseGeometrySvg(gyeonggiDistrictsSvg).map((path) => path.regionId).toSorted())
      .toEqual(DETAIL_REGION_IDS.toSorted())
  })

  it('팩과 세부 수준에 맞는 source-linked geometry manifest를 불러온다', async () => {
    const geometry = await loadGeometry('gyeonggi', false)

    expect(geometry.packId).toBe('gyeonggi')
    expect(geometry.detail).toBe(false)
    expect(geometry.viewBox).toBe('0 0 1000 1000')
    expect(geometry.source.baseDate).toBe('2025-06-30')
    expect(geometry.paths).toHaveLength(31)
  })

  it('빈 viewBox를 거부한다', () => {
    expect(() => parseGeometrySvg(svgWithPaths('', ''))).toThrowError('Geometry SVG has no non-empty viewBox')
  })

  it('필수 path metadata가 빠진 SVG를 거부한다', () => {
    expect(() => parseGeometrySvg(svgWithPaths('<path data-region-id="gyeonggi:suwon" d="M0 0H1V1Z" />')))
      .toThrowError('Geometry SVG path is missing required metadata')
  })

  it('카탈로그와 다른 이름이나 level metadata를 거부한다', () => {
    const path = '<path data-geometry-id="gyeonggi:suwon" data-region-id="gyeonggi:suwon" data-name="위조시" data-level="county" d="M0 0H1V1Z" />'
    expect(() => parseGeometrySvg(svgWithPaths(path))).toThrowError('Geometry SVG path metadata does not match catalog: gyeonggi:suwon')
  })

  it('XML entity로 표현된 올바른 path metadata를 DOM으로 해석한다', () => {
    const path = '<path data-geometry-id="gyeonggi:suwon" data-region-id="gyeonggi:suwon" data-name="&#xC218;&#xC6D0;&#xC2DC;" data-level="city" d="M0 0H1V1Z" />'
    expect(parseGeometrySvg(svgWithPaths(path))[0]?.name).toBe('수원시')
  })

  it('중복 geometry ID를 거부한다', () => {
    const path = '<path data-geometry-id="gyeonggi:suwon" data-region-id="gyeonggi:suwon" data-name="수원시" data-level="city" d="M0 0H1V1Z" />'
    expect(() => parseGeometrySvg(svgWithPaths(`${path}${path}`))).toThrowError('Geometry SVG has duplicate geometry IDs')
  })

  it('알 수 없는 region ID를 거부한다', () => {
    expect(() => parseGeometrySvg(svgWithPaths('<path data-geometry-id="bad" data-region-id="gyeonggi:not-a-region" data-name="없는 지역" data-level="city" d="M0 0H1V1Z" />')))
      .toThrowError('Unknown geometry region id: gyeonggi:not-a-region')
  })

  it('manifest에서 카탈로그 geometry가 누락되면 거부한다', () => {
    const path = '<path data-geometry-id="gyeonggi:suwon" data-region-id="gyeonggi:suwon" data-name="수원시" data-level="city" d="M0 0H1V1Z" />'
    expect(() => parseGeometryManifest('gyeonggi', false, svgWithPaths(path)))
      .toThrowError('Geometry SVG is missing regions:')
  })
})
