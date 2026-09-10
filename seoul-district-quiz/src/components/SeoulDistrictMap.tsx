import { useState } from 'react'
import { getRegion, getTopLevelRegions } from '../data/regions'
import { RegionPackMap, type RegionAnswerResult } from './RegionPackMap'

const IDS_BY_NAME = new Map(getTopLevelRegions('seoul').map((region) => [region.name, region.id]))
const EMPTY_DISTRICTS: readonly string[] = []

/** Compatibility boundary for the existing name-based Seoul quiz and typing game. */
export function SeoulDistrictMap({
  activeDistrict, result, solvedDistricts = EMPTY_DISTRICTS, interactive = true,
  variant = 'quiz', selectedDistrict, onDistrictSelect, onReady,
}: {
  activeDistrict: string
  result: RegionAnswerResult | null
  solvedDistricts?: readonly string[]
  interactive?: boolean
  variant?: 'quiz' | 'typing' | 'collection'
  selectedDistrict?: string
  onDistrictSelect?: (district: string) => void
  onReady?: () => void
}) {
  const [internalSelectedDistrict, setInternalSelectedDistrict] = useState(activeDistrict)
  const caption = result
    ? `정답 지역: ${activeDistrict}`
    : variant === 'typing'
      ? `${solvedDistricts.length}개 자치구를 맞혔어요.`
      : variant === 'collection'
        ? `${solvedDistricts.length}개 자치구를 익혔어요. 지도를 눌러 각 지역을 확인해 보세요.`
        : '밝게 표시된 자치구를 맞혀보세요.'

  return <RegionPackMap packId="seoul" detail="overview" activeRegionId={IDS_BY_NAME.get(activeDistrict)} result={result}
    solvedRegionIds={solvedDistricts.flatMap((name) => IDS_BY_NAME.get(name) ?? [])}
    selectedRegionId={IDS_BY_NAME.get(selectedDistrict ?? internalSelectedDistrict)}
    interactive={interactive} variant={variant} caption={caption} onReady={onReady}
    onRegionSelect={(id) => {
      const region = getRegion(id)
      if (!region) return
      setInternalSelectedDistrict(region.name)
      onDistrictSelect?.(region.name)
    }} />
}
