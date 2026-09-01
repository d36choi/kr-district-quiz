import { useEffect, useId, useState } from 'react'

type AnswerResult = { correct: boolean; answer: string }
type DistrictPath = { id: string; name: string; path: string }
type LoadState =
  | { status: 'loading'; paths: DistrictPath[] }
  | { status: 'ready'; paths: DistrictPath[] }
  | { status: 'error'; paths: DistrictPath[] }

const DISTRICT_NAMES: Readonly<Record<string, string>> = {
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

const SEOUL_MAP_URL = `${import.meta.env.BASE_URL}seoul-district.svg`
let districtPathsPromise: Promise<DistrictPath[]> | null = null

function parseDistrictPaths(svgText: string) {
  const document = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) throw new Error('서울 지도 SVG를 읽지 못했어요.')

  const paths = Array.from(document.querySelectorAll('path')).flatMap((element) => {
    const id = element.id
    const name = DISTRICT_NAMES[id]
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

export function SeoulDistrictMap({ activeDistrict, result }: { activeDistrict: string; result: AnswerResult | null }) {
  const captionId = useId()
  const [selectedDistrict, setSelectedDistrict] = useState(activeDistrict)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading', paths: [] })
  const [loadAttempt, setLoadAttempt] = useState(0)

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

  const retryLoad = () => {
    districtPathsPromise = null
    setLoadState({ status: 'loading', paths: [] })
    setLoadAttempt((attempt) => attempt + 1)
  }

  const mapState = result?.correct === false ? 'incorrect' : result?.correct ? 'correct' : 'active'
  const caption = result ? `정답 지역: ${activeDistrict}` : '밝게 표시된 자치구를 맞혀보세요.'

  return (
    <figure className="map-card" aria-labelledby={captionId}>
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
        <svg className="seoul-map" viewBox="0 0 1400 1400" role="group" aria-label="서울 25개 자치구 지도">
          {loadState.paths.map((district) => {
            const isActive = district.name === activeDistrict
            const isSelected = district.name === selectedDistrict
            const className = [
              'district',
              isActive ? `district--${mapState}` : '',
              isSelected ? 'district--selected' : '',
            ].filter(Boolean).join(' ')

            return (
              <g
                key={district.id}
                className={className}
                role="button"
                tabIndex={0}
                aria-current={isActive ? 'true' : undefined}
                aria-label={`${district.name}${isActive ? ', 문제 지역' : ''}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedDistrict(district.name)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedDistrict(district.name)
                  }
                }}
              >
                <path className="district-hitarea" d={district.path} />
                <path className="district-shape" d={district.path} fillRule="evenodd" clipRule="evenodd" />
              </g>
            )
          })}
        </svg>
      ) : null}

      <figcaption id={captionId} aria-live="polite">
        <span>{caption}</span>
        <small>지도: Kurykh · CC BY-SA 3.0</small>
      </figcaption>
    </figure>
  )
}
