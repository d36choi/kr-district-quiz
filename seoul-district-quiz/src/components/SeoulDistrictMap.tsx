import { useEffect, useId, useRef, useState } from 'react'
import { DISTRICT_NAME_BY_MAP_ID } from '../data/districts'

type AnswerResult = { correct: boolean; answer: string }
type DistrictPath = { id: string; name: string; path: string }
type LoadState =
  | { status: 'loading'; paths: DistrictPath[] }
  | { status: 'ready'; paths: DistrictPath[] }
  | { status: 'error'; paths: DistrictPath[] }

const SEOUL_MAP_URL = `${import.meta.env.BASE_URL}seoul-district.svg`
const EMPTY_DISTRICTS: readonly string[] = []
let districtPathsPromise: Promise<DistrictPath[]> | null = null

function parseDistrictPaths(svgText: string) {
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) throw new Error('서울 지도 SVG를 읽지 못했어요.')

  const paths = Array.from(document.querySelectorAll('path')).flatMap((element) => {
    const id = element.id
    const name = DISTRICT_NAME_BY_MAP_ID[id]
    const path = element.getAttribute('d')
    return name && path ? [{ id: id === 'Yeongdeungpo-gu_1_' ? 'Yeongdeungpo-gu' : id, name, path }] : []
  })

  if (paths.length !== 25) throw new Error('서울 25개 자치구 경계를 확인하지 못했어요.')
  return paths
}

function loadDistrictPaths() {
  districtPathsPromise ??= fetch(SEOUL_MAP_URL)
    .then((response) => {
      if (!response.ok) throw new Error('서울 지도 파일을 불러오지 못했어요.')
      return response.text()
    })
    .then(parseDistrictPaths)
  return districtPathsPromise
}

export function SeoulDistrictMap({
  activeDistrict,
  result,
  solvedDistricts = EMPTY_DISTRICTS,
  interactive = true,
  variant = 'quiz',
  selectedDistrict: controlledSelectedDistrict,
  onDistrictSelect,
  onReady,
}: {
  activeDistrict: string
  result: AnswerResult | null
  solvedDistricts?: readonly string[]
  interactive?: boolean
  variant?: 'quiz' | 'typing' | 'collection'
  selectedDistrict?: string
  onDistrictSelect?: (district: string) => void
  onReady?: () => void
}) {
  const captionId = useId()
  const [internalSelectedDistrict, setInternalSelectedDistrict] = useState(activeDistrict)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading', paths: [] })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const pathNodes = useRef(new Map<string, SVGPathElement>())
  const solvedSet = new Set(solvedDistricts)
  const selectedDistrict = controlledSelectedDistrict ?? internalSelectedDistrict

  useEffect(() => {
    let isCurrent = true
    loadDistrictPaths()
      .then((paths) => {
        if (isCurrent) setLoadState({ status: 'ready', paths })
      })
      .catch(() => {
        if (isCurrent) setLoadState({ status: 'error', paths: [] })
      })
    return () => {
      isCurrent = false
    }
  }, [loadAttempt])

  useEffect(() => {
    if (loadState.status === 'ready') onReady?.()
  }, [loadState.status, onReady])

  const retryLoad = () => {
    districtPathsPromise = null
    setLoadState({ status: 'loading', paths: [] })
    setLoadAttempt((attempt) => attempt + 1)
  }

  const selectDistrict = (district: string) => {
    setInternalSelectedDistrict(district)
    onDistrictSelect?.(district)
  }

  const mapState = result?.correct === false ? 'incorrect' : result?.correct ? 'correct' : 'active'
  const caption = result
    ? `정답 지역: ${activeDistrict}`
    : variant === 'typing'
      ? `${solvedDistricts.length}개 자치구를 맞혔어요.`
      : variant === 'collection'
        ? `${solvedDistricts.length}개 자치구를 익혔어요. 지도를 눌러 각 지역을 확인해 보세요.`
        : '밝게 표시된 자치구를 맞혀보세요.'

  return (
    <figure className={`map-card map-card--${variant}`} aria-labelledby={captionId}>
      {loadState.status === 'loading' ? (
        <div className="map-state" role="status">
          <span className="map-state__shape" aria-hidden="true" />
          <span>서울 지도를 불러오는 중이에요.</span>
        </div>
      ) : null}

      {loadState.status === 'error' ? (
        <div className="map-state" role="alert">
          <strong>지도를 표시하지 못했어요.</strong>
          <span>잠시 후 다시 시도해 주세요.</span>
          <button type="button" onClick={retryLoad}>다시 불러오기</button>
        </div>
      ) : null}

      {loadState.status === 'ready' ? (
        <div className="seoul-map-stage">
          <svg className="seoul-map" viewBox="0 0 1400 1400" role="group" aria-label="서울 25개 자치구 지도">
            {loadState.paths.map((district) => {
              const isActive = district.name === activeDistrict
              const isSolved = solvedSet.has(district.name)
              const isSelected = interactive && district.name === selectedDistrict
              const className = [
                'district',
                isActive ? `district--${mapState}` : '',
                isSolved ? 'district--solved' : '',
                isSelected ? 'district--selected' : '',
              ].filter(Boolean).join(' ')

              return (
                <g
                  key={district.id}
                  className={className}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`${district.name}${isActive ? ', 문제 지역' : isSolved ? ', 맞힌 지역' : ''}`}
                  aria-pressed={interactive ? isSelected : undefined}
                  onClick={interactive ? () => selectDistrict(district.name) : undefined}
                  onKeyDown={interactive ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectDistrict(district.name)
                    }
                  } : undefined}
                >
                  <path className="district-hitarea" d={district.path} />
                  <path
                    ref={(node) => {
                      if (node) pathNodes.current.set(district.name, node)
                      else pathNodes.current.delete(district.name)
                    }}
                    className="district-shape"
                    d={district.path}
                    fillRule="evenodd"
                    clipRule="evenodd"
                  />
                </g>
              )
            })}
          </svg>
          {variant === 'typing' && solvedDistricts.length > 0 ? (
            <div className="map-label-layer" aria-hidden="true">
              {solvedDistricts.map((district) => (
                <span
                  key={district}
                  className="district-label"
                  ref={(node) => {
                    if (!node) return
                    const path = pathNodes.current.get(district)
                    if (!path) return
                    const bounds = path.getBBox()
                    node.style.left = `${((bounds.x + bounds.width / 2) / 1400) * 100}%`
                    node.style.top = `${((bounds.y + bounds.height / 2) / 1400) * 100}%`
                  }}
                >{district}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <figcaption id={captionId} aria-live="polite">
        <span>{caption}</span>
        <small>지도: Kurykh · CC BY-SA 3.0</small>
      </figcaption>
    </figure>
  )
}
