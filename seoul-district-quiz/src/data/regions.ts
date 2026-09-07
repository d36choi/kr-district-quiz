import { getNeighbors } from './adjacency'

export type RegionPackId = 'seoul' | 'gyeonggi'

export type RegionLevel = 'province' | 'city' | 'county' | 'district'

export type Region = Readonly<{
  id: string
  packId: RegionPackId
  name: string
  level: RegionLevel
  parentId: string | null
  geometryId: string
  neighborIds: readonly string[]
  aliases: readonly string[]
}>

export type RegionPack = Readonly<{
  id: RegionPackId
  name: string
  rootRegionId: string
  boundarySource: Readonly<{
    url: string
    baseDate: string
    license: string
  }>
}>

function createRegion(
  id: string,
  packId: RegionPackId,
  name: string,
  level: RegionLevel,
  parentId: string | null,
  aliases: readonly string[],
): Region {
  return Object.freeze({
    id,
    packId,
    name,
    level,
    parentId,
    geometryId: id,
    neighborIds: getNeighbors(id),
    aliases: Object.freeze([...aliases]),
  })
}

function createSeoulDistrict(slug: string, name: string): Region {
  return createRegion(
    `seoul:${slug}`,
    'seoul',
    name,
    'district',
    'seoul',
    [name.slice(0, -1), name],
  )
}

function createGyeonggiMunicipality(
  slug: string,
  name: string,
  level: 'city' | 'county' = 'city',
  aliases: readonly string[] = [name.slice(0, -1), name],
): Region {
  return createRegion(`gyeonggi:${slug}`, 'gyeonggi', name, level, 'gyeonggi', aliases)
}

function createGyeonggiDistrict(
  citySlug: string,
  cityName: string,
  districtSlug: string,
  districtName: string,
): Region {
  const districtStem = districtName.slice(0, -1)
  const cityStem = cityName.slice(0, -1)

  return createRegion(
    `gyeonggi:${citySlug}:${districtSlug}`,
    'gyeonggi',
    districtName,
    'district',
    `gyeonggi:${citySlug}`,
    [districtStem, districtName, `${cityStem} ${districtStem}`, `${cityName} ${districtName}`],
  )
}

const ROOT_REGIONS: readonly Region[] = [
  createRegion('seoul', 'seoul', '서울특별시', 'province', null, ['서울', '서울시', '서울특별시']),
  createRegion('gyeonggi', 'gyeonggi', '경기도', 'province', null, ['경기', '경기도']),
]

const SEOUL_DISTRICTS: readonly Region[] = [
  createSeoulDistrict('jongno', '종로구'),
  createSeoulDistrict('jung', '중구'),
  createSeoulDistrict('yongsan', '용산구'),
  createSeoulDistrict('seongdong', '성동구'),
  createSeoulDistrict('gwangjin', '광진구'),
  createSeoulDistrict('dongdaemun', '동대문구'),
  createSeoulDistrict('jungnang', '중랑구'),
  createSeoulDistrict('seongbuk', '성북구'),
  createSeoulDistrict('gangbuk', '강북구'),
  createSeoulDistrict('dobong', '도봉구'),
  createSeoulDistrict('nowon', '노원구'),
  createSeoulDistrict('eunpyeong', '은평구'),
  createSeoulDistrict('seodaemun', '서대문구'),
  createSeoulDistrict('mapo', '마포구'),
  createSeoulDistrict('yangcheon', '양천구'),
  createSeoulDistrict('gangseo', '강서구'),
  createSeoulDistrict('guro', '구로구'),
  createSeoulDistrict('geumcheon', '금천구'),
  createSeoulDistrict('yeongdeungpo', '영등포구'),
  createSeoulDistrict('dongjak', '동작구'),
  createSeoulDistrict('gwanak', '관악구'),
  createSeoulDistrict('seocho', '서초구'),
  createSeoulDistrict('gangnam', '강남구'),
  createSeoulDistrict('songpa', '송파구'),
  createSeoulDistrict('gangdong', '강동구'),
]

const GYEONGGI_MUNICIPALITIES: readonly Region[] = [
  createGyeonggiMunicipality('suwon', '수원시'),
  createGyeonggiMunicipality('seongnam', '성남시'),
  createGyeonggiMunicipality('uijeongbu', '의정부시'),
  createGyeonggiMunicipality('anyang', '안양시'),
  createGyeonggiMunicipality('bucheon', '부천시'),
  createGyeonggiMunicipality('gwangmyeong', '광명시'),
  createGyeonggiMunicipality('pyeongtaek', '평택시'),
  createGyeonggiMunicipality('dongducheon', '동두천시'),
  createGyeonggiMunicipality('ansan', '안산시'),
  createGyeonggiMunicipality('goyang', '고양시'),
  createGyeonggiMunicipality('gwacheon', '과천시'),
  createGyeonggiMunicipality('guri', '구리시'),
  createGyeonggiMunicipality('namyangju', '남양주시'),
  createGyeonggiMunicipality('osan', '오산시'),
  createGyeonggiMunicipality('siheung', '시흥시'),
  createGyeonggiMunicipality('gunpo', '군포시'),
  createGyeonggiMunicipality('uiwang', '의왕시'),
  createGyeonggiMunicipality('hanam', '하남시'),
  createGyeonggiMunicipality('yongin', '용인시'),
  createGyeonggiMunicipality('paju', '파주시'),
  createGyeonggiMunicipality('icheon', '이천시'),
  createGyeonggiMunicipality('anseong', '안성시'),
  createGyeonggiMunicipality('gimpo', '김포시'),
  createGyeonggiMunicipality('hwaseong', '화성시'),
  createGyeonggiMunicipality('gwangju', '광주시', 'city', [
    '광주',
    '광주시',
    '경기 광주',
    '경기도 광주시',
  ]),
  createGyeonggiMunicipality('yangju', '양주시'),
  createGyeonggiMunicipality('pocheon', '포천시'),
  createGyeonggiMunicipality('yeoju', '여주시'),
  createGyeonggiMunicipality('yeoncheon', '연천군', 'county'),
  createGyeonggiMunicipality('gapyeong', '가평군', 'county'),
  createGyeonggiMunicipality('yangpyeong', '양평군', 'county'),
]

const GYEONGGI_DISTRICTS: readonly Region[] = [
  createGyeonggiDistrict('suwon', '수원시', 'jangan', '장안구'),
  createGyeonggiDistrict('suwon', '수원시', 'gwonseon', '권선구'),
  createGyeonggiDistrict('suwon', '수원시', 'paldal', '팔달구'),
  createGyeonggiDistrict('suwon', '수원시', 'yeongtong', '영통구'),
  createGyeonggiDistrict('seongnam', '성남시', 'sujeong', '수정구'),
  createGyeonggiDistrict('seongnam', '성남시', 'jungwon', '중원구'),
  createGyeonggiDistrict('seongnam', '성남시', 'bundang', '분당구'),
  createGyeonggiDistrict('yongin', '용인시', 'cheoin', '처인구'),
  createGyeonggiDistrict('yongin', '용인시', 'giheung', '기흥구'),
  createGyeonggiDistrict('yongin', '용인시', 'suji', '수지구'),
]

const ALL_REGIONS = [
  ...ROOT_REGIONS,
  ...SEOUL_DISTRICTS,
  ...GYEONGGI_MUNICIPALITIES,
  ...GYEONGGI_DISTRICTS,
]

export function buildRegionCatalog(regions: readonly Region[]): Readonly<Record<string, Region>> {
  const regionsById: Record<string, Region> = Object.create(null)
  const geometryIds = new Set<string>()

  for (const region of regions) {
    if (Object.hasOwn(regionsById, region.id)) {
      throw new Error(`Duplicate region id: ${region.id}`)
    }
    if (geometryIds.has(region.geometryId)) {
      throw new Error(`Duplicate region geometryId: ${region.geometryId}`)
    }

    regionsById[region.id] = region
    geometryIds.add(region.geometryId)
  }

  return Object.freeze(regionsById)
}

export const REGIONS_BY_ID = buildRegionCatalog(ALL_REGIONS)

export const REGION_PACKS: Readonly<Record<RegionPackId, RegionPack>> = Object.freeze({
  seoul: Object.freeze({
    id: 'seoul',
    name: '서울',
    rootRegionId: 'seoul',
    boundarySource: Object.freeze({
      url: 'https://www.data.go.kr/data/15059008/openapi.do',
      baseDate: '2025-01',
      license: '공공누리 제1유형',
    }),
  }),
  gyeonggi: Object.freeze({
    id: 'gyeonggi',
    name: '경기',
    rootRegionId: 'gyeonggi',
    boundarySource: Object.freeze({
      url: 'https://www.data.go.kr/data/15059008/openapi.do',
      baseDate: '2025-01',
      license: '공공누리 제1유형',
    }),
  }),
})

const TOP_LEVEL_REGIONS: Readonly<Record<RegionPackId, readonly Region[]>> = Object.freeze({
  seoul: Object.freeze([...SEOUL_DISTRICTS]),
  gyeonggi: Object.freeze([...GYEONGGI_MUNICIPALITIES]),
})

export function getRegion(id: string): Region | undefined {
  return REGIONS_BY_ID[id]
}

export function getTopLevelRegions(packId: RegionPackId): readonly Region[] {
  return TOP_LEVEL_REGIONS[packId]
}
