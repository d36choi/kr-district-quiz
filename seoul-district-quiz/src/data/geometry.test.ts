import { describe, expect, it } from 'vitest'
import gyeonggiDistrictsSvg from '../assets/maps/gyeonggi-districts.svg?raw'
import gyeonggiMunicipalitiesSvg from '../assets/maps/gyeonggi-municipalities.svg?raw'
import { loadGeometry, parseGeometrySvg } from './geometry'

describe('경기 지역 경계', () => {
  it('경기도 전체 SVG는 31개 최상위 시군 path를 제공한다', () => {
    const paths = parseGeometrySvg(gyeonggiMunicipalitiesSvg)

    expect(paths.filter((path) => path.level === 'city' || path.level === 'county')).toHaveLength(31)
  })

  it('세부 SVG는 수원·성남·용인 구 ID를 제공한다', () => {
    const ids = parseGeometrySvg(gyeonggiDistrictsSvg).map((path) => path.regionId)

    expect(ids).toEqual(expect.arrayContaining([
      'gyeonggi:suwon:yeongtong',
      'gyeonggi:seongnam:bundang',
      'gyeonggi:yongin:suji',
    ]))
  })

  it('팩과 세부 수준에 맞는 고유한 geometry manifest를 불러온다', async () => {
    const geometry = await loadGeometry('gyeonggi', false)

    expect(geometry.packId).toBe('gyeonggi')
    expect(geometry.detail).toBe(false)
    expect(geometry.viewBox).toMatch(/\S/)
    expect(geometry.paths).toHaveLength(31)
    expect(new Set(geometry.paths.map((path) => path.geometryId)).size).toBe(31)
  })

  it('알 수 없는 data-region-id가 포함된 SVG를 거부한다', () => {
    expect(() => parseGeometrySvg(`
      <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
        <path data-region-id="gyeonggi:not-a-region" data-geometry-id="bad" data-name="없는 지역" data-level="city" d="M0 0H1V1Z" />
      </svg>
    `)).toThrowError('Unknown geometry region id: gyeonggi:not-a-region')
  })
})
