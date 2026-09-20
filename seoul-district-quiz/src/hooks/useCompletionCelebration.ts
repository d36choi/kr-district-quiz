import { createScope, createTimeline, stagger, utils } from 'animejs'
import { useLayoutEffect, useRef } from 'react'

function formatCounter(node: HTMLElement, value: number) {
  const decimals = Number(node.dataset.counterDecimals ?? '0')
  const suffix = node.dataset.counterSuffix ?? ''
  return `${value.toFixed(decimals)}${suffix}`
}

export function useCompletionCelebration() {
  const root = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const element = root.current
    if (!element) return undefined

    const scope = createScope({
      root: element,
      mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
    }).add((self) => {
      const counters = Array.from(element.querySelectorAll<HTMLElement>('[data-counter-to]'))
      const setFinalValues = () => counters.forEach((node) => {
        node.textContent = formatCounter(node, Number(node.dataset.counterTo ?? '0'))
      })

      if (self?.matches.reduceMotion) {
        setFinalValues()
        return
      }

      const illustration = element.querySelector<HTMLElement>('.completion-illustration')
      const revealItems = element.querySelectorAll<HTMLElement>('.completion-hero > .eyebrow, .completion-hero > h1, .completion-hero > p, .completion-reveal')
      const timeline = createTimeline({ defaults: { ease: 'out(3)' } })

      if (illustration) {
        utils.set(illustration, { opacity: 0, scale: 0.72, rotate: -8, translateY: 14 })
        timeline.add(illustration, {
          opacity: 1,
          scale: [0.72, 1.08, 1],
          rotate: [-8, 3, 0],
          translateY: 0,
          duration: 620,
        }, 0)
      }

      const streak = element.querySelector<HTMLElement>('.completion-streak')
      if (streak) {
        const earnedSteps = streak.querySelectorAll<HTMLElement>('.completion-streak__step--earned')
        const flame = streak.querySelector<HTMLElement>('.completion-streak__flame')
        utils.set(earnedSteps, { opacity: 0.35, scale: 0.92 })
        timeline.add(earnedSteps, {
          opacity: 1,
          scale: [0.92, 1.08, 1],
          duration: 260,
          delay: stagger(90),
        }, 0)

        if (flame && streak.classList.contains('completion-streak--perfect')) {
          utils.set(flame, { opacity: 0.45, scale: 0.94, translateY: 8 })
          timeline.add(flame, {
            opacity: 1,
            scale: [0.94, 1.06, 1],
            translateY: 0,
            duration: 320,
          }, 550)
          timeline.add(streak.querySelectorAll<HTMLElement>('.completion-streak__sparks span'), {
            opacity: [0, 1, 0],
            translateY: [0, -16],
            duration: 420,
            delay: stagger(60),
          }, 720)
        }
      }

      utils.set(revealItems, { opacity: 0, translateY: 18 })
      timeline.add(revealItems, {
        opacity: 1,
        translateY: 0,
        duration: 440,
        delay: stagger(72),
      }, 180)

      counters.forEach((node, index) => {
        const counter = { value: 0 }
        const target = Number(node.dataset.counterTo ?? '0')
        node.textContent = formatCounter(node, 0)
        timeline.add(counter, {
          value: target,
          duration: 820,
          ease: 'out(4)',
          onUpdate: () => { node.textContent = formatCounter(node, counter.value) },
          onComplete: () => { node.textContent = formatCounter(node, target) },
        }, 460 + index * 90)
        timeline.add(node, {
          scale: [1, 1.13, 1],
          duration: 320,
          ease: 'out(3)',
        }, 1_080 + index * 90)
      })

      const streakCard = element.querySelector<HTMLElement>('.streak-card--active')
      const flame = element.querySelector<HTMLElement>('.streak-card__flame')
      const embers = element.querySelectorAll<HTMLElement>('.streak-card__ember')
      if (streakCard && flame) {
        timeline.add(streakCard, {
          scale: [0.985, 1.012, 1],
          borderColor: 'var(--brand-primary)',
          duration: 520,
        }, 1_000)
        timeline.add(flame, {
          scale: [0.78, 1.2, 0.94, 1.08, 1],
          rotate: [-7, 6, -4, 2, 0],
          duration: 680,
          ease: 'out(4)',
        }, 1_030)
        timeline.add(embers, {
          opacity: [0, 1, 0],
          scale: [0.45, 1, 0.2],
          translateX: stagger([-12, 12]),
          translateY: [8, -24],
          duration: 520,
          delay: stagger(55),
        }, 1_080)
      }

      timeline.call(setFinalValues, 1_800)
    })

    return () => scope.revert()
  }, [])

  return root
}
