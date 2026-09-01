import { SafeAreaInsets } from '@apps-in-toss/web-framework'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import './App.css'
import { CheckIcon, FlameIcon, HeartIcon, PinIcon, SparkIcon, StarIcon } from './components/AppIcons'
import { SeoulDistrictMap } from './components/SeoulDistrictMap'

gsap.registerPlugin(useGSAP)

type Screen = 'home' | 'quiz' | 'complete'
type AnswerMode = 'choice' | 'text'
type AnswerResult = { correct: boolean; answer: string }
type SafeInsets = { top: number; bottom: number; left: number; right: number }
type Question = {
  district: string
  hint: string
  mode: AnswerMode
  options?: string[]
}

const QUESTIONS: Question[] = [
  { district: '마포구', hint: '마포구는 한강 북쪽, 서울 서쪽에 있어요.', mode: 'choice', options: ['마포구', '용산구', '영등포구', '서대문구'] },
  { district: '동대문구', hint: '동대문구는 서울 동북권의 안쪽에 있어요.', mode: 'text' },
  { district: '송파구', hint: '송파구는 한강 남쪽, 서울 동남쪽에 있어요.', mode: 'choice', options: ['강동구', '광진구', '송파구', '강남구'] },
  { district: '도봉구', hint: '도봉구는 서울의 가장 북쪽에 가까워요.', mode: 'text' },
  { district: '서초구', hint: '서초구는 한강 남쪽, 서울 남동부에 있어요.', mode: 'choice', options: ['동작구', '관악구', '강남구', '서초구'] },
]

const TRAILING_GU = /구$/u
const WHITESPACE = /\s/gu

function normalizeDistrict(value: string) {
  return value.trim().replace(WHITESPACE, '').replace(TRAILING_GU, '')
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

function HomeScreen({ onStart }: { onStart: () => void }) {
  const scope = useRef<HTMLElement>(null)

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
          <p className="home-kicker">매일 1분, 서울 한 바퀴</p>
          <h1 className="max-w-full">오늘의 서울<span className="home-title-inline-map" aria-hidden="true" /><br /><span>5문제</span></h1>
          <p className="home-description">빛나는 자치구의 이름을 맞히고<br />서울 지도를 하나씩 채워보세요.</p>
        </div>
        <div className="home-map-visual" aria-hidden="true">
          <div className="home-map-visual__shape" />
          <span className="home-map-visual__pin"><PinIcon size={18} /></span>
          <span className="home-map-visual__orbit" />
        </div>
      </section>

      <section className="home-bento" aria-label="오늘의 학습 현황">
        <article className="stat-card stat-card--streak"><span className="stat-icon" aria-hidden="true"><FlameIcon /></span><div><strong>4일</strong><span>연속 학습</span></div></article>
        <article className="stat-card stat-card--xp"><span className="stat-icon" aria-hidden="true"><StarIcon /></span><div><strong>30 XP</strong><span>오늘 획득</span></div></article>
        <article className="badge-card">
          <div className="badge-card__copy"><span>서울 도장깨기</span><strong>18개 자치구를 찾았어요</strong></div>
          <span className="badge-card__value">18 / 25</span>
          <div className="mini-progress" role="progressbar" aria-label="서울 자치구 달성도" aria-valuemin={0} aria-valuemax={25} aria-valuenow={18}><span style={{ width: '72%' }} /></div>
        </article>
      </section>

      <div className="bottom-action home-action">
        <button className="primary-button" type="button" onClick={onStart}>오늘의 5문제 시작</button>
        <p>약 1분이면 끝나요</p>
      </div>
    </main>
  )
}

function QuizScreen({
  question, questionIndex, totalQuestions, hearts, xp, result, onAnswer, onContinue,
}: {
  question: Question
  questionIndex: number
  totalQuestions: number
  hearts: number
  xp: number
  result: AnswerResult | null
  onAnswer: (answer: string) => void
  onContinue: () => void
}) {
  const [textAnswer, setTextAnswer] = useState('')
  const [selectedAnswer, setSelectedAnswer] = useState('')
  const scope = useRef<HTMLElement>(null)

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

  const submitTextAnswer = (event: FormEvent) => {
    event.preventDefault()
    if (textAnswer.trim()) onAnswer(textAnswer)
  }

  const pendingAnswer = question.mode === 'choice' ? selectedAnswer : textAnswer.trim()

  return (
    <main ref={scope} className="canvas quiz-screen">
      <section className="quiz-status" aria-label="퀴즈 진행 상황">
        <div className="progress-track" role="progressbar" aria-label={`${questionIndex + 1} / ${totalQuestions} 문제`} aria-valuemin={1} aria-valuemax={totalQuestions} aria-valuenow={questionIndex + 1}>
          <span className="progress-track__value" />
        </div>
        <span className="status-pill status-pill--heart"><HeartIcon size={17} /> {hearts}</span>
        <span className="status-pill status-pill--xp">{xp} XP</span>
      </section>

      <section className="question-copy">
        <div className="question-number"><span>{String(questionIndex + 1).padStart(2, '0')}</span><span>{String(totalQuestions).padStart(2, '0')}</span></div>
        <h1>빛나는 지역구의<br />이름은 무엇일까요?</h1>
      </section>

      <SeoulDistrictMap activeDistrict={question.district} result={result} />

      <section className="answer-stage">
        {question.mode === 'choice' ? (
          <div className="answer-grid" aria-label="답안 선택">
          {question.options?.map((option) => {
            const isChosen = (result?.answer ?? selectedAnswer) === option
            const isCorrectOption = Boolean(result) && option === question.district
            const stateClass = isCorrectOption ? 'answer-button--correct' : result && isChosen ? 'answer-button--incorrect' : isChosen ? 'answer-button--selected' : ''
            return (
              <button className={`answer-button ${stateClass}`} type="button" key={option} disabled={result !== null} aria-pressed={isChosen} onClick={() => setSelectedAnswer(option)}>
                <span>{option}</span><span className="answer-button__mark" aria-hidden="true">{isChosen ? <CheckIcon size={18} /> : null}</span>
              </button>
            )
          })}
          </div>
        ) : (
          <form id="district-answer-form" className="text-answer" onSubmit={submitTextAnswer}>
          <label htmlFor="district-answer">지역구 이름</label>
          <input id="district-answer" value={textAnswer} disabled={result !== null} onChange={(event) => setTextAnswer(event.target.value)} placeholder="예: 동대문구" autoComplete="off" />
          <p>‘구’를 빼고 입력해도 정답으로 인정해요.</p>
          </form>
        )}
      </section>

      {result ? (
        <section className={`feedback-panel feedback-panel--${result.correct ? 'correct' : 'incorrect'}`} aria-live="polite">
          <div className="feedback-panel__title">
            <span className="feedback-icon" aria-hidden="true">{result.correct ? <CheckIcon /> : <PinIcon />}</span>
            <div><strong>{result.correct ? '정답이에요!' : `정답은 ${question.district}`}</strong><p>{question.hint}</p></div>
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
            onClick={question.mode === 'choice' ? () => onAnswer(selectedAnswer) : undefined}
          >정답 확인</button>
        </div>
      )}
    </main>
  )
}

function CompleteScreen({
  xp, correctCount, totalQuestions, wrongQuestions, onRestart, onReview,
}: {
  xp: number
  correctCount: number
  totalQuestions: number
  wrongQuestions: Question[]
  onRestart: () => void
  onReview: () => void
}) {
  const accuracy = Math.round((correctCount / totalQuestions) * 100)

  return (
    <main className="canvas complete-screen">
      <section className="completion-hero">
        <div className="celebration" aria-hidden="true"><SparkIcon size={48} /></div>
        <span className="eyebrow">오늘 학습 완료</span>
        <h1>서울이 조금 더<br />가까워졌어요</h1>
        <p>5일 연속 학습을 이어갔어요.</p>
      </section>
      <section className="result-card" aria-label="학습 결과">
        <article><span>획득 XP</span><strong>{xp}</strong></article>
        <article><span>정확도</span><strong>{accuracy}%</strong></article>
        <article><span>정답</span><strong>{correctCount}/{totalQuestions}</strong></article>
      </section>
      <section className="streak-card">
        <span className="streak-card__icon" aria-hidden="true"><FlameIcon size={32} /></span>
        <div><strong>5일 스트릭 달성</strong><p>내일 한 세트를 풀면 6일이 돼요.</p></div>
      </section>
      <div className="bottom-action bottom-action--stacked">
        {wrongQuestions.length > 0 ? <button className="secondary-button" type="button" onClick={onReview}>오답만 복습 ({wrongQuestions.length})</button> : null}
        <button className="primary-button" type="button" onClick={onRestart}>한 세트 더</button>
      </div>
    </main>
  )
}

function App() {
  const safeArea = useSafeArea()
  const [screen, setScreen] = useState<Screen>('home')
  const [questions, setQuestions] = useState<Question[]>(QUESTIONS)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [hearts, setHearts] = useState(3)
  const [xp, setXp] = useState(0)
  const [combo, setCombo] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([])
  const [result, setResult] = useState<AnswerResult | null>(null)

  const resetSession = (nextQuestions: Question[]) => {
    setQuestions(nextQuestions)
    setQuestionIndex(0)
    setHearts(3)
    setXp(0)
    setCombo(0)
    setCorrectCount(0)
    setWrongQuestions([])
    setResult(null)
    setScreen('quiz')
  }

  const answerQuestion = (answer: string) => {
    if (result) return
    const currentQuestion = questions[questionIndex]
    const correct = normalizeDistrict(answer) === normalizeDistrict(currentQuestion.district)
    if (correct) {
      const nextCombo = combo + 1
      setCombo(nextCombo)
      setCorrectCount((count) => count + 1)
      setXp((score) => score + 10 + (nextCombo >= 3 ? 5 : 0))
    } else {
      setCombo(0)
      setHearts((count) => Math.max(0, count - 1))
      setWrongQuestions((items) => [...items, currentQuestion])
    }
    setResult({ correct, answer })
  }

  const continueQuiz = () => {
    if (questionIndex + 1 >= questions.length) {
      setScreen('complete')
      setResult(null)
      return
    }
    setQuestionIndex((index) => index + 1)
    setResult(null)
  }

  const appStyle = {
    '--safe-top': `${safeArea.top}px`,
    '--safe-bottom': `${Math.max(safeArea.bottom, 34)}px`,
    '--safe-left': `${safeArea.left}px`,
    '--safe-right': `${safeArea.right}px`,
  } as CSSProperties

  return (
    <div className="app-shell" style={appStyle}>
      {screen === 'home' ? <HomeScreen onStart={() => resetSession(QUESTIONS)} /> : null}
      {screen === 'quiz' ? (
        <QuizScreen key={questions[questionIndex].district} question={questions[questionIndex]} questionIndex={questionIndex} totalQuestions={questions.length} hearts={hearts} xp={xp} result={result} onAnswer={answerQuestion} onContinue={continueQuiz} />
      ) : null}
      {screen === 'complete' ? (
        <CompleteScreen xp={xp} correctCount={correctCount} totalQuestions={questions.length} wrongQuestions={wrongQuestions} onRestart={() => resetSession(QUESTIONS)} onReview={() => resetSession(wrongQuestions)} />
      ) : null}
    </div>
  )
}

export default App
