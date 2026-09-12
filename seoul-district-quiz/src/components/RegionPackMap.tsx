import { useEffect, useId, useRef, useState } from 'react'
import type { RegionSelectionSource } from '../analytics/events'
import { DISTRICT_NAME_BY_MAP_ID } from '../data/districts'
import type { GeometryPath } from '../data/geometry'
import { getRegion, getTopLevelRegions, REGION_PACKS, REGIONS_BY_ID, type Region, type RegionPackId } from '../data/regions'

export type RegionMapDetail = 'overview' | { parentRegionId: string }
export type RegionAnswerResult = { correct: boolean; answer: string }

type MapData = {
  viewBox: string
  paths: readonly GeometryPath[]
  attribution: string
}

export type RegionPackMapProps = {
  packId: RegionPackId
  detail?: RegionMapDetail
  activeRegionId?: string
  selectedRegionId?: string
  solvedRegionIds?: readonly string[]
  adjacentRegionIds?: readonly string[]
  result?: RegionAnswerResult | null
  interactive?: boolean
  onRegionSelect?: (regionId: string, source: RegionSelectionSource) => void
  onMapLoadFailed?: (packId: RegionPackId) => void
  onReady?: () => void
  variant?: 'quiz' | 'typing' | 'collection' | 'picker' | 'silhouette'
  /** Picker supplies its own always-visible search/list. */
  showRegionList?: boolean
  /** Preserves existing Seoul quiz instructions without revealing its answer. */
  caption?: string
}

const EMPTY_IDS: readonly string[] = []
const SEOUL_BY_NAME = new Map(getTopLevelRegions('seoul').map((region) => [region.name, region]))
const DETAILED_PARENTS = new Set(Object.values(REGIONS_BY_ID).filter((region) => region.packId === 'gyeonggi' && region.level === 'district').map((region) => region.parentId))
let seoulMapPromise: Promise<MapData> | undefined

async function loadSeoulMap(): Promise<MapData> {
  const response = await fetch(`${import.meta.env.BASE_URL}seoul-district.svg`)
  if (!response.ok) throw new Error('서울 지도 파일을 불러오지 못했어요.')
  const document = new DOMParser().parseFromString(await response.text(), 'image/svg+xml')
  const viewBox = document.documentElement.getAttribute('viewBox')
  if (document.querySelector('parsererror') || !viewBox) throw new Error('서울 지도를 읽지 못했어요.')
  const paths = Array.from(document.querySelectorAll('path')).flatMap((element) => {
    const name = DISTRICT_NAME_BY_MAP_ID[element.id]
    const region = SEOUL_BY_NAME.get(name)
    const path = element.getAttribute('d')
    return region && path ? [{ geometryId: region.geometryId, regionId: region.id, name, level: region.level, path }] : []
  })
  if (new Set(paths.map(({ regionId }) => regionId)).size !== 25 || paths.length !== 25) {
    throw new Error('서울 25개 자치구 경계를 확인하지 못했어요.')
  }
  return { paths, viewBox, attribution: '지도: Kurykh · CC BY-SA 3.0' }
}

async function loadMap(packId: RegionPackId, isDetail: boolean): Promise<MapData> {
  if (packId === 'seoul') {
    seoulMapPromise ??= loadSeoulMap().catch((error) => {
      seoulMapPromise = undefined
      throw error
    })
    return seoulMapPromise
  }
  const { loadGeometry } = await import('../data/geometry')
  const manifest = await loadGeometry(packId, isDetail)
  return { ...manifest, attribution: `지도: 국가데이터처 SGIS · ${manifest.source.baseDate} 기준` }
}

function regionNames(ids: readonly string[]) {
  return [...new Set(ids)].flatMap((id) => getRegion(id)?.name ?? []).join(', ')
}

function normalizedSearch(value: string) {
  return value.normalize('NFC').replace(/\s+/gu, '').toLocaleLowerCase('ko-KR')
}

export function RegionNameList({ regions, selectedRegionId, onRegionSelect, showCourseBadges = false }: {
  regions: readonly Region[]
  selectedRegionId?: string
  onRegionSelect: (regionId: string, source: RegionSelectionSource) => void
  showCourseBadges?: boolean
}) {
  const inputId = useId()
  const [search, setSearch] = useState('')
  const query = normalizedSearch(search)
  const filtered = regions.filter((region) => [region.name, ...region.aliases].some((name) => normalizedSearch(name).includes(query)))

  return <div className="region-name-list">
    <label htmlFor={inputId}>지역명 검색</label>
    <input id={inputId} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="지역 이름을 입력해 주세요" autoComplete="off" />
    <p className="region-name-list__count" aria-live="polite">{filtered.length}개 지역</p>
    {filtered.length === 0 ? <p className="region-name-list__empty">검색한 지역이 없어요. 다른 이름을 입력해 주세요.</p> : null}
    <ul aria-label="지역 목록">
      {filtered.map((region) => <li key={region.id}>
        <button type="button" className="region-list-button" aria-pressed={region.id === selectedRegionId} onClick={() => onRegionSelect(region.id, query ? 'search' : 'list')}>
          <span>{region.name}</span>
          {showCourseBadges && DETAILED_PARENTS.has(region.id) ? <span className="region-course-badge">세부 코스</span> : null}
          {region.id === selectedRegionId ? <span className="region-list-button__selected">선택됨</span> : null}
        </button>
      </li>)}
    </ul>
  </div>
}

export function RegionPackMap(props: RegionPackMapProps) {
  const parentRegionId = props.detail && props.detail !== 'overview' ? props.detail.parentRegionId : undefined
  // A new scope gets a new loader and selection immediately, with no stale SVG frame.
  return <ScopedRegionMap key={`${props.packId}:${parentRegionId ?? 'overview'}`} {...props} parentRegionId={parentRegionId} />
}

function ScopedRegionMap(props: RegionPackMapProps & { parentRegionId?: string }) {
  const {
    packId, parentRegionId, activeRegionId, selectedRegionId: controlledSelection,
    solvedRegionIds = EMPTY_IDS, adjacentRegionIds = EMPTY_IDS, result,
    interactive = true, onRegionSelect, onMapLoadFailed, onReady, variant = 'quiz', showRegionList = true, caption: customCaption,
  } = props
  const captionId = useId()
  const [internalSelection, setInternalSelection] = useState<string>()
  const [loadState, setLoadState] = useState<{ status: 'loading' | 'error'; data?: never } | { status: 'ready'; data: MapData }>({ status: 'loading' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [listOpen, setListOpen] = useState(false)
  const pathNodes = useRef(new Map<string, SVGPathElement>())
  const onMapLoadFailedRef = useRef(onMapLoadFailed)
  // An explicitly undefined controlled value means the parent cleared selection.
  const isSelectionControlled = Object.prototype.hasOwnProperty.call(props, 'selectedRegionId')
  const selectedRegionId = isSelectionControlled ? controlledSelection : internalSelection
  const solvedSet = new Set(solvedRegionIds)
  const adjacentSet = new Set(adjacentRegionIds)
  const parent = parentRegionId ? getRegion(parentRegionId) : undefined
  const regions = parentRegionId
    ? Object.values(REGIONS_BY_ID).filter((region) => packId === 'gyeonggi' && region.packId === packId && region.parentId === parentRegionId && region.level === 'district')
    : getTopLevelRegions(packId)
  const regionIds = new Set(regions.map((region) => region.id))
  const mapLabel = parentRegionId ? `${parent?.name ?? '지역'} 세부 구 지도` : packId === 'seoul' ? '서울 25개 자치구 지도' : '경기 31개 시·군 지도'

  useEffect(() => {
    onMapLoadFailedRef.current = onMapLoadFailed
  }, [onMapLoadFailed])

  useEffect(() => {
    let current = true
    loadMap(packId, Boolean(parentRegionId))
      .then((data) => { if (current) setLoadState({ status: 'ready', data }) })
      .catch(() => {
        if (!current) return
        setLoadState({ status: 'error' })
        onMapLoadFailedRef.current?.(packId)
      })
    return () => { current = false }
  }, [packId, parentRegionId, loadAttempt])

  useEffect(() => {
    if (loadState.status === 'ready') onReady?.()
  }, [loadState.status, onReady])

  const selectRegion = (id: string, source: RegionSelectionSource) => {
    if (!isSelectionControlled) setInternalSelection(id)
    onRegionSelect?.(id, source)
  }
  const retry = () => {
    if (packId === 'seoul') seoulMapPromise = undefined
    setLoadState({ status: 'loading' })
    setLoadAttempt((attempt) => attempt + 1)
  }
  const caption = customCaption ?? [
    result ? `${result.correct ? '정답' : '오답'}이에요. 정답 지역: ${getRegion(activeRegionId ?? '')?.name ?? result.answer}.` : activeRegionId ? '문제 지역이 강조되어 있어요.' : '지도나 목록에서 지역을 선택해 보세요.',
    selectedRegionId ? `선택한 지역: ${regionNames([selectedRegionId])}.` : '',
    solvedRegionIds.length > 0 ? `맞힌 지역: ${regionNames(solvedRegionIds)}.` : '',
    adjacentRegionIds.length > 0 ? `인접 지역: ${regionNames(adjacentRegionIds)}.` : '',
  ].filter(Boolean).join(' ')
  const paths = loadState.status === 'ready' ? loadState.data.paths.filter((path) => regionIds.has(path.regionId)) : []
  const resultState = result ? result.correct ? 'correct' : 'incorrect' : 'active'

  return <figure className={`map-card region-pack-map map-card--${variant}`} aria-labelledby={captionId}>
    {loadState.status === 'loading' ? <div className="map-state" role="status">
      <span className="map-state__shape" aria-hidden="true" />
      <span>{REGION_PACKS[packId].name} 지도를 불러오는 중이에요.</span>
    </div> : null}
    {loadState.status === 'error' ? <div className="map-state" role="alert">
      <strong>지도를 표시하지 못했어요.</strong>
      <span>지역 목록에서 선택하거나 지도를 다시 불러와 주세요.</span>
      <button type="button" onClick={retry}>다시 불러오기</button>
    </div> : null}
    {loadState.status === 'ready' && paths.length === 0 ? <p role="status">이 지역의 세부 구 지도가 없어요.</p> : null}
    {loadState.status === 'ready' && paths.length > 0 ? <div className="seoul-map-stage">
      <svg className="seoul-map region-pack-map__svg" viewBox={loadState.data.viewBox} role="group" aria-label={mapLabel} ref={(node) => {
        if (!node) return
        const focusNode = variant === 'silhouette' && activeRegionId
          ? node.querySelector<SVGPathElement>(`[data-region-id="${activeRegionId}"] .district-shape`)
          : parentRegionId
            ? node.querySelector<SVGGElement>('.region-boundaries')
            : null
        if (!focusNode?.getBBox) return
        const bounds = focusNode.getBBox()
        const padding = Math.max(bounds.width, bounds.height) * 0.08
        node.setAttribute('viewBox', `${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`)
      }}>
        <g className="region-boundaries">
          {paths.map((region) => {
            const isActive = region.regionId === activeRegionId
            const isSelected = interactive && region.regionId === selectedRegionId
            const isSolved = solvedSet.has(region.regionId)
            const isAdjacent = adjacentSet.has(region.regionId)
            const stateNames = [isActive ? '문제 지역' : '', isSolved ? '맞힌 지역' : '', isAdjacent ? '인접 지역' : '', isSelected ? '선택됨' : ''].filter(Boolean)
            return <g key={region.regionId} data-region-id={region.regionId}
              className={['district', isAdjacent ? 'district--adjacent' : '', isSolved && !isActive ? 'district--solved' : '', isActive ? `district--${resultState}` : '', isSelected ? 'district--selected' : ''].filter(Boolean).join(' ')}
              role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
              aria-current={isActive ? 'true' : undefined} aria-label={[region.name, ...stateNames].join(', ')} aria-pressed={interactive ? isSelected : undefined}
              onClick={interactive ? () => selectRegion(region.regionId, 'map') : undefined}
              onKeyDown={interactive ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  selectRegion(region.regionId, 'map')
                }
              } : undefined}>
              <path className="district-hitarea" d={region.path} />
              <path className="district-shape" d={region.path} fillRule="evenodd" clipRule="evenodd" ref={(node) => {
                if (node) pathNodes.current.set(region.regionId, node)
                else pathNodes.current.delete(region.regionId)
              }} />
            </g>
          })}
        </g>
      </svg>
      {variant === 'typing' && solvedRegionIds.length > 0 ? <div className="map-label-layer" aria-hidden="true">
        {regions.filter((region) => solvedSet.has(region.id)).map((region) => <span key={region.id} className="district-label" ref={(node) => {
          const path = pathNodes.current.get(region.id)
          if (!node || !path?.getBBox) return
          const bounds = path.getBBox()
          const [x, y, width, height] = loadState.data.viewBox.split(/\s+/u).map(Number)
          node.style.left = `${((bounds.x + bounds.width / 2 - x) / width) * 100}%`
          node.style.top = `${((bounds.y + bounds.height / 2 - y) / height) * 100}%`
        }}>{region.name}</span>)}
      </div> : null}
    </div> : null}
    <figcaption id={captionId} aria-live="polite">
      <span>{caption}</span>
      {loadState.status === 'ready' ? <small>{loadState.data.attribution}</small> : null}
    </figcaption>
    {interactive && showRegionList ? <details className="region-list-fallback" open={listOpen || loadState.status !== 'ready'} onToggle={(event) => {
      if (loadState.status === 'ready') setListOpen(event.currentTarget.open)
    }}>
      <summary>지역 목록에서 선택</summary>
      <RegionNameList regions={regions} selectedRegionId={selectedRegionId} onRegionSelect={selectRegion} />
    </details> : null}
  </figure>
}
