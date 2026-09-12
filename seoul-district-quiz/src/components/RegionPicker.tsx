import { useId, useRef } from 'react'
import type { RegionSelectionSource } from '../analytics/events'
import { getRegion, getTopLevelRegions, REGION_PACKS, REGIONS_BY_ID, type RegionPackId } from '../data/regions'
import { RegionNameList, RegionPackMap } from './RegionPackMap'

const PACK_IDS: readonly RegionPackId[] = ['seoul', 'gyeonggi']

export function RegionPicker({ selectedPackId, selectedRegionId, onPackChange, onRegionSelect, onMapLoadFailed, onStart }: {
  selectedPackId: RegionPackId
  selectedRegionId?: string
  onPackChange: (packId: RegionPackId) => void
  onRegionSelect: (regionId: string, source: RegionSelectionSource) => void
  onMapLoadFailed?: (packId: RegionPackId) => void
  onStart: (regionId: string) => void
}) {
  const id = useId()
  const tabNodes = useRef(new Map<RegionPackId, HTMLButtonElement>())
  const candidate = getRegion(selectedRegionId ?? '')
  const selected = candidate?.packId === selectedPackId && candidate.parentId === selectedPackId ? candidate : undefined
  const children = selected ? Object.values(REGIONS_BY_ID).filter((region) => region.parentId === selected.id) : []

  return <section className="region-picker" aria-label="지역 선택">
    <div className="region-pack-tabs" role="tablist" aria-label="학습 지역">
      {PACK_IDS.map((packId) => <button key={packId} type="button" role="tab" id={`${id}-${packId}-tab`} aria-controls={`${id}-panel`}
        aria-selected={selectedPackId === packId} tabIndex={selectedPackId === packId ? 0 : -1}
        ref={(node) => { if (node) tabNodes.current.set(packId, node); else tabNodes.current.delete(packId) }}
        onClick={() => onPackChange(packId)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 'seoul' : event.key === 'End' ? 'gyeonggi' : packId === 'seoul' ? 'gyeonggi' : 'seoul'
          onPackChange(next)
          tabNodes.current.get(next)?.focus()
        }}>{REGION_PACKS[packId].name}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${selectedPackId}-tab`}>
      <RegionPackMap packId={selectedPackId} detail="overview" variant="picker" selectedRegionId={selected?.id} onRegionSelect={onRegionSelect} onMapLoadFailed={onMapLoadFailed} showRegionList={false} interactive />
      <RegionNameList key={selectedPackId} regions={getTopLevelRegions(selectedPackId)} selectedRegionId={selected?.id} onRegionSelect={onRegionSelect} showCourseBadges />
    </div>
    <div className="region-picker__action">
      <div aria-live="polite" className="region-picker__selection">
        {selected ? <>
          <strong>{selected.name}</strong>
          <p>{children.length > 0 ? `${children.map((region) => region.name).join('·')}와 인접 지역을 함께 익혀요.` : '위치와 인접 지역을 함께 익혀요.'}</p>
        </> : <p>어느 지역부터 익혀볼까요?</p>}
      </div>
      <button type="button" className="primary-button" disabled={!selected} onClick={() => { if (selected) onStart(selected.id) }}>
        {selected ? `${selected.name} 5문제 시작` : '지역을 선택해 주세요'}
      </button>
    </div>
  </section>
}
