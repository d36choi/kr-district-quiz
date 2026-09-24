import { SafeAreaInsets } from '@apps-in-toss/web-framework'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Check, CheckCircle2, Clock3, Flame, Heart, Keyboard, ListChecks, MapPin, PenLine, Timer, Trophy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import './App.css'
import { RegionPackMap } from './components/RegionPackMap'
import { RegionPicker } from './components/RegionPicker'
import { GuidedMapQuestion } from './components/GuidedMapQuestion'
import { SeoulDistrictMap } from './components/SeoulDistrictMap'
import {
  trackAnswerSubmitted,
  trackCourseCompleted,
  trackCourseStarted,
  trackMapLoadFailed,
  trackRegionPackViewed,
  trackRegionSelected,
  trackReviewPromptShown,
  trackReviewCorrectionCompleted,
  trackReviewSessionCompleted,
  triggerAnswerHaptic,
  type RegionSelectionSource,
} from './analytics/events'
import { ALL_DISTRICT_NAMES, CHOICE_QUESTIONS, TEXT_QUESTIONS, createRegionalQuestion, shuffleDistricts, type Question } from './data/districts'
import { REGION_MAP_ASSET_VERSIONS } from './data/mapAssets'
import { getRegion, getTopLevelRegions, REGIONS_BY_ID, type RegionPackId } from './data/regions'
import { buildConfirmationQuestions, buildCourse, buildDueReviewCourse, buildWeakReviewCourse, getWeakRegions, type CoursePlan, type CourseQuestion } from './game/courseGenerator'
import { replayCopy } from './game/replayCopy'
import {
  recordAnswer,
  recordCompletedSet,
  recordMasteredDistrict,
  type AnswerMode,
  type PersonalRecordsV2,
  type SessionKind,
} from './game/personalRecords'
import { isReviewDue, type ProgressStage } from './game/progress'
import { useLearningProgress } from './hooks/useLearningProgress'
import { useCompletionCelebration } from './hooks/useCompletionCelebration'
import { appendJosa } from './utils/korean'

gsap.registerPlugin(useGSAP)

type Screen = 'home' | 'region-picker' | 'collection' | 'records' | 'mode' | 'course' | 'complete' | 'typing' | 'typing-complete'
type GameMode = AnswerMode | 'all-typing'
type AnswerResult = { correct: boolean; answer: string }
type SafeInsets = { top: number; bottom: number; left: number; right: number }
type RegionalSession = {
  plan: CoursePlan
  sessionId: string
  startingStage: ProgressStage
  wrongQuestions: CourseQuestion[]
  confirmationAdded: boolean
  origin: 'browse' | 'due-review' | 'weak-review'
  stageUpCount: number
  attemptsByRegion: Record<string, number>
}

const STAGE_LABELS: readonly string[] = ['처음 봄', '익히는 중', '익숙해지는 중', '익숙함', '잘 알고 있음']
const REGION_ID_BY_PACK_AND_NAME = new Map(
  Object.values(REGIONS_BY_ID).map((region) => [`${region.packId}:${region.name}`, region.id]),
)

const QUESTIONS_BY_MODE: Record<AnswerMode, Question[]> = {
  choice: CHOICE_QUESTIONS,
  text: TEXT_QUESTIONS,
}

const TRAILING_GU = /구$/u
const WHITESPACE = /\s/gu

function normalizeDistrict(value: string) {
  return value.trim().replace(WHITESPACE, '').replace(TRAILING_GU, '')
}

function formatDuration(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(1)}초`
}

function formatRaceDuration(milliseconds: number) {
  const totalSeconds = milliseconds / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0')
  return minutes > 0 ? `${minutes}:${seconds}` : `${totalSeconds.toFixed(1)}초`
}

function useSafeArea() {
  const [insets, setInsets] = useState<SafeInsets>(() => {
    try {
      return SafeAreaInsets.get()
    } catch {
      return { top: 0, bottom: 0, left: 0, right: 0 }
    }
  })

  useEffect(() => {
    try {
      return SafeAreaInsets.subscribe({ onEvent: setInsets })
    } catch {
      return undefined
    }
  }, [])

  return insets
}

function ModeSelectionScreen({ onSelect, onBack }: { onSelect: (mode: GameMode) => void; onBack: () => void }) {
  return (
    <main className="canvas mode-screen">
      <section className="mode-heading">
        <span className="eyebrow">게임 모드</span>
        <h1>어떻게 맞혀볼까요?</h1>
        <p>가볍게 5문제를 풀거나 서울 25개 구에 도전해 보세요.</p>
      </section>

      <section className="mode-grid" aria-label="게임 모드 선택">
        <button className="mode-card" type="button" onClick={() => onSelect('choice')}>
          <span className="mode-card__icon mode-card__icon--choice icon-box" aria-hidden="true"><ListChecks size={25} strokeWidth={2.2} /></span>
          <span className="mode-card__copy"><strong>객관식</strong><span>보기 4개 중 정답을 골라요.</span></span>
          <span className="mode-card__meta">입문 · 5문제</span>
        </button>
        <button className="mode-card" type="button" onClick={() => onSelect('text')}>
          <span className="mode-card__icon mode-card__icon--text icon-box" aria-hidden="true"><PenLine size={25} strokeWidth={2.2} /></span>
          <span className="mode-card__copy"><strong>주관식</strong><span>떠오른 자치구 이름을 직접 써요.</span></span>
          <span className="mode-card__meta">도전 · 5문제</span>
        </button>
        <button className="mode-card mode-card--typing" type="button" onClick={() => onSelect('all-typing')}>
          <span className="mode-card__icon mode-card__icon--typing icon-box" aria-hidden="true"><Keyboard size={25} strokeWidth={2.2} /></span>
          <span className="mode-card__copy"><strong>서울 25구 타자 도전</strong><span>지도에 표시되는 25개 자치구를 빠르게 입력해요.</span></span>
          <span className="mode-card__meta">기록 도전 · 25개 구</span>
        </button>
      </section>

      <div className="bottom-action mode-back-action">
        <button className="secondary-button" type="button" onClick={onBack}>홈으로 돌아가기</button>
      </div>
    </main>
  )
}

function AllDistrictsTypingScreen({
  districts, onMapLoadFailed,
  onDistrictSolved,
  onComplete,
}: {
  districts: string[]
  onMapLoadFailed: (packId: RegionPackId) => void
  onDistrictSolved: (district: string) => void
  onComplete: (elapsedMs: number) => void
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [solvedDistricts, setSolvedDistricts] = useState<string[]>([])
  const [lastSolved, setLastSolved] = useState('')
  const [isReady, setIsReady] = useState(false)
  const startedAt = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isComposing = useRef(false)
  const isFinished = useRef(false)
  const currentDistrict = districts[currentIndex]

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (startedAt.current !== null && !isFinished.current) {
        setElapsedMs(performance.now() - startedAt.current)
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [])

  const handleMapReady = useCallback(() => {
    if (startedAt.current !== null) return
    startedAt.current = performance.now()
    setIsReady(true)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const checkAnswer = (value: string) => {
    if (isFinished.current || value !== currentDistrict) return

    const nextSolved = [...solvedDistricts, currentDistrict]
    const duration = startedAt.current === null ? 0 : performance.now() - startedAt.current
    setSolvedDistricts(nextSolved)
    setLastSolved(currentDistrict)
    setAnswer('')
    setElapsedMs(duration)
    onDistrictSolved(currentDistrict)

    if (currentIndex + 1 >= districts.length) {
      isFinished.current = true
      onComplete(duration)
      return
    }

    setCurrentIndex((index) => index + 1)
  }

  return (
    <main className="canvas typing-screen">
      <section className="typing-status" aria-label="서울 25구 타자 진행 상황">
        <div>
          <span className="typing-status__label">맞힌 자치구</span>
          <strong>{solvedDistricts.length}<small> / {districts.length}</small></strong>
        </div>
        <div className="typing-timer" aria-label={`경과 시간 ${formatRaceDuration(elapsedMs)}`}>
          <Timer size={19} strokeWidth={2.3} aria-hidden="true" />
          <strong>{formatRaceDuration(elapsedMs)}</strong>
        </div>
      </section>

      <div className="typing-progress" role="progressbar" aria-label={`${solvedDistricts.length} / ${districts.length} 자치구 완료`} aria-valuemin={0} aria-valuemax={districts.length} aria-valuenow={solvedDistricts.length}>
        <span style={{ width: `${(solvedDistricts.length / districts.length) * 100}%` }} />
      </div>

      <section className="typing-heading">
        <span className="eyebrow">서울 25구 타자</span>
        <h1>지도에 표시된<br />자치구를 입력해 주세요</h1>
      </section>

      <SeoulDistrictMap activeDistrict={currentDistrict} result={null} solvedDistricts={solvedDistricts} interactive={false} variant="typing" onMapLoadFailed={onMapLoadFailed} onReady={handleMapReady} />

      <section className="typing-answer-stage">
        <label htmlFor="all-district-answer">자치구 이름</label>
        <div className="typing-input-shell">
          <Keyboard size={27} strokeWidth={2.2} aria-hidden="true" />
          <input
            ref={inputRef}
            id="all-district-answer"
            value={answer}
            autoComplete="off"
            disabled={!isReady}
            maxLength={5}
            placeholder={isReady ? '자치구 이름 입력' : '지도 준비 중'}
            onCompositionStart={() => { isComposing.current = true }}
            onCompositionEnd={(event) => {
              isComposing.current = false
              checkAnswer(event.currentTarget.value)
            }}
            onChange={(event) => {
              const value = event.target.value
              setAnswer(value)
              if (!isComposing.current) checkAnswer(value)
            }}
          />
        </div>
        <p>‘구’까지 정확히 입력하면 자동으로 다음 지역이 나와요.</p>
        <span className="typing-last-solved" aria-live="polite">{lastSolved ? `${lastSolved} 정답` : '지도를 보고 입력해 주세요.'}</span>
      </section>
    </main>
  )
}

function AllDistrictsCompleteScreen({ elapsedMs, onRestart, onChangeMode }: { elapsedMs: number; onRestart: () => void; onChangeMode: () => void }) {
  const completionScope = useCompletionCelebration()

  return (
    <main ref={completionScope} className="canvas complete-screen typing-complete-screen">
      <section className="completion-hero">
        <span className="completion-illustration" aria-hidden="true" />
        <span className="eyebrow">서울 25구 완주</span>
        <h1>25개 구를<br />모두 맞혔어요</h1>
        <p>25개 자치구를 모두 맞힌 기록이에요.</p>
      </section>
      <section className="typing-record completion-reveal" aria-label={`서울 25구 타자 완주 기록 ${formatRaceDuration(elapsedMs)}`}>
        <span>완주 기록</span>
        <strong aria-hidden="true" data-counter-to={elapsedMs / 1000} data-counter-decimals="1" data-counter-suffix="초">{formatRaceDuration(elapsedMs)}</strong>
        <small>구당 평균 {formatDuration(elapsedMs / 25)}</small>
      </section>
      <div className="bottom-action bottom-action--stacked">
        <button className="primary-button" type="button" onClick={onRestart}>25개 구 다시 도전</button>
        <button className="text-button" type="button" onClick={onChangeMode}>다른 모드 선택</button>
      </div>
    </main>
  )
}

function getDueRegionIds(records: PersonalRecordsV2, now = new Date()) {
  return Object.values(records.progressByRegion)
    .filter((progress) => isReviewDue(progress, now))
    .toSorted((left, right) => Date.parse(left.nextReviewAt ?? '') - Date.parse(right.nextReviewAt ?? ''))
    .map((progress) => progress.regionId)
}

function getRecentProgress(records: PersonalRecordsV2) {
  return Object.values(records.progressByRegion)
    .filter((progress) => progress.lastAnsweredAt !== null)
    .toSorted((left, right) => Date.parse(right.lastAnsweredAt ?? '') - Date.parse(left.lastAnsweredAt ?? ''))[0]
}

function HomeScreen({
  records, dailyStreak, loadStatus, recentTargetRegionId, onStartReview, onStartWeakReview, onBrowse, onOpenCollection, onOpenRecords,
}: {
  records: PersonalRecordsV2
  dailyStreak: number
  loadStatus: 'loading' | 'ready' | 'error'
  recentTargetRegionId?: string
  onStartReview: () => void
  onStartWeakReview: () => void
  onBrowse: () => void
  onOpenCollection: () => void
  onOpenRecords: () => void
}) {
  const scope = useRef<HTMLElement>(null)
  const dueRegionIds = getDueRegionIds(records)
  const weakRegions = getWeakRegions(records.progressByRegion)
  const recentProgress = records.progressByRegion[recentTargetRegionId ?? ''] ?? getRecentProgress(records)
  const recentRegion = getRegion(recentProgress?.regionId ?? '')
  const learnedByPack = new Map<RegionPackId, number>([['seoul', 0], ['gyeonggi', 0]])
  for (const progress of Object.values(records.progressByRegion)) {
    const region = getRegion(progress.regionId)
    if (progress.stage > 0 && region && region.parentId === region.packId) {
      learnedByPack.set(region.packId, (learnedByPack.get(region.packId) ?? 0) + 1)
    }
  }
  const recordSummary = loadStatus === 'loading'
    ? '기록을 불러오는 중이에요.'
    : loadStatus === 'error'
      ? '저장된 기록을 다시 확인해 주세요.'
      : dailyStreak > 0
        ? `${dailyStreak}일째 학습을 이어가고 있어요.`
        : records.bestCombo > 0
          ? `개인 최고는 ${records.bestCombo}문제 연속 정답이에요.`
          : '첫 완벽 세트 기록을 만들어 보세요.'
  const recordValue = loadStatus === 'loading'
    ? '확인 중'
    : loadStatus === 'error'
      ? '재시도 필요'
      : `최고 ${records.bestCombo}문제`
  const masteredCount = records.masteredDistricts.length

  useGSAP(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    timeline
      .from('.home-copy > *', { y: 22, opacity: 0, duration: 0.52, stagger: 0.07 })
      .from('.home-map-visual', { scale: 0.84, rotate: -6, opacity: 0, duration: 0.72 }, '-=0.35')
      .from('.home-bento > *', { y: 18, opacity: 0, duration: 0.42, stagger: 0.08 }, '-=0.3')
      .from('.home-action', { y: 14, opacity: 0, duration: 0.38 }, '-=0.2')

  }, { scope })

  return (
    <main ref={scope} className="canvas home-screen">
      <section className="home-hero">
        <div className="home-copy">
          <p className="home-kicker">매일 1~2분, 지도 한 바퀴</p>
          <h1 className="max-w-full">한국 지역 이름 맞추기</h1>
          <p className="home-description">관심 지역과 주변 지역을<br />다섯 문제로 익혀보세요.</p>
        </div>
        <div className="home-map-visual" aria-hidden="true">
          <span className="home-map-visual__illustration" />
          <span className="home-map-visual__accent" />
        </div>
      </section>

      <section className="daily-review-card" aria-label="오늘의 복습">
        <div className="daily-review-card__copy">
          <span>오늘 다시 볼 지역</span>
          <strong>{dueRegionIds.length > 0 ? `복습할 지역 ${dueRegionIds.length}개` : '오늘 복습 완료'}</strong>
          <p>{recentRegion && recentProgress
            ? `최근 학습 · ${recentRegion.name} · ${STAGE_LABELS[recentProgress.stage]}`
            : '아직 학습한 지역이 없어요. 첫 지역을 골라보세요.'}</p>
        </div>
        <span className="daily-review-card__illustration" aria-hidden="true" />
      </section>

      {loadStatus === 'ready' && weakRegions.length > 0 ? <section className="review-region-card" aria-label={replayCopy.weakTitle}>
        <h2>{replayCopy.weakTitle}</h2>
        <p>{weakRegions.slice(0, 3).map((progress) => getRegion(progress.regionId)?.name).join(' · ')}</p>
        <p>{replayCopy.weakDescription}</p>
        <button className="secondary-button" type="button" onClick={onStartWeakReview}>{replayCopy.weakAction}</button>
      </section> : null}

      <section className="pack-progress-grid" aria-label="서울 경기 학습 현황">
        {(['seoul', 'gyeonggi'] as const).map((packId) => {
          const total = getTopLevelRegions(packId).length
          const learned = learnedByPack.get(packId) ?? 0
          return <article className="pack-progress-card" key={packId}>
            <span>{packId === 'seoul' ? '서울 25구' : '경기 31시·군'}</span>
            <strong>{learned}<small> / {total}</small></strong>
            <div role="progressbar" aria-label={`${packId === 'seoul' ? '서울' : '경기'} 학습 ${learned} / ${total}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={learned}>
              <span style={{ width: `${(learned / total) * 100}%` }} />
            </div>
          </article>
        })}
      </section>

      <section className="home-bento" aria-label="학습 현황">
        <button className="collection-entry-card" type="button" onClick={onOpenCollection}>
          <span className="collection-entry-card__illustration" aria-hidden="true" />
          <span className="collection-entry-card__copy">
            <span>서울 도장깨기</span>
            <strong>{loadStatus === 'ready' ? `${masteredCount}개 자치구를 익혔어요` : '학습 지도를 확인해 보세요'}</strong>
          </span>
          <span className="collection-entry-card__value">{loadStatus === 'ready' ? `${masteredCount} / ${ALL_DISTRICT_NAMES.length}` : '— / 25'}</span>
          <span className="collection-entry-card__progress" aria-hidden="true"><span style={{ width: `${(masteredCount / ALL_DISTRICT_NAMES.length) * 100}%` }} /></span>
        </button>
        <button className="record-entry-card" type="button" onClick={onOpenRecords}>
          <span className="record-entry-card__icon icon-box" aria-hidden="true"><Trophy size={24} strokeWidth={2.2} /></span>
          <span className="record-entry-card__copy"><strong>내 기록</strong><span>{recordSummary}</span></span>
          <span className="record-entry-card__value">{recordValue}</span>
        </button>
      </section>

      <div className="bottom-action bottom-action--stacked home-action">
        <button className="primary-button" type="button" onClick={onBrowse}>새 지역 찾아보기</button>
        {dueRegionIds.length > 0 ? <button className="secondary-button" type="button" onClick={onStartReview}>오늘의 복습 시작</button> : null}
        <p>약 1~2분이면 끝나요</p>
      </div>
    </main>
  )
}

function getCollectionMilestone(masteredCount: number) {
  if (masteredCount === ALL_DISTRICT_NAMES.length) return '서울 25개 자치구를 모두 익혔어요.'
  if (masteredCount >= 20) return '완주까지 얼마 남지 않았어요.'
  if (masteredCount >= 10) return '서울 지도의 절반에 가까워지고 있어요.'
  if (masteredCount > 0) return '정답을 맞힐 때마다 지도가 채워져요.'
  return '첫 정답부터 서울 지도가 채워져요.'
}

function DistrictCollectionScreen({
  records,
  loadStatus,
  onMapLoadFailed,
  onRetry,
  onStart,
  onBack,
}: {
  records: PersonalRecordsV2
  loadStatus: 'loading' | 'ready' | 'error'
  onMapLoadFailed: (packId: RegionPackId) => void
  onRetry: () => void
  onStart: () => void
  onBack: () => void
}) {
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const masteredCount = records.masteredDistricts.length
  const isSelectedMastered = records.masteredDistricts.includes(selectedDistrict)

  return (
    <main className="canvas collection-screen">
      <section className="collection-heading">
        <span className="eyebrow">서울 도장깨기</span>
        <h1>내가 익힌 서울</h1>
        <p>정답을 맞힌 자치구가 지도에 하나씩 채워져요.</p>
      </section>

      {loadStatus === 'loading' ? (
        <section className="records-state" role="status" aria-live="polite">
          <span className="records-state__pulse" aria-hidden="true" />
          <strong>학습 지도를 불러오는 중이에요.</strong>
        </section>
      ) : null}

      {loadStatus === 'error' ? (
        <section className="records-state records-state--error" role="alert">
          <strong>학습 기록을 불러오지 못했어요.</strong>
          <p>퀴즈는 계속 풀 수 있어요. 기록을 다시 불러오려면 아래 버튼을 눌러 주세요.</p>
          <button className="secondary-button" type="button" onClick={onRetry}>다시 불러오기</button>
        </section>
      ) : null}

      {loadStatus === 'ready' ? (
        <>
          <section className="collection-summary" aria-label={`서울 자치구 학습 진행도 ${masteredCount} / ${ALL_DISTRICT_NAMES.length}`}>
            <div>
              <span>익힌 자치구</span>
              <strong>{masteredCount}<small> / {ALL_DISTRICT_NAMES.length}</small></strong>
            </div>
            <p>{getCollectionMilestone(masteredCount)}</p>
            <div className="collection-progress" role="progressbar" aria-valuemin={0} aria-valuemax={ALL_DISTRICT_NAMES.length} aria-valuenow={masteredCount}>
              <span style={{ width: `${(masteredCount / ALL_DISTRICT_NAMES.length) * 100}%` }} />
            </div>
          </section>

          <SeoulDistrictMap
            activeDistrict=""
            result={null}
            solvedDistricts={records.masteredDistricts}
            selectedDistrict={selectedDistrict}
            variant="collection"
            onDistrictSelect={setSelectedDistrict}
            onMapLoadFailed={onMapLoadFailed}
          />

          <section className={`district-detail ${selectedDistrict ? '' : 'district-detail--empty'}`} aria-live="polite">
            <span className={`district-detail__icon icon-box ${isSelectedMastered ? 'district-detail__icon--mastered' : ''}`} aria-hidden="true">
              {isSelectedMastered ? <CheckCircle2 size={25} strokeWidth={2.2} /> : <MapPin size={25} strokeWidth={2.2} />}
            </span>
            <div>
              <span>{selectedDistrict ? (isSelectedMastered ? '학습 완료' : '아직 미완료') : '자치구 살펴보기'}</span>
              <strong>{selectedDistrict || '지도에서 자치구를 선택해 주세요'}</strong>
              <p>{selectedDistrict ? (isSelectedMastered ? '퀴즈에서 정답을 맞혀 지도에 채운 자치구예요.' : '퀴즈에서 정답을 맞히면 이 지역도 지도에 채워져요.') : '각 지역을 누르면 현재 학습 상태를 확인할 수 있어요.'}</p>
            </div>
          </section>
        </>
      ) : null}

      <div className="bottom-action bottom-action--stacked collection-actions">
        <button className="primary-button" type="button" onClick={onStart}>퀴즈로 지도 채우기</button>
        <button className="secondary-button" type="button" onClick={onBack}>홈으로 돌아가기</button>
      </div>
    </main>
  )
}

function formatRecordDuration(milliseconds: number | null) {
  return milliseconds === null ? '아직 기록이 없어요' : formatDuration(milliseconds)
}

function RecordsDashboardScreen({
  records, loadStatus, onRetry, onStart, onBack,
}: {
  records: PersonalRecordsV2
  loadStatus: 'loading' | 'ready' | 'error'
  onRetry: () => void
  onStart: () => void
  onBack: () => void
}) {
  return (
    <main className="canvas records-screen">
      <section className="records-heading">
        <span className="eyebrow">내 기록</span>
        <h1>서울 자치구 퀴즈<br />나의 최고 기록</h1>
        <p>5문제를 모두 맞힌 기록과 연속 정답 수를 확인해 보세요.</p>
      </section>

      {loadStatus === 'loading' ? (
        <section className="records-state" role="status" aria-live="polite">
          <span className="records-state__pulse" aria-hidden="true" />
          <strong>기록을 불러오는 중이에요.</strong>
        </section>
      ) : null}

      {loadStatus === 'error' ? (
        <section className="records-state records-state--error" role="alert">
          <strong>기록을 불러오지 못했어요.</strong>
          <p>잠시 후 다시 시도해 주세요. 퀴즈는 그대로 풀 수 있어요.</p>
          <button className="secondary-button" type="button" onClick={onRetry}>다시 불러오기</button>
        </section>
      ) : null}

      {loadStatus === 'ready' ? (
        <section className="records-grid" aria-label="개인 최고 기록">
          <article className="record-panel record-panel--speed">
            <div className="record-panel__heading">
              <span className="record-panel__icon icon-box" aria-hidden="true"><Clock3 size={22} strokeWidth={2.2} /></span>
              <div><span>5문제 최단 기록</span><strong>5문제 모두 정답</strong></div>
            </div>
            <dl className="speed-records">
              <div><dt>객관식</dt><dd>{formatRecordDuration(records.fastestPerfectSetMs.choice)}</dd></div>
              <div><dt>주관식</dt><dd>{formatRecordDuration(records.fastestPerfectSetMs.text)}</dd></div>
            </dl>
          </article>

          <article className="record-panel record-panel--streak">
            <div className="record-panel__heading">
              <span className="record-panel__icon icon-box" aria-hidden="true"><Flame size={22} strokeWidth={2.2} /></span>
              <div><span>연속 정답</span><strong>정답을 맞힐 때마다 기록이 이어져요.</strong></div>
            </div>
            <div className="streak-records">
              <div><span>현재</span><strong>{records.currentCorrectStreak}<small>문제</small></strong></div>
              <div><span>개인 최고</span><strong>{records.bestCorrectStreak}<small>문제</small></strong></div>
            </div>
          </article>
        </section>
      ) : null}

      <div className="bottom-action bottom-action--stacked records-action">
        <button className="primary-button" type="button" onClick={onStart}>퀴즈 시작</button>
        <button className="secondary-button" type="button" onClick={onBack}>홈으로 돌아가기</button>
      </div>
    </main>
  )
}

function RegionPickerScreen({
  selectedPackId,
  selectedRegionId,
  onPackChange,
  onRegionSelect,
  onMapLoadFailed,
  onStart,
  onStartTyping,
  onBack,
}: {
  selectedPackId: RegionPackId
  selectedRegionId?: string
  onPackChange: (packId: RegionPackId) => void
  onRegionSelect: (regionId: string, source: RegionSelectionSource) => void
  onMapLoadFailed: (packId: RegionPackId) => void
  onStart: (regionId: string) => void
  onStartTyping: () => void
  onBack: () => void
}) {
  return <main className="canvas region-picker-screen">
    <section className="region-picker-heading">
      <span className="eyebrow">새 지역 학습</span>
      <h1>어느 지역부터<br />익혀볼까요?</h1>
      <p>지역과 맞닿은 주변 지역을 다섯 문제로 함께 살펴봐요.</p>
    </section>
    <RegionPicker
      selectedPackId={selectedPackId}
      selectedRegionId={selectedRegionId}
      onPackChange={onPackChange}
      onRegionSelect={onRegionSelect}
      onMapLoadFailed={onMapLoadFailed}
      onStart={onStart}
    />
    {selectedPackId === 'seoul' ? <button className="typing-entry-button" type="button" onClick={onStartTyping}>
      <Keyboard size={22} aria-hidden="true" />
      <span><strong>서울 25구 타자 도전</strong><small>25개 자치구 이름을 차례로 입력해요.</small></span>
    </button> : null}
    <div className="region-picker-back">
      <button className="secondary-button" type="button" onClick={onBack}>홈으로 돌아가기</button>
    </div>
  </main>
}

function QuizScreen({
  question, questionIndex, totalQuestions, hearts, xp, combo, result, onAnswer, onContinue, onMapLoadFailed,
}: {
  question: Question
  questionIndex: number
  totalQuestions: number
  hearts: number
  xp: number
  combo: number
  result: AnswerResult | null
  onAnswer: (answer: string, elapsedMs: number) => void
  onContinue: () => void
  onMapLoadFailed: (packId: RegionPackId) => void
}) {
  const [textAnswer, setTextAnswer] = useState('')
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const questionStartedAt = useRef<number | null>(null)
  const scope = useRef<HTMLElement>(null)

  useEffect(() => {
    if (result) return undefined
    questionStartedAt.current = performance.now()
    const updateElapsed = () => {
      if (questionStartedAt.current !== null) setElapsedMs(performance.now() - questionStartedAt.current)
    }
    const timer = window.setInterval(updateElapsed, 100)
    return () => window.clearInterval(timer)
  }, [result])

  useGSAP(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return

    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    timeline
      .from('.quiz-status', { y: -12, opacity: 0, duration: 0.35 })
      .from('.question-copy > *', { y: 18, opacity: 0, duration: 0.4, stagger: 0.06 }, '-=0.16')
      .from('.map-card', { scale: 0.88, opacity: 0, duration: 0.55 }, '-=0.18')
      .from('.answer-stage > *', { y: 14, opacity: 0, duration: 0.36, stagger: 0.06 }, '-=0.28')
  }, { scope })

  useGSAP(() => {
    if (!result || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (result.correct) {
      gsap.fromTo('.feedback-panel', { y: 36, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.42, ease: 'back.out(1.7)' })
      gsap.fromTo('.district--correct .district-shape', { scale: 0.97, transformOrigin: 'center' }, { scale: 1, duration: 0.38, ease: 'elastic.out(1, 0.45)' })
    } else {
      gsap.fromTo('.map-card', { x: -5 }, { x: 0, duration: 0.08, repeat: 4, yoyo: true, ease: 'power1.inOut' })
      gsap.fromTo('.feedback-panel', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: 'power2.out' })
    }
  }, { scope, dependencies: [result], revertOnUpdate: true })

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.progress-track__value', { scaleX: questionIndex / totalQuestions }, { scaleX: (questionIndex + 1) / totalQuestions, duration: 0.48, ease: 'power3.out', transformOrigin: 'left center' })
  }, { scope, dependencies: [questionIndex, totalQuestions] })

  const submitAnswer = (answer: string) => {
    const duration = questionStartedAt.current === null ? 0 : performance.now() - questionStartedAt.current
    setElapsedMs(duration)
    onAnswer(answer, duration)
  }

  const submitTextAnswer = (event: FormEvent) => {
    event.preventDefault()
    if (textAnswer.trim()) submitAnswer(textAnswer)
  }

  const pendingAnswer = question.mode === 'choice' ? selectedAnswer : textAnswer.trim()
  const region = getRegion(question.regionId ?? '')
  const isMapSelection = question.questionType === 'map-selection'
  const referenceRegion = getRegion(question.referenceRegionId ?? '')
  const isAdjacency = question.questionType === 'adjacency' && referenceRegion !== undefined
  const isConfirmation = question.scored === false
  const heading = isAdjacency
    ? replayCopy.adjacencyHeading(referenceRegion.name)
    : isMapSelection
    ? `${appendJosa(question.district, '은', '는')} 지도에서 어디일까요?`
    : question.questionType === 'silhouette'
      ? '이 지역의 모양은 어디일까요?'
      : '지도에 표시된 지역은 어디일까요?'
  const detail = region?.packId === 'gyeonggi' && region.level === 'district' && region.parentId
    ? { parentRegionId: region.parentId }
    : 'overview'
  const selectedMapRegionId = isMapSelection && region
    ? REGION_ID_BY_PACK_AND_NAME.get(`${region.packId}:${selectedAnswer}`)
    : undefined

  return (
    <main ref={scope} className="canvas quiz-screen">
      <section className="quiz-status" aria-label="퀴즈 진행 상황">
        <div className="progress-track" role="progressbar" aria-label={`${questionIndex + 1} / ${totalQuestions} 문제`} aria-valuemin={1} aria-valuemax={totalQuestions} aria-valuenow={questionIndex + 1}>
          <span className="progress-track__value" style={{ transform: `scaleX(${(questionIndex + 1) / totalQuestions})` }} />
        </div>
        <span className="status-pill status-pill--heart"><Heart size={17} strokeWidth={2.4} /> {hearts}</span>
        <span className="status-pill status-pill--xp">{xp} XP</span>
        <span className="status-pill status-pill--combo">{combo} 콤보</span>
        <span className="status-pill status-pill--timer" aria-label={`풀이 시간 ${formatDuration(elapsedMs)}`}>{formatDuration(elapsedMs)}</span>
      </section>

      <section className={`question-copy ${isConfirmation ? 'question-copy--confirmation' : ''}`}>
        <div className="question-number"><span>{isConfirmation ? '확인 문제' : String(questionIndex + 1).padStart(2, '0')}</span><span>{String(totalQuestions).padStart(2, '0')}</span></div>
        <h1>{question.regionId ? heading : <>지도에 표시된 자치구는<br />어디일까요?</>}</h1>
        {isAdjacency ? <p>{replayCopy.adjacencyLabel}</p> : null}
        {question.guidedCorrection ? <p role="status">5번째 시도예요. 정답 {question.district}를 선택해 주세요.</p> : null}
      </section>

      {region ? <RegionPackMap
        packId={region.packId}
        detail={detail}
        activeRegionId={isAdjacency && !result ? referenceRegion.id : isMapSelection && !result ? undefined : region.id}
        adjacentRegionIds={isAdjacency && result ? [referenceRegion.id] : undefined}
        selectedRegionId={selectedMapRegionId}
        result={result}
        interactive={isMapSelection && !result}
        variant={question.questionType === 'silhouette' ? 'silhouette' : 'quiz'}
        onRegionSelect={(regionId) => setSelectedAnswer(getRegion(regionId)?.name ?? '')}
        onMapLoadFailed={onMapLoadFailed}
        showRegionList={false}
        caption={isAdjacency && !result ? replayCopy.adjacencyCaption(referenceRegion.name) : isMapSelection && !result ? `지도에서 ${appendJosa(question.district, '을', '를')} 선택해 주세요.` : undefined}
      /> : <SeoulDistrictMap activeDistrict={question.district} result={result} interactive={false} onMapLoadFailed={onMapLoadFailed} />}

      <section className="answer-stage">
        {question.mode === 'choice' && !isMapSelection ? (
          <div className="answer-grid" role="group" aria-label="답안 선택">
          {question.options?.map((option) => {
            const isChosen = (result?.answer ?? selectedAnswer) === option
            const isCorrectOption = Boolean(result) && option === question.district
            const stateClass = isCorrectOption ? 'answer-button--correct' : result && isChosen ? 'answer-button--incorrect' : isChosen ? 'answer-button--selected' : ''
            return (
              <button className={`answer-button ${stateClass}`} type="button" key={option} disabled={result !== null} aria-pressed={isChosen} onClick={() => setSelectedAnswer(option)}>
                <span>{option}</span><span className="answer-button__mark" aria-hidden="true">{isChosen ? <Check size={18} strokeWidth={3} /> : null}</span>
              </button>
            )
          })}
          </div>
        ) : question.mode === 'text' ? (
          <form id="district-answer-form" className="text-answer" onSubmit={submitTextAnswer}>
          <label htmlFor="district-answer">지역 이름</label>
          <input id="district-answer" value={textAnswer} disabled={result !== null} onChange={(event) => setTextAnswer(event.target.value)} placeholder={question.regionId ? '예: 성남시' : '예: 동대문구'} autoComplete="off" />
          <p>‘구’를 빼고 입력해도 정답으로 인정해요.</p>
          </form>
        ) : <p className="map-selection-note">지도에서 한 지역을 선택한 뒤 정답을 확인해 주세요.</p>}
      </section>

      {result ? (
        <section className={`feedback-panel feedback-panel--${result.correct ? 'correct' : 'incorrect'}`} aria-live="polite">
          <div className="feedback-panel__title">
            <span className="feedback-icon icon-box" aria-hidden="true">{result.correct ? <Check strokeWidth={2.6} /> : <MapPin strokeWidth={2.4} />}</span>
            <div><strong>{result.correct ? '정답이에요!' : `정답은 ${question.district}예요.`}</strong><p>{question.hint}</p></div>
          </div>
          <button className="feedback-button" type="button" onClick={onContinue}>계속하기</button>
        </section>
      ) : (
        <div className="quiz-action">
          <button
            className="primary-button"
            type={question.mode === 'text' ? 'submit' : 'button'}
            form={question.mode === 'text' ? 'district-answer-form' : undefined}
            disabled={!pendingAnswer}
            onClick={question.mode === 'choice' ? () => submitAnswer(selectedAnswer) : undefined}
          >정답 확인</button>
        </div>
      )}
    </main>
  )
}

function CompleteScreen({
  mode, xp, correctCount, totalQuestions, answerDurations, wrongQuestions, records, saveFailed, onRestart, onReview, onChangeMode,
}: {
  mode: AnswerMode
  xp: number
  correctCount: number
  totalQuestions: number
  answerDurations: number[]
  wrongQuestions: Question[]
  records: PersonalRecordsV2
  saveFailed: boolean
  onRestart: () => void
  onReview: () => void
  onChangeMode: () => void
}) {
  const accuracy = Math.round((correctCount / totalQuestions) * 100)
  const totalDuration = answerDurations.reduce((total, duration) => total + duration, 0)
  const averageDuration = totalQuestions > 0 ? totalDuration / totalQuestions : 0
  const completionScope = useCompletionCelebration()

  return (
    <main ref={completionScope} className="canvas complete-screen">
      <section className="completion-hero">
        <span className="completion-illustration" aria-hidden="true" />
        <span className="eyebrow">{mode === 'choice' ? '객관식' : '주관식'} 완료</span>
        <h1>서울이 조금 더<br />가까워졌어요</h1>
        <p>{correctCount === totalQuestions ? `${totalQuestions}문제를 모두 맞혔어요.` : `${correctCount}문제를 맞혔어요.`}</p>
      </section>
      <section className="result-card completion-reveal" aria-label="학습 결과">
        <article aria-label={`획득 XP ${xp}`}><span aria-hidden="true">획득 XP</span><strong aria-hidden="true" data-counter-to={xp}>{xp}</strong></article>
        <article aria-label={`정확도 ${accuracy}%`}><span aria-hidden="true">정확도</span><strong aria-hidden="true" data-counter-to={accuracy} data-counter-suffix="%">{accuracy}%</strong></article>
        <article aria-label={`정답 ${correctCount}/${totalQuestions}`}><span aria-hidden="true">정답</span><strong aria-hidden="true" data-counter-to={correctCount} data-counter-suffix={`/${totalQuestions}`}>{correctCount}/{totalQuestions}</strong></article>
      </section>
      <section className="time-result-card completion-reveal" aria-label="풀이 시간 결과">
        <div><span>총 풀이 시간</span><strong>{formatDuration(totalDuration)}</strong></div>
        <div><span>문제당 평균</span><strong>{formatDuration(averageDuration)}</strong></div>
      </section>
      <section className={`streak-card completion-reveal ${records.currentCorrectStreak > 0 ? 'streak-card--active' : ''}`} aria-label={`${records.currentCorrectStreak}문제 연속 정답`}>
        <span className="streak-card__icon icon-box" aria-hidden="true">
          <Flame className="streak-card__flame" size={32} />
          {records.currentCorrectStreak > 0 ? <span className="streak-card__embers">
            {Array.from({ length: 5 }, (_, index) => <span className="streak-card__ember" key={index} />)}
          </span> : null}
        </span>
        <div>
          <strong>{records.currentCorrectStreak}문제 연속 정답</strong>
          <p>{records.currentCorrectStreak > 0 ? '다음 문제에서도 기록을 이어가 보세요.' : '다음 정답부터 새 스트릭이 시작돼요.'}</p>
        </div>
      </section>
      {saveFailed ? <p className="record-save-notice" role="status">이번 기록을 저장하지 못했어요. 다음 문제에서 다시 시도할게요.</p> : null}
      <div className="bottom-action bottom-action--stacked">
        {wrongQuestions.length > 0 ? <button className="secondary-button" type="button" onClick={onReview}>오답만 복습 ({wrongQuestions.length})</button> : null}
        <button className="primary-button" type="button" onClick={onRestart}>한 세트 더</button>
        <button className="text-button" type="button" onClick={onChangeMode}>다른 모드 선택</button>
      </div>
    </main>
  )
}

function formatNextReview(nextReviewAt: string | null | undefined) {
  if (!nextReviewAt) return '다음 세트에서 다시 만나요.'
  return `${new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(nextReviewAt))}에 다시 보면 좋아요.`
}

function RegionalCompleteScreen({
  targetRegionId,
  startingStage,
  endingStage,
  nextReviewAt,
  xp,
  hearts,
  correctCount,
  totalQuestions,
  answerDurations,
  wrongQuestions,
  saveFailed,
  onFinish,
  onRestart,
  onBrowse,
  onReview,
  stageUpCount,
}: {
  targetRegionId: string
  stageUpCount: number
  startingStage: ProgressStage
  endingStage: ProgressStage
  nextReviewAt?: string | null
  xp: number
  hearts: number
  correctCount: number
  totalQuestions: number
  answerDurations: number[]
  wrongQuestions: CourseQuestion[]
  saveFailed: boolean
  onFinish: () => void
  onRestart: () => void
  onBrowse: () => void
  onReview: () => void
}) {
  const target = getRegion(targetRegionId)
  const reviewRegions = [...new Map(wrongQuestions.map((question) => [question.regionId, getRegion(question.regionId)])).values()]
    .filter((region) => region !== undefined)
    .slice(0, 3)
  const totalDuration = answerDurations.reduce((total, duration) => total + duration, 0)
  const completionScope = useCompletionCelebration()

  return <main ref={completionScope} className="canvas complete-screen regional-complete-screen">
    <section className="completion-hero">
      <div className={`completion-streak ${correctCount > 0 ? 'completion-streak--active' : ''} ${correctCount === 5 ? 'completion-streak--perfect' : ''}`} aria-hidden="true">
        <span className="completion-streak__flame"><Flame size={54} strokeWidth={1.8} /></span>
        <span className="completion-streak__sparks">
          <span /><span /><span />
        </span>
        <span className="completion-streak__track">
          {Array.from({ length: 5 }, (_, index) => <span key={index} className={`completion-streak__step ${index < correctCount ? 'completion-streak__step--earned' : ''}`}>
            <Check size={15} strokeWidth={3} />
          </span>)}
        </span>
      </div>
      <span className="eyebrow">지역 학습 완료</span>
      <h1>{totalQuestions}문제를 풀었어요</h1>
      <p>{correctCount} / {totalQuestions}문제를 맞혔어요.</p>
      <p>{replayCopy.improved(stageUpCount)}</p>
    </section>
    <section className="mastery-result-card completion-reveal" aria-label={`${target?.name ?? '선택 지역'} 숙련도`}>
      <span>{target?.name ?? '선택 지역'} 숙련도</span>
      <strong>{STAGE_LABELS[startingStage]} → {STAGE_LABELS[endingStage]}</strong>
      <p>{formatNextReview(nextReviewAt)}</p>
    </section>
    <section className="regional-result-grid completion-reveal" aria-label="이번 학습 결과">
      <article aria-label={`획득 XP ${xp}`}><span aria-hidden="true">획득 XP</span><strong aria-hidden="true" data-counter-to={xp}>{xp}</strong></article>
      <article aria-label={`정답 ${correctCount}/${totalQuestions}`}><span aria-hidden="true">정답</span><strong aria-hidden="true" data-counter-to={correctCount} data-counter-suffix={`/${totalQuestions}`}>{correctCount}/{totalQuestions}</strong></article>
      <article aria-label={`남은 하트 ${hearts}`}><span aria-hidden="true">남은 하트</span><strong aria-hidden="true">{hearts}</strong></article>
      <article aria-label={`풀이 시간 ${formatDuration(totalDuration)}`}><span aria-hidden="true">풀이 시간</span><strong aria-hidden="true" data-counter-to={totalDuration / 1000} data-counter-decimals="1" data-counter-suffix="초">{formatDuration(totalDuration)}</strong></article>
    </section>
    <section className="review-region-card completion-reveal">
      <h2>다시 보면 좋은 지역</h2>
      {reviewRegions.length > 0 ? <ul>{reviewRegions.map((region) => <li key={region.id}>{region.name}</li>)}</ul> : <p>이번 세트에서 다시 볼 지역은 없어요.</p>}
    </section>
    {saveFailed ? <p className="record-save-notice" role="status">이번 기록을 저장하지 못했어요. 다음 저장 때 다시 시도할게요.</p> : null}
    <div className="bottom-action bottom-action--stacked">
      {wrongQuestions.length > 0 ? <button className="secondary-button" type="button" onClick={onReview}>오답만 복습 ({buildConfirmationQuestions(wrongQuestions).length})</button> : null}
      <button className="primary-button" type="button" onClick={onFinish}>오늘 학습 마치기</button>
      <button className="secondary-button" type="button" onClick={onRestart}>한 세트 더</button>
      <p>{replayCopy.replayDescription}</p>
      <button className="text-button" type="button" onClick={onBrowse}>새 지역 찾아보기</button>
    </div>
  </main>
}

function App({ initialRecords }: { initialRecords?: PersonalRecordsV2 }) {
  const safeArea = useSafeArea()
  const {
    records,
    loadStatus,
    saveFailed,
    dailyStreak,
    retryLoad,
    updateRecords,
    recordRegionAnswer,
    recordCourseCompleted,
  } = useLearningProgress(initialRecords)
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedPackId, setSelectedPackId] = useState<RegionPackId>('gyeonggi')
  const [selectedRegionId, setSelectedRegionId] = useState<string>()
  const [recentTargetRegionId, setRecentTargetRegionId] = useState<string>()
  const [selectedMode, setSelectedMode] = useState<AnswerMode>('choice')
  const [sessionKind, setSessionKind] = useState<SessionKind>('regular')
  const [questions, setQuestions] = useState<Question[]>(CHOICE_QUESTIONS)
  const [regionalSession, setRegionalSession] = useState<RegionalSession>()
  const [questionIndex, setQuestionIndex] = useState(0)
  const [hearts, setHearts] = useState(3)
  const [completedHearts, setCompletedHearts] = useState(3)
  const [xp, setXp] = useState(0)
  const [combo, setCombo] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([])
  const [answerDurations, setAnswerDurations] = useState<number[]>([])
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [typingDistricts, setTypingDistricts] = useState<string[]>([])
  const [typingElapsedMs, setTypingElapsedMs] = useState(0)
  const sessionSequence = useRef(0)
  const viewedPackId = useRef<RegionPackId | undefined>(undefined)
  const promptedDueCount = useRef<number | undefined>(undefined)
  const dueCount = getDueRegionIds(records).length

  const reportMapLoadFailure = useCallback((packId: RegionPackId) => {
    trackMapLoadFailed({ packId, assetVersion: REGION_MAP_ASSET_VERSIONS[packId] })
  }, [])

  useEffect(() => {
    if (screen !== 'region-picker') {
      viewedPackId.current = undefined
      return
    }
    if (viewedPackId.current === selectedPackId) return
    viewedPackId.current = selectedPackId
    trackRegionPackViewed({ packId: selectedPackId })
  }, [screen, selectedPackId])

  useEffect(() => {
    if (screen !== 'home' || dueCount === 0) {
      promptedDueCount.current = undefined
      return
    }
    if (promptedDueCount.current === dueCount) return
    promptedDueCount.current = dueCount
    trackReviewPromptShown({ dueCount })
  }, [dueCount, screen])

  const resetQuestionInteraction = (nextQuestions: Question[]) => {
    setQuestions(nextQuestions)
    setQuestionIndex(0)
    setHearts(3)
    setCombo(0)
    setResult(null)
    setScreen('course')
  }

  const resetQuestionState = (nextQuestions: Question[]) => {
    setXp(0)
    setCorrectCount(0)
    setWrongQuestions([])
    setAnswerDurations([])
    resetQuestionInteraction(nextQuestions)
  }

  const resetLegacySession = (nextQuestions: Question[], mode = selectedMode, kind: SessionKind = 'regular') => {
    setSelectedMode(mode)
    setSessionKind(kind)
    setRegionalSession(undefined)
    resetQuestionState(nextQuestions)
  }

  const startRegionalCourse = (targetRegionId: string, origin: RegionalSession['origin'] = 'browse', suppliedPlan?: CoursePlan) => {
    const plan = suppliedPlan ?? buildCourse(targetRegionId, records.progressByRegion, new Date(), Math.random)
    sessionSequence.current += 1
    setSelectedMode('choice')
    setSessionKind('regular')
    setRegionalSession({
      plan,
      sessionId: `regional-course-${Date.now()}-${sessionSequence.current}`,
      startingStage: records.progressByRegion[targetRegionId]?.stage ?? 0,
      wrongQuestions: [],
      confirmationAdded: false,
      origin,
      stageUpCount: 0,
      attemptsByRegion: {},
    })
    setRecentTargetRegionId(targetRegionId)
    resetQuestionState(plan.scoredQuestions.map((question) => createRegionalQuestion(question)))
    trackCourseStarted({
      courseId: `region:${targetRegionId}`,
      targetRegionId,
    })
  }

  const answerQuestion = (answer: string, elapsedMs: number) => {
    if (result) return
    const currentQuestion = questions[questionIndex]
    const correct = normalizeDistrict(answer) === normalizeDistrict(currentQuestion.district)
    const isScored = currentQuestion.scored !== false
    const isDueCorrection = regionalSession?.origin === 'due-review' && !isScored
    if (isScored && correct) {
      const nextCombo = combo + 1
      setCombo(nextCombo)
      setCorrectCount((count) => count + 1)
      setXp((score) => score + (regionalSession?.origin === 'due-review' ? 10 : 10 + (nextCombo >= 3 ? 5 : 0)))
      if (regionalSession?.origin === 'due-review') setHearts((count) => Math.min(3, count + 1))
    } else if (isScored) {
      setCombo(0)
      setHearts((count) => Math.max(0, count - 1))
      setWrongQuestions((items) => [...items, currentQuestion])
    } else if (isDueCorrection && correct) {
      setXp((score) => score + 5)
      setHearts((count) => Math.min(3, count + 1))
    }
    if (regionalSession && currentQuestion.regionId) {
      const courseQuestion: CourseQuestion = {
        regionId: currentQuestion.regionId,
        answer: currentQuestion.district,
        bucket: currentQuestion.bucket ?? 'review',
        questionType: currentQuestion.questionType ?? 'recognition',
        scored: isScored,
        referenceRegionId: currentQuestion.referenceRegionId,
      }
      if (isScored) {
        const transition = recordRegionAnswer({
          regionId: currentQuestion.regionId,
          correct,
          answeredAt: new Date(),
          questionType: courseQuestion.questionType,
          sessionId: regionalSession.sessionId,
          courseId: `region:${regionalSession.plan.targetRegionId}`,
          review: regionalSession.origin === 'due-review',
        })
        trackAnswerSubmitted({
          regionId: currentQuestion.regionId,
          questionType: courseQuestion.questionType,
          correct,
          stageBefore: transition?.stageBefore ?? 0,
        })
        setRegionalSession((session) => session ? {
          ...session,
          attemptsByRegion: {
            ...session.attemptsByRegion,
            [currentQuestion.regionId!]: (session.attemptsByRegion[currentQuestion.regionId!] ?? 0) + 1,
          },
          stageUpCount: session.stageUpCount + (transition && transition.stageAfter > transition.stageBefore ? 1 : 0),
          wrongQuestions: correct ? session.wrongQuestions : [...session.wrongQuestions, courseQuestion],
        } : session)
      } else if (isDueCorrection) {
        const regionId = currentQuestion.regionId
        const attempts = (regionalSession.attemptsByRegion[regionId] ?? 1) + 1
        if (correct) {
          trackReviewCorrectionCompleted({ regionId, attemptCount: attempts })
        } else if (attempts < 5) {
          setQuestions((items) => [...items, { ...currentQuestion, guidedCorrection: attempts === 4 }])
        }
        setRegionalSession((session) => session ? {
          ...session,
          attemptsByRegion: { ...session.attemptsByRegion, [regionId]: attempts },
        } : session)
      }
    } else {
      updateRecords((currentRecords) => recordAnswer(currentRecords, {
        correct,
        sessionKind,
        district: currentQuestion.district,
      }))
    }
    if (isScored) setAnswerDurations((durations) => [...durations, elapsedMs])
    setResult({ correct, answer })
    triggerAnswerHaptic(correct)
  }

  const startWeakReview = () => {
    const plan = buildWeakReviewCourse(records.progressByRegion, new Date(), Math.random)
    if (plan) startRegionalCourse(plan.targetRegionId, 'weak-review', plan)
    else setScreen('home')
  }

  const startDueReview = () => {
    const plan = buildDueReviewCourse(records.progressByRegion, new Date())
    if (plan) startRegionalCourse(plan.targetRegionId, 'due-review', plan)
    else setScreen('home')
  }

  const continueQuiz = () => {
    if (questionIndex + 1 < questions.length) {
      setQuestionIndex((index) => index + 1)
      setResult(null)
      return
    }

    if (regionalSession && !regionalSession.confirmationAdded && regionalSession.wrongQuestions.length > 0) {
      const confirmations = regionalSession.origin === 'due-review'
        ? regionalSession.wrongQuestions.map((question) => ({ ...question, scored: false as const }))
        : buildConfirmationQuestions(regionalSession.wrongQuestions)
      const confirmationQuestions = confirmations.map((question) => createRegionalQuestion(question))
      setQuestions((current) => [...current, ...confirmationQuestions])
      setRegionalSession({ ...regionalSession, confirmationAdded: true })
      setQuestionIndex((index) => index + 1)
      setResult(null)
      return
    }

    if (regionalSession) {
      if (sessionKind !== 'review') recordCourseCompleted(new Date())
      if (sessionKind !== 'review') {
        trackCourseCompleted({
          courseId: `region:${regionalSession.plan.targetRegionId}`,
          scoredCount: regionalSession.plan.scoredQuestions.length,
          correctCount,
        })
        if (regionalSession.origin !== 'browse') {
          trackReviewSessionCompleted({
            scoredCount: regionalSession.plan.scoredQuestions.length,
            correctCount,
            stageUpCount: regionalSession.stageUpCount,
          })
        }
      }
      if (sessionKind !== 'review') setCompletedHearts(hearts)
      setScreen('complete')
      setResult(null)
      return
    }

    if (questionIndex + 1 >= questions.length) {
      const totalDurationMs = answerDurations.reduce((total, duration) => total + duration, 0)
      updateRecords((currentRecords) => recordCompletedSet(currentRecords, {
        mode: selectedMode,
        sessionKind,
        correctCount,
        totalQuestions: questions.length,
        totalDurationMs,
      }))
      setScreen('complete')
      setResult(null)
      return
    }
  }

  const startAllDistrictsTyping = () => {
    setTypingDistricts(shuffleDistricts())
    setTypingElapsedMs(0)
    setScreen('typing')
  }

  const appStyle = {
    '--safe-top': `${safeArea.top}px`,
    '--safe-bottom': `${Math.max(safeArea.bottom, 34)}px`,
    '--safe-left': `${safeArea.left}px`,
    '--safe-right': `${safeArea.right}px`,
  } as CSSProperties

  return (
    <div className="app-shell" style={appStyle}>
      {screen === 'home' ? <HomeScreen records={records} dailyStreak={dailyStreak} loadStatus={loadStatus} recentTargetRegionId={recentTargetRegionId} onStartReview={startDueReview} onStartWeakReview={startWeakReview} onBrowse={() => setScreen('region-picker')} onOpenCollection={() => setScreen('collection')} onOpenRecords={() => setScreen('records')} /> : null}
      {screen === 'collection' ? <DistrictCollectionScreen records={records} loadStatus={loadStatus} onMapLoadFailed={reportMapLoadFailure} onRetry={() => { void retryLoad() }} onStart={() => setScreen('mode')} onBack={() => setScreen('home')} /> : null}
      {screen === 'records' ? <RecordsDashboardScreen records={records} loadStatus={loadStatus} onRetry={() => { void retryLoad() }} onStart={() => setScreen('mode')} onBack={() => setScreen('home')} /> : null}
      {screen === 'region-picker' ? <RegionPickerScreen
        selectedPackId={selectedPackId}
        selectedRegionId={selectedRegionId}
        onPackChange={(packId) => {
          setSelectedPackId(packId)
          setSelectedRegionId(undefined)
        }}
        onRegionSelect={(regionId, source) => {
          const region = getRegion(regionId)
          if (!region) return
          setSelectedRegionId(regionId)
          trackRegionSelected({ packId: region.packId, regionId, source })
        }}
        onMapLoadFailed={reportMapLoadFailure}
        onStart={startRegionalCourse}
        onStartTyping={startAllDistrictsTyping}
        onBack={() => setScreen('home')}
      /> : null}
      {screen === 'mode' ? <ModeSelectionScreen onSelect={(mode) => {
        if (mode === 'all-typing') {
          startAllDistrictsTyping()
          return
        }
        resetLegacySession(QUESTIONS_BY_MODE[mode], mode)
      }} onBack={() => setScreen('home')} /> : null}
      {screen === 'course' && questions[questionIndex] ? (
        getRegion(questions[questionIndex].regionId ?? '')?.packId === 'gyeonggi'
          ? <GuidedMapQuestion key={`${questions[questionIndex].regionId}:${questionIndex}`} question={questions[questionIndex]} questionIndex={questionIndex} totalQuestions={questions.length} result={result} onAnswer={answerQuestion} onContinue={continueQuiz} onMapLoadFailed={reportMapLoadFailure} />
          : <QuizScreen key={`${questions[questionIndex].regionId ?? questions[questionIndex].district}:${questionIndex}`} question={questions[questionIndex]} questionIndex={questionIndex} totalQuestions={questions.length} hearts={hearts} xp={xp} combo={combo} result={result} onAnswer={answerQuestion} onContinue={continueQuiz} onMapLoadFailed={reportMapLoadFailure} />
      ) : null}
      {screen === 'complete' && regionalSession ? <RegionalCompleteScreen
        targetRegionId={regionalSession.plan.targetRegionId}
        stageUpCount={regionalSession.stageUpCount}
        startingStage={regionalSession.startingStage}
        endingStage={records.progressByRegion[regionalSession.plan.targetRegionId]?.stage ?? 0}
        nextReviewAt={records.progressByRegion[regionalSession.plan.targetRegionId]?.nextReviewAt}
        xp={xp}
        hearts={completedHearts}
        correctCount={correctCount}
        totalQuestions={regionalSession.plan.scoredQuestions.length}
        answerDurations={answerDurations}
        wrongQuestions={regionalSession.wrongQuestions}
        saveFailed={saveFailed}
        onFinish={() => setScreen('home')}
        onRestart={regionalSession.origin === 'weak-review' ? startWeakReview : () => startRegionalCourse(regionalSession.plan.targetRegionId)}
        onBrowse={() => setScreen('region-picker')}
        onReview={() => {
          const confirmations = buildConfirmationQuestions(regionalSession.wrongQuestions)
          setSessionKind('review')
          resetQuestionInteraction(confirmations.map((question) => createRegionalQuestion(question)))
        }}
      /> : null}
      {screen === 'complete' && !regionalSession ? (
        <CompleteScreen mode={selectedMode} xp={xp} correctCount={correctCount} totalQuestions={questions.length} answerDurations={answerDurations} wrongQuestions={wrongQuestions} records={records} saveFailed={saveFailed} onRestart={() => resetLegacySession(QUESTIONS_BY_MODE[selectedMode])} onReview={() => resetLegacySession(wrongQuestions, selectedMode, 'review')} onChangeMode={() => setScreen('mode')} />
      ) : null}
      {screen === 'typing' && typingDistricts.length === 25 ? (
        <AllDistrictsTypingScreen districts={typingDistricts} onMapLoadFailed={reportMapLoadFailure} onDistrictSolved={(district) => {
          updateRecords((currentRecords) => recordMasteredDistrict(currentRecords, district))
        }} onComplete={(elapsedMs) => {
          setTypingElapsedMs(elapsedMs)
          setScreen('typing-complete')
        }} />
      ) : null}
      {screen === 'typing-complete' ? (
        <AllDistrictsCompleteScreen elapsedMs={typingElapsedMs} onRestart={startAllDistrictsTyping} onChangeMode={() => setScreen('mode')} />
      ) : null}
    </div>
  )
}

export default App
