import { getNeighbors } from './adjacency'
import { getRegion, getTopLevelRegions, REGIONS_BY_ID } from './regions'
import type { CourseBucket, CourseQuestion, CourseQuestionType } from '../game/courseGenerator'
import { appendJosa } from '../utils/korean'

export type Question = {
  district: string
  hint: string
  mode: 'choice' | 'text'
  options?: string[]
  regionId?: string
  questionType?: CourseQuestionType
  bucket?: CourseBucket
  scored?: boolean
}

export const DISTRICT_NAME_BY_MAP_ID: Readonly<Record<string, string>> = {
  'Dobong-gu': '도봉구',
  'Dongdaemun-gu': '동대문구',
  'Dongjak-gu': '동작구',
  'Eunpyeong-gu': '은평구',
  'Gangbuk-gu': '강북구',
  'Gangdong-gu': '강동구',
  'Gangseo-gu': '강서구',
  'Geumcheon-gu': '금천구',
  'Guro-gu': '구로구',
  'Gwanak-gu': '관악구',
  'Gwangjin-gu': '광진구',
  'Gangnam-gu': '강남구',
  'Jongno-gu': '종로구',
  'Jung-gu': '중구',
  'Jungnang-gu': '중랑구',
  'Mapo-gu': '마포구',
  'Nowon-gu': '노원구',
  'Seocho-gu': '서초구',
  'Seodaemun-gu': '서대문구',
  'Seongbuk-gu': '성북구',
  'Seongdong-gu': '성동구',
  'Songpa-gu': '송파구',
  'Yangcheon-gu': '양천구',
  'Yeongdeungpo-gu_1_': '영등포구',
  'Yongsan-gu': '용산구',
}

export const ALL_DISTRICT_NAMES = Object.freeze(Object.values(DISTRICT_NAME_BY_MAP_ID))

export const CHOICE_QUESTIONS: Question[] = [
  { district: '마포구', hint: '마포구는 한강 북쪽, 서울 서쪽에 있어요.', mode: 'choice', options: ['마포구', '용산구', '영등포구', '서대문구'] },
  { district: '송파구', hint: '송파구는 한강 남쪽, 서울 동남쪽에 있어요.', mode: 'choice', options: ['강동구', '광진구', '송파구', '강남구'] },
  { district: '서초구', hint: '서초구는 한강 남쪽, 서울 남동부에 있어요.', mode: 'choice', options: ['동작구', '관악구', '강남구', '서초구'] },
  { district: '종로구', hint: '종로구는 서울 도심의 북쪽에 있어요.', mode: 'choice', options: ['종로구', '중구', '성북구', '서대문구'] },
  { district: '강서구', hint: '강서구는 한강 남쪽, 서울의 가장 서쪽에 있어요.', mode: 'choice', options: ['양천구', '구로구', '강서구', '영등포구'] },
]

export const TEXT_QUESTIONS: Question[] = [
  { district: '동대문구', hint: '동대문구는 서울 동북권의 안쪽에 있어요.', mode: 'text' },
  { district: '도봉구', hint: '도봉구는 서울의 가장 북쪽에 가까워요.', mode: 'text' },
  { district: '용산구', hint: '용산구는 한강 북쪽, 서울 중심부에 있어요.', mode: 'text' },
  { district: '관악구', hint: '관악구는 서울 남쪽, 관악산을 품고 있어요.', mode: 'text' },
  { district: '광진구', hint: '광진구는 한강 북쪽, 서울 동쪽에 있어요.', mode: 'text' },
]

export function shuffleDistricts(random = Math.random) {
  const districts = [...ALL_DISTRICT_NAMES]
  for (let index = districts.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    ;[districts[index], districts[randomIndex]] = [districts[randomIndex], districts[index]]
  }
  return districts
}

function regionChoices(regionId: string, random: () => number) {
  const region = getRegion(regionId)
  if (!region) return []
  const siblings = region.parentId === region.packId
    ? getTopLevelRegions(region.packId)
    : Object.values(REGIONS_BY_ID).filter((candidate) => candidate.parentId === region.parentId)
  const neighbors = getNeighbors(regionId)
    .flatMap((id) => getRegion(id) ?? [])
    .filter((candidate) => candidate.packId === region.packId && candidate.level === region.level)
  const choices = [region, ...neighbors, ...siblings]
  const options = [...new Map(choices.map((candidate) => [candidate.id, candidate])).values()]
    .slice(0, 4)
    .map((candidate) => candidate.name)
  for (let index = options.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    ;[options[index], options[randomIndex]] = [options[randomIndex], options[index]]
  }
  return options
}

function regionHint(regionId: string) {
  const region = getRegion(regionId)
  if (!region) return '지도에서 지역의 위치를 다시 확인해 보세요.'
  const neighborNames = getNeighbors(regionId)
    .slice(0, 2)
    .flatMap((id) => getRegion(id)?.name ?? [])
  if (neighborNames.length > 0) {
    return `${appendJosa(region.name, '은', '는')} ${appendJosa(neighborNames.join('·'), '과', '와')} 경계를 맞대고 있어요.`
  }
  const parent = getRegion(region.parentId ?? '')
  return parent
    ? `${appendJosa(region.name, '은', '는')} ${parent.name} 안에 있어요.`
    : '지도에서 지역의 위치를 다시 확인해 보세요.'
}

export function createRegionalQuestion(question: CourseQuestion, random = Math.random): Question {
  const usesText = question.questionType === 'text-recall'
  return {
    district: question.answer,
    hint: regionHint(question.regionId),
    mode: usesText ? 'text' : 'choice',
    options: usesText || question.questionType === 'map-selection' ? undefined : regionChoices(question.regionId, random),
    regionId: question.regionId,
    questionType: question.questionType,
    bucket: question.bucket,
    scored: question.scored,
  }
}
