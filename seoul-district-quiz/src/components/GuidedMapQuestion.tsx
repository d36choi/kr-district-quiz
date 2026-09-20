import { useRef, useState } from 'react'
import { getRegion, getTopLevelRegions } from '../data/regions'
import type { Question } from '../data/districts'
import { guidedCandidates } from '../game/guidedMap'
import { RegionPackMap } from './RegionPackMap'
import { appendJosa } from '../utils/korean'

export function GuidedMapQuestion({ question, questionIndex, totalQuestions, result, onAnswer, onContinue, onMapLoadFailed }: {
  question: Question
  questionIndex: number
  totalQuestions: number
  result: { correct: boolean; answer: string } | null
  onAnswer: (answer: string, elapsedMs: number) => void
  onContinue: () => void
  onMapLoadFailed: (packId: 'seoul' | 'gyeonggi') => void
}) {
  const region = getRegion(question.regionId!)!
  const parent = region.level === 'district' ? getRegion(region.parentId!) : undefined
  const [fullMap, setFullMap] = useState(false)
  const [selected, setSelected] = useState('')
  const [candidates] = useState(() => guidedCandidates(region.id))
  const startedAt = useRef<number | null>(null)
  const [ready, setReady] = useState(false)
  const ids = fullMap ? getTopLevelRegions('gyeonggi').map((item) => item.id) : candidates
  const showNames = Boolean(result)
  const labels = Object.fromEntries(ids.map((id, index) => [id, showNames ? getRegion(id)!.name : fullMap ? String(index + 1) : ['A', 'B', 'C'][index]]))
  const accessibleLabels = Object.fromEntries(ids.map((id, index) => [id, showNames ? getRegion(id)!.name : `${fullMap ? index + 1 : ['A', 'B', 'C'][index]} 위치`]))
  const references = region.neighborIds.filter((id) => !ids.includes(id) && getRegion(id)?.parentId === region.parentId).slice(0, 2)
  for (const id of references) labels[id] = getRegion(id)!.name
  const select = (id: string) => { if (!result) setSelected(id) }

  return <main className="canvas quiz-screen guided-question">
    <p className="guided-progress">{question.scored === false ? '오답 복습' : `${questionIndex + 1} / ${totalQuestions} 문제`}</p>
    <h1>{appendJosa(region.name, '은', '는')} 지도에서 어디일까요?</h1>
    <p>표시된 위치 중 하나를 골라 주세요.</p>
    {question.guidedCorrection ? <p role="status">5번째 시도예요. 정답 {region.name}를 선택해 주세요.</p> : null}
    {parent ? <aside className="guided-parent-map" aria-label={`${parent.name}의 경기 내 위치`}>
      <RegionPackMap packId="gyeonggi" activeRegionId={parent.id} interactive={false} showRegionList={false}
        caption={`${region.name}는 ${parent.name}에 속해 있어요. 아래는 ${parent.name} 안의 구 지도예요.`}
        onMapLoadFailed={onMapLoadFailed} />
    </aside> : null}
    <RegionPackMap packId="gyeonggi" detail={parent ? { parentRegionId: parent.id } : 'overview'}
      activeRegionId={result ? region.id : undefined} selectedRegionId={selected} result={result}
      interactive={!result && ready} selectableRegionIds={ids} mapLabels={labels} accessibleRegionLabels={accessibleLabels}
      focusRegionIds={fullMap ? undefined : [...candidates, ...references]} showRegionList={false}
      onReady={() => { setReady(true); if (startedAt.current === null) startedAt.current = performance.now() }}
      onRegionSelect={select} onMapLoadFailed={onMapLoadFailed}
      caption={result ? question.hint : '주변 지역 이름을 기준으로 위치를 찾아보세요.'} />
    <div className="answer-grid" role="group" aria-label="위치 선택">
      {ids.map((id, index) => <button key={id} className={`answer-button ${selected === id ? 'answer-button--selected' : ''}`} disabled={Boolean(result) || !ready}
        aria-pressed={selected === id} onClick={() => select(id)}>{fullMap ? index + 1 : ['A', 'B', 'C'][index]} 위치{showNames ? ` · ${getRegion(id)!.name}` : ''}</button>)}
    </div>
    {result ? <section className="feedback-panel" aria-live="polite">
      <strong>{result.correct ? '정답이에요!' : `정답은 ${appendJosa(region.name, '이에요', '예요')}.`}</strong>
      <p>{question.hint}</p>
      <button className="feedback-button" onClick={onContinue}>계속하기</button>
    </section> : <div className="bottom-action bottom-action--stacked">
      {question.allowFullMap && !parent ? <button className="text-button" onClick={() => { setFullMap(!fullMap); setSelected('') }}>{fullMap ? '주변 3곳으로 돌아가기' : '경기 전체 지도에 도전'}</button> : null}
      <button className="primary-button" disabled={!selected || !ready} onClick={() => onAnswer(getRegion(selected)!.name, startedAt.current === null ? 0 : performance.now() - startedAt.current)}>정답 확인</button>
    </div>}
  </main>
}
