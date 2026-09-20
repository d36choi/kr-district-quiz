import { getNeighbors } from '../data/adjacency'
import { getRegion, REGIONS_BY_ID, type Region } from '../data/regions'
import { isReviewDue, type ProgressStage, type RegionProgress, type ReviewDate } from './progress'

export type CourseBucket = 'target' | 'neighbor' | 'review'

export type CourseQuestionType =
  | 'recognition'
  | 'map-selection'
  | 'silhouette'
  | 'text-recall'
  | 'adjacency'

export type CourseQuestion = Readonly<{
  regionId: string
  answer: string
  bucket: CourseBucket
  questionType: CourseQuestionType
  scored: boolean
  referenceRegionId?: string
  allowFullMap?: boolean
}>

export type CoursePlan = Readonly<{
  targetRegionId: string
  scoredQuestions: readonly CourseQuestion[]
}>

type ProgressByRegion = Readonly<Record<string, RegionProgress>>
type Random = () => number

const ELIGIBLE_REGIONS = Object.values(REGIONS_BY_ID)
  .filter((region) => region.parentId !== null)
  .toSorted((left, right) => left.id.localeCompare(right.id))

function stageFor(regionId: string, progressByRegion: ProgressByRegion): ProgressStage {
  return progressByRegion[regionId]?.stage ?? 0
}

function shuffle<T>(values: readonly T[], random: Random): T[] {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    const value = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = value
  }
  return shuffled
}

function orderByStage(
  regions: readonly Region[],
  progressByRegion: ProgressByRegion,
  random: Random,
): Region[] {
  const byStage = new Map<ProgressStage, Region[]>()

  for (const region of regions) {
    const stage = stageFor(region.id, progressByRegion)
    byStage.set(stage, [...(byStage.get(stage) ?? []), region])
  }

  return [...byStage]
    .toSorted(([leftStage], [rightStage]) => leftStage - rightStage)
    .flatMap(([, tiedRegions]) => shuffle(tiedRegions, random))
}

function takeUnique(
  candidates: readonly Region[],
  count: number,
  selectedRegionIds: Set<string>,
): Region[] {
  const selected: Region[] = []

  for (const candidate of candidates) {
    if (selected.length === count) break
    if (selectedRegionIds.has(candidate.id)) continue
    selectedRegionIds.add(candidate.id)
    selected.push(candidate)
  }

  return selected
}

function fillFromLowStage(
  selected: Region[],
  count: number,
  selectedRegionIds: Set<string>,
  progressByRegion: ProgressByRegion,
  random: Random,
  candidates: readonly Region[],
  deferredRegionIds: ReadonlySet<string> = new Set(),
): Region[] {
  if (selected.length >= count) return selected
  const fallback = orderByStage(candidates, progressByRegion, random)
  const preferredFallback = fallback.filter((region) => !deferredRegionIds.has(region.id))
  const filled = [
    ...selected,
    ...takeUnique(preferredFallback, count - selected.length, selectedRegionIds),
  ]
  if (filled.length >= count) return filled
  return [...filled, ...takeUnique(fallback, count - filled.length, selectedRegionIds)]
}

function questionTypeFor(stage: ProgressStage): CourseQuestionType {
  if (stage === 0) return 'recognition'
  if (stage === 1) return 'map-selection'
  if (stage === 2) return 'silhouette'
  return 'text-recall'
}

function makeQuestion(
  region: Region,
  bucket: CourseBucket,
  progressByRegion: ProgressByRegion,
): CourseQuestion {
  const progress = progressByRegion[region.id]
  if (region.packId === 'gyeonggi') return Object.freeze({
    regionId: region.id, answer: region.name, bucket,
    questionType: 'map-selection', scored: true,
    allowFullMap: (progress?.stage ?? 0) >= 3,
  })
  const defaultType = questionTypeFor(stageFor(region.id, progressByRegion))
  const questionType = progress?.lastQuestionType === defaultType
    ? defaultType === 'map-selection' ? 'recognition' : 'map-selection'
    : defaultType
  const reference = bucket === 'neighbor' && progress?.attempts && progress.lastQuestionType !== 'adjacency'
    ? getNeighbors(region.id).flatMap((id) => getRegion(id) ?? [])
      .find((candidate) => candidate.packId === region.packId && candidate.parentId === region.parentId
        && ELIGIBLE_REGIONS.filter((other) => other.parentId === region.parentId
          && other.id !== candidate.id && !getNeighbors(candidate.id).includes(other.id)).length >= 3)
    : undefined
  return Object.freeze({
    regionId: region.id,
    answer: region.name,
    bucket,
    questionType: reference ? 'adjacency' : questionType,
    ...(reference ? { referenceRegionId: reference.id } : {}),
    scored: true,
  })
}

/** Missed regions remain eligible even when stage zero has no review date. */
export function getWeakRegions(progressByRegion: ProgressByRegion): RegionProgress[] {
  return Object.values(progressByRegion)
    .filter((progress) => getRegion(progress.regionId)?.parentId
      && progress.attempts > progress.correctAnswers && progress.stage < 3)
    .toSorted((left, right) => left.correctAnswers / left.attempts - right.correctAnswers / right.attempts
      || left.stage - right.stage || left.regionId.localeCompare(right.regionId))
}

export function buildWeakReviewCourse(
  progressByRegion: ProgressByRegion, now: ReviewDate, random: Random,
): CoursePlan | undefined {
  const weak = getWeakRegions(progressByRegion)
  if (!weak.length) return undefined
  const targetRegionId = weak[0].regionId
  const fallback = buildCourse(targetRegionId, progressByRegion, now, random)
  const ids = [...new Set([...weak.map((progress) => progress.regionId),
    ...fallback.scoredQuestions.map((question) => question.regionId)])].slice(0, 5)
  return Object.freeze({ targetRegionId, scoredQuestions: Object.freeze(ids.map((id) =>
    makeQuestion(getRegion(id)!, 'review', progressByRegion))) })
}

function orderReviewCandidates(
  progressByRegion: ProgressByRegion,
  now: ReviewDate,
  random: Random,
  candidates: readonly Region[],
): Region[] {
  const groups = new Map<string, Region[]>()

  for (const region of candidates) {
    const progress = progressByRegion[region.id]
    if (!progress || !isReviewDue(progress, now) || !progress.nextReviewAt) continue
    const priority = `${new Date(progress.nextReviewAt).getTime()}:${progress.stage}`
    groups.set(priority, [...(groups.get(priority) ?? []), region])
  }

  return [...groups]
    .toSorted(([left], [right]) => {
      const [leftDue, leftStage] = left.split(':').map(Number)
      const [rightDue, rightStage] = right.split(':').map(Number)
      return leftDue - rightDue || leftStage - rightStage
    })
    .flatMap(([, tiedRegions]) => shuffle(tiedRegions, random))
}

/** Build a short review containing only regions that are already due. */
export function buildDueReviewCourse(
  progressByRegion: ProgressByRegion,
  now: ReviewDate,
): CoursePlan | undefined {
  const dueRegions = Object.values(progressByRegion)
    .filter((progress) => progress.nextReviewAt && isReviewDue(progress, now) && getRegion(progress.regionId)?.parentId)
    .toSorted((left, right) => new Date(left.nextReviewAt!).getTime() - new Date(right.nextReviewAt!).getTime()
      || left.regionId.localeCompare(right.regionId))
    .slice(0, 5)
    .map((progress) => getRegion(progress.regionId)!)

  if (!dueRegions.length) return undefined
  return Object.freeze({
    targetRegionId: dueRegions[0].id,
    scoredQuestions: Object.freeze(dueRegions.map((region) => makeQuestion(region, 'review', progressByRegion))),
  })
}

function uniqueRegions(regions: readonly Region[]): Region[] {
  return [...new Map(regions.map((region) => [region.id, region])).values()]
}

function learningScopeFor(target: Region): Region[] {
  const samePackRegions = ELIGIBLE_REGIONS.filter((region) => region.packId === target.packId)
  const children = samePackRegions.filter((region) => region.parentId === target.id)
  const directNeighbors = getNeighbors(target.id)
    .flatMap((regionId) => getRegion(regionId) ?? [])
    .filter((region) => region.packId === target.packId)
  const scope = uniqueRegions([target, ...children, ...directNeighbors])
  if (scope.length >= 5) return scope

  const secondDegreeNeighbors = directNeighbors.flatMap((neighbor) => (
    getNeighbors(neighbor.id)
      .flatMap((regionId) => getRegion(regionId) ?? [])
      .filter((region) => region.packId === target.packId)
  ))
  const extendedScope = uniqueRegions([...scope, ...secondDegreeNeighbors])
  if (extendedScope.length >= 5) return extendedScope

  const siblings = samePackRegions.filter((region) => region.parentId === target.parentId)
  return uniqueRegions([...extendedScope, ...siblings, ...samePackRegions])
}

export function buildCourse(
  targetRegionId: string,
  progressByRegion: ProgressByRegion,
  now: ReviewDate,
  random: Random,
): CoursePlan {
  const target = getRegion(targetRegionId)
  if (!target) throw new RangeError(`Unknown target region: ${targetRegionId}`)

  const selectedRegionIds = new Set<string>()
  const learningScope = learningScopeFor(target)
  const children = learningScope.filter((region) => region.parentId === targetRegionId)
  const neighbors = getNeighbors(targetRegionId)
    .flatMap((regionId) => getRegion(regionId) ?? [])
    .filter((region) => region.packId === target.packId)
  const reviewCandidates = orderReviewCandidates(progressByRegion, now, random, learningScope)
  const neighborAndReviewIds = new Set([
    ...neighbors.map((region) => region.id),
    ...reviewCandidates.map((region) => region.id),
  ])
  let targetRegions = takeUnique(
    [target, ...orderByStage(children, progressByRegion, random)],
    2,
    selectedRegionIds,
  )
  targetRegions = fillFromLowStage(
    targetRegions,
    2,
    selectedRegionIds,
    progressByRegion,
    random,
    learningScope,
    neighborAndReviewIds,
  )

  let neighborRegions = takeUnique(
    orderByStage(neighbors, progressByRegion, random),
    2,
    selectedRegionIds,
  )
  neighborRegions = fillFromLowStage(
    neighborRegions,
    2,
    selectedRegionIds,
    progressByRegion,
    random,
    learningScope,
    new Set(reviewCandidates.map((region) => region.id)),
  )

  let reviewRegions = takeUnique(
    reviewCandidates,
    1,
    selectedRegionIds,
  )
  reviewRegions = fillFromLowStage(
    reviewRegions,
    1,
    selectedRegionIds,
    progressByRegion,
    random,
    learningScope,
  )

  return Object.freeze({
    targetRegionId,
    scoredQuestions: Object.freeze([
      ...targetRegions.map((region) => makeQuestion(region, 'target', progressByRegion)),
      ...neighborRegions.map((region) => makeQuestion(region, 'neighbor', progressByRegion)),
      ...reviewRegions.map((region) => makeQuestion(region, 'review', progressByRegion)),
    ]),
  })
}

export function buildConfirmationQuestions(
  wrongQuestions: readonly CourseQuestion[],
): readonly CourseQuestion[] {
  return Object.freeze(
    wrongQuestions.slice(0, 2).map((question) => Object.freeze({ ...question, scored: false,
      ...(getRegion(question.regionId)?.packId === 'gyeonggi'
        ? { questionType: 'map-selection' as const, allowFullMap: false } : {}),
    })),
  )
}
