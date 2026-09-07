# 서울·경기 지역 학습 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 서울 25구 퀴즈를 유지하면서 경기도 31개 시·군과 주요 도시의 세부 구·인접 지역을 반복 학습할 수 있는 서울·경기 지역 학습 루프를 구현한다.

**Architecture:** 지역팩, 행정경계, 인접 관계, 코스 생성, 숙련도 기록을 독립 모듈로 분리한다. GeoJSON/TopoJSON 원본에서 렌더링 가능한 SVG path를 생성하고, 문제 엔진은 지역 ID와 숙련도만 받아 지도 표현과 무관하게 문제를 만든다. 기존 `PersonalRecordsV1`은 읽기 시 `PersonalRecordsV2`로 한 번만 이전하고, 기기 내 Storage에 저장한다.

**Tech Stack:** React + TypeScript + Vite, `@apps-in-toss/web-framework` Storage/Analytics/Haptic, Vitest, 현재 사용 중인 SVG DOM parser와 GSAP.

**Spec:** `docs/superpowers/specs/2026-09-07-gyeonggi-region-learning-expansion-design.md`

All `npm` commands below run from `seoul-district-quiz/`.

## Global Constraints

- 서울 25개 자치구와 경기 31개 시·군을 동일한 지역팩 모델로 관리한다.
- 경기 전체 단계에서는 일반구 경계를 숨기고, 수원·성남·용인 세부 단계에서만 내부 구를 보여준다.
- 한반도 locator map을 사용하지 않고 경기도 외곽선과 내부 행정경계만 표시한다.
- 전체 지도와 개별 실루엣은 같은 경계 데이터에서 생성한다.
- 인접 관계는 경계선을 공유하는 지역만 연결하고 꼭짓점만 닿는 지역은 제외한다.
- 서울·경기 경계를 넘는 인접 관계를 지원한다.
- 숙련 단계는 0~4이며 복습 간격은 1·3·7·21일이다.
- 세트는 관심 지역 2문제, 인접 지역 2문제, 복습 1문제로 구성하며 채점 문제의 지역 중복을 금지한다.
- 오답 확인 문제는 최대 2개이고 숙련도를 올리지 않는다.
- `Storage` 기반 기기 로컬 저장을 사용하며 로그인, 동기화, 결제, 광고, 푸시는 구현하지 않는다.
- 본문 15px 이상, 터치 대상 44px 이상, `word-break: keep-all`, `prefers-reduced-motion` 대응을 유지한다.
- 모든 작업은 기존 사용자의 변경사항을 덮어쓰지 않고 각 작업 후 독립 커밋한다.

## File Structure

- Create `seoul-district-quiz/src/data/regions.ts`: 서울·경기 지역팩, 지역 계층, 별칭, 코스 메타데이터.
- Create `seoul-district-quiz/src/data/regions.test.ts`: 지역팩 수와 계층·ID 무결성 검증.
- Create `seoul-district-quiz/src/data/adjacency.ts`: 시·군·구 인접 관계의 정적 데이터와 조회 함수.
- Create `seoul-district-quiz/src/data/adjacency.test.ts`: 대칭성, 교차 지역팩, 꼭짓점 접촉 제외 규칙 검증.
- Create `seoul-district-quiz/src/data/geometry.ts`: 지도 path 로더와 도형 manifest 타입.
- Create `seoul-district-quiz/src/data/geometry.test.ts`: 모든 지역 ID와 SVG path 연결 검증.
- Create `seoul-district-quiz/src/assets/maps/gyeonggi-municipalities.svg`: 경기도 31개 시·군의 병합 경계 SVG.
- Create `seoul-district-quiz/src/assets/maps/gyeonggi-districts.svg`: 세부 일반구 path를 가진 경기 상세 SVG.
- Create `seoul-district-quiz/src/assets/maps/SOURCES.md`: 원본 URL, 기준일, 라이선스, 가공 명령 기록.
- Create `seoul-district-quiz/scripts/build-region-maps.mjs`: GeoJSON/TopoJSON을 SVG path와 manifest로 변환하는 재현 가능한 스크립트.
- Create `seoul-district-quiz/src/game/progress.ts`: 숙련도 단계, 복습 일정, 정답·오답 업데이트.
- Create `seoul-district-quiz/src/game/progress.test.ts`: 단계 경계, 날짜 계산, 확인 문제 규칙 테스트.
- Create `seoul-district-quiz/src/game/courseGenerator.ts`: 관심 지역·인접 지역·복습 대상에서 5문제 생성.
- Create `seoul-district-quiz/src/game/courseGenerator.test.ts`: 2·2·1 구성과 중복·fallback 테스트.
- Modify `seoul-district-quiz/src/game/personalRecords.ts`: V2 스키마와 V1 마이그레이션.
- Modify `seoul-district-quiz/src/game/personalRecords.test.ts`: V2 parser와 마이그레이션 테스트.
- Modify `seoul-district-quiz/src/hooks/usePersonalRecords.ts`: V2 기록 API와 일일 스트릭 상태 연결.
- Create `seoul-district-quiz/src/hooks/useLearningProgress.ts`: 지역별 숙련도 조회·저장 훅.
- Create `seoul-district-quiz/src/components/RegionPackMap.tsx`: 서울/경기 path 렌더링, 선택, 강조, 접근성.
- Modify `seoul-district-quiz/src/components/SeoulDistrictMap.tsx`: 공통 지도 렌더러 또는 기존 API 호환 wrapper로 전환.
- Create `seoul-district-quiz/src/components/RegionPicker.tsx`: 지역팩 탭, 검색, 지도·목록 선택.
- Modify `seoul-district-quiz/src/App.tsx`: 홈·지역 선택·코스·완료 화면과 새 코스 엔진 연결.
- Modify `seoul-district-quiz/src/App.css`: 지역팩/세부 구/복습 상태 스타일과 반응형 규칙.
- Create `seoul-district-quiz/src/analytics/events.ts`: 이벤트 이름과 payload 타입, SDK 호출 wrapper.
- Create `seoul-district-quiz/src/analytics/events.test.ts`: payload 개인정보 비포함 검증.

### Task 1: Region catalog and hierarchy

**Files:**
- Create: `seoul-district-quiz/src/data/regions.ts`
- Create: `seoul-district-quiz/src/data/regions.test.ts`
- Create: `seoul-district-quiz/src/data/adjacency.ts`
- Create: `seoul-district-quiz/src/data/adjacency.test.ts`

**Interfaces:**
- Produces `RegionPackId`, `RegionLevel`, `Region`, `RegionPack`, `REGION_PACKS`, `REGIONS_BY_ID`, `getRegion(id)`, `getNeighbors(id)`.
- `Region.neighborIds` may contain a region from the other pack when the administrative boundary crosses Seoul·Gyeonggi.

- [ ] **Step 1: Write failing catalog tests**

```ts
it('경기 최상위 지역은 정확히 31개 시·군이다', () => {
  expect(getTopLevelRegions('gyeonggi')).toHaveLength(31)
})

it('세부 구는 올바른 도시의 자식으로 연결된다', () => {
  expect(getRegion('gyeonggi:seongnam:bundang')?.parentId).toBe('gyeonggi:seongnam')
  expect(getRegion('gyeonggi:suwon:yeongtong')?.level).toBe('district')
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run src/data/regions.test.ts`
Expected: FAIL because catalog functions and data do not exist.

- [ ] **Step 3: Implement catalog**

Use stable IDs such as `seoul:mapo`, `gyeonggi:seongnam`, and `gyeonggi:seongnam:bundang`. Represent a city with general districts as one top-level region plus child district regions. Keep aliases such as `성남`, `성남시`, and `성남시 분당구` on the region record for search and answer normalization.

- [ ] **Step 4: Add adjacency data and tests**

Implement `getNeighbors(regionId)` as a read-only lookup. Tests must assert `A ∈ neighbors(B)` whenever `B ∈ neighbors(A)`, include a Seoul·Gyeonggi edge, and reject a relation that only touches at a single vertex.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- --run src/data/regions.test.ts src/data/adjacency.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add seoul-district-quiz/src/data/regions.ts seoul-district-quiz/src/data/regions.test.ts seoul-district-quiz/src/data/adjacency.ts seoul-district-quiz/src/data/adjacency.test.ts
git commit -m "feat: add Seoul Gyeonggi region catalog"
```

### Task 2: Boundary source, SVG generation, and geometry validation

**Files:**
- Create: `seoul-district-quiz/scripts/build-region-maps.mjs`
- Create: `seoul-district-quiz/src/assets/maps/gyeonggi-municipalities.svg`
- Create: `seoul-district-quiz/src/assets/maps/gyeonggi-districts.svg`
- Create: `seoul-district-quiz/src/assets/maps/SOURCES.md`
- Create: `seoul-district-quiz/src/data/geometry.ts`
- Create: `seoul-district-quiz/src/data/geometry.test.ts`

**Interfaces:**
- Produces `GeometryPath`, `GeometryManifest`, `loadGeometry(packId, detail)`, and `parseGeometrySvg(svgText)`.
- `GeometryPath` contains `geometryId`, `regionId`, `name`, and SVG `path`.

- [ ] **Step 1: Record the current official boundary source**

Obtain the latest government-published administrative boundary dataset at implementation time. Record its exact URL, retrieval date, base date, license, and the command used to simplify and convert it in `src/assets/maps/SOURCES.md`. Do not promote the brainstorming SVG or an outdated locator map to a product asset.

- [ ] **Step 2: Write failing geometry tests**

```ts
it('경기도 전체 SVG는 31개 최상위 시군 path를 제공한다', () => {
  const paths = parseGeometrySvg(gyeonggiMunicipalitiesSvg)
  expect(paths.filter((path) => path.level === 'city' || path.level === 'county')).toHaveLength(31)
})

it('세부 SVG는 수원·성남·용인 구 ID를 제공한다', () => {
  const ids = parseGeometrySvg(gyeonggiDistrictsSvg).map((path) => path.regionId)
  expect(ids).toEqual(expect.arrayContaining([
    'gyeonggi:suwon:yeongtong',
    'gyeonggi:seongnam:bundang',
    'gyeonggi:yongin:suji',
  ]))
})
```

- [ ] **Step 3: Implement the conversion script**

Convert geometry into stable `data-region-id` paths. Dissolve child general districts for the 31-region overview so internal boundaries are absent there; retain child paths in the detail SVG. Use a fixed viewBox and preserve vector geometry for zoom. Generate a manifest that fails on duplicate IDs or missing regions.

- [ ] **Step 4: Add asset and parser validation**

Load the generated SVG through the existing DOMParser pattern. Validate that every catalog region with a geometry requirement has one path, no path has an unknown region ID, and all SVGs use a non-empty viewBox.

- [ ] **Step 5: Run tests and build validation**

Run: `npm test -- --run src/data/geometry.test.ts`
Expected: PASS with the committed generated SVGs.

- [ ] **Step 6: Commit**

```bash
git add seoul-district-quiz/scripts/build-region-maps.mjs seoul-district-quiz/src/assets/maps seoul-district-quiz/src/data/geometry.ts seoul-district-quiz/src/data/geometry.test.ts
git commit -m "feat: add region boundary geometry pipeline"
```

### Task 3: Progress stages and spaced review

**Files:**
- Create: `seoul-district-quiz/src/game/progress.ts`
- Create: `seoul-district-quiz/src/game/progress.test.ts`

**Interfaces:**
- Produces `ProgressStage`, `RegionProgress`, `createRegionProgress(regionId)`, `applyScoredAnswer(progress, correct, answeredAt)`, `getNextReviewAt(stage, answeredAt)`, and `isReviewDue(progress, now)`.

- [ ] **Step 1: Write failing stage tests**

```ts
it('정답은 단계를 올리고 1·3·7·21일 간격을 사용한다', () => {
  const at = new Date('2026-09-07T00:00:00+09:00')
  const first = applyScoredAnswer(createRegionProgress('gyeonggi:seongnam'), true, at)
  const second = applyScoredAnswer(first, true, at)
  expect(first.stage).toBe(1)
  expect(second.stage).toBe(2)
  expect(first.nextReviewAt).toBe('2026-09-08T00:00:00.000+09:00')
  expect(second.nextReviewAt).toBe('2026-09-10T00:00:00.000+09:00')
})

it('오답은 단계를 내리며 최저 단계 아래로 내려가지 않는다', () => {
  const progress = { ...createRegionProgress('seoul:mapo'), stage: 0 as const }
  expect(applyScoredAnswer(progress, false, new Date()).stage).toBe(0)
})
```

- [ ] **Step 2: Run the focused tests**

Run: `npm test -- --run src/game/progress.test.ts`
Expected: FAIL because progress functions do not exist.

- [ ] **Step 3: Implement deterministic stage transitions**

Use stage 0 for unseen, stage 1 after one scored correct answer, stage 2 after the next, stage 3 after the next, and stage 4 for stable knowledge. Map stages to 1, 3, 7, and 21 calendar days; cap at stage 4. A scored wrong answer decrements by one. An unscored confirmation question never calls `applyScoredAnswer`.

- [ ] **Step 4: Add due-date and boundary tests**

Cover exact due timestamps, timezone-safe date serialization, stage 4 retention at 21 days, and review-due behavior before and after the due instant.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run src/game/progress.test.ts`
Expected: PASS.

```bash
git add seoul-district-quiz/src/game/progress.ts seoul-district-quiz/src/game/progress.test.ts
git commit -m "feat: add region spaced review progress"
```

### Task 4: Course generation

**Files:**
- Create: `seoul-district-quiz/src/game/courseGenerator.ts`
- Create: `seoul-district-quiz/src/game/courseGenerator.test.ts`

**Interfaces:**
- Produces `CourseQuestion`, `CoursePlan`, `buildCourse(targetRegionId, progressByRegion, now, random)`, and `buildConfirmationQuestions(wrongQuestions)`.

- [ ] **Step 1: Write failing course tests**

```ts
it('관심 지역 2·인접 지역 2·복습 1의 5문제를 만든다', () => {
  const plan = buildCourse('gyeonggi:seongnam', fixtureProgress(), now, () => 0.42)
  expect(plan.scoredQuestions).toHaveLength(5)
  expect(plan.scoredQuestions.filter((q) => q.bucket === 'target')).toHaveLength(2)
  expect(plan.scoredQuestions.filter((q) => q.bucket === 'neighbor')).toHaveLength(2)
  expect(plan.scoredQuestions.filter((q) => q.bucket === 'review')).toHaveLength(1)
})

it('복습 대상이 없으면 낮은 숙련도 지역으로 채운다', () => {
  const plan = buildCourse('gyeonggi:suwon', emptyProgress(), now, () => 0.1)
  expect(plan.scoredQuestions).toHaveLength(5)
  expect(new Set(plan.scoredQuestions.map((q) => q.regionId)).size).toBe(5)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/game/courseGenerator.test.ts`
Expected: FAIL because course generator does not exist.

- [ ] **Step 3: Implement minimal deterministic generator**

Select the target and its `neighborIds` from the catalog, sort review candidates by due date then stage, remove duplicate region IDs, and use the supplied `random` only to shuffle candidates with equal priority. Select question types based on stage: recognition first, map selection next, silhouette and text recall at stage 2+.

- [ ] **Step 4: Implement confirmation questions and limits**

Return at most two wrong questions as `scored: false`, preserve the same region and answer, and never add them to the 5 scored questions. Add tests for duplicate neighbors, an empty neighbor list, and a cross-pack Seoul neighbor.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run src/game/courseGenerator.test.ts`
Expected: PASS.

```bash
git add seoul-district-quiz/src/game/courseGenerator.ts seoul-district-quiz/src/game/courseGenerator.test.ts
git commit -m "feat: generate target neighbor review courses"
```

### Task 5: Personal record V2 and V1 migration

**Files:**
- Modify: `seoul-district-quiz/src/game/personalRecords.ts`
- Modify: `seoul-district-quiz/src/game/personalRecords.test.ts`
- Modify: `seoul-district-quiz/src/hooks/usePersonalRecords.ts`
- Create: `seoul-district-quiz/src/hooks/useLearningProgress.ts`

**Interfaces:**
- Produces `PersonalRecordsV2`, `parsePersonalRecords`, `migratePersonalRecordsV1`, `recordRegionAnswer`, `recordCourseCompleted`, `getDailyStreak`, and `useLearningProgress()`.
- Keeps `loadPersonalRecords(storage)` and `savePersonalRecords(records, storage)` injectable for tests.

- [ ] **Step 1: Write migration and persistence tests**

```ts
it('V1 서울 기록을 V2 지역 진행도로 이전한다', () => {
  const v2 = migratePersonalRecordsV1({
    version: 1,
    fastestPerfectSetMs: { choice: 21500, text: null },
    currentCorrectStreak: 3,
    bestCorrectStreak: 5,
    masteredDistricts: ['마포구', '없는구'],
  })
  expect(v2.progressByRegion['seoul:mapo'].stage).toBe(1)
  expect(v2.bestCombo).toBe(5)
  expect(v2.dailyStreak.current).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/game/personalRecords.test.ts`
Expected: FAIL because V2 schema and migration do not exist.

- [ ] **Step 3: Implement V2 parser and migration**

Add `version: 2`, `progressByRegion`, `dailyStreak`, `combo`, and preserved fastest records. Convert only valid V1 district names to stable Seoul IDs, keep valid records when individual entries are malformed, and never infer historical daily streak dates.

- [ ] **Step 4: Implement queued Storage writes**

Reuse the existing write queue, update records optimistically, surface save failures, and ensure a load failure still permits a session without silently claiming persistence. Add tests for repeated migration, malformed V2 fields, and Storage failures.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run src/game/personalRecords.test.ts`
Expected: PASS.

```bash
git add seoul-district-quiz/src/game/personalRecords.ts seoul-district-quiz/src/game/personalRecords.test.ts seoul-district-quiz/src/hooks/usePersonalRecords.ts seoul-district-quiz/src/hooks/useLearningProgress.ts
git commit -m "feat: migrate records to regional learning progress"
```

### Task 6: Shared interactive map and region picker

**Files:**
- Create: `seoul-district-quiz/src/components/RegionPackMap.tsx`
- Create: `seoul-district-quiz/src/components/RegionPicker.tsx`
- Modify: `seoul-district-quiz/src/components/SeoulDistrictMap.tsx`
- Modify: `seoul-district-quiz/src/App.css`

**Interfaces:**
- `RegionPackMap({ packId, detail, activeRegionId, selectedRegionId, solvedRegionIds, adjacentRegionIds, result, interactive, onRegionSelect })`.
- `RegionPicker({ selectedPackId, selectedRegionId, onPackChange, onRegionSelect, onStart })`.
- Existing `SeoulDistrictMap` callers remain valid through a compatibility wrapper until `App.tsx` is migrated.

- [ ] **Step 1: Add component-level tests for accessible selection**

Add a component test that renders a 경기 overview and asserts the top-level count, semantics, and keyboard behavior:

```tsx
it('경기 개요 지도는 시군 버튼과 목록 대체 경로를 제공한다', async () => {
  render(<RegionPackMap packId="gyeonggi" detail="overview" interactive onRegionSelect={onSelect} />)
  const buttons = screen.getAllByRole('button')
  expect(buttons).toHaveLength(31)
  expect(buttons[0]).toHaveAccessibleName(/시|군/u)
  await userEvent.keyboard('{Enter}')
  expect(onSelect).toHaveBeenCalled()
})
```

Assert that the overview SVG does not contain child district IDs and that the CSS hit area is at least 44px in the rendered test fixture.

- [ ] **Step 2: Implement geometry loading states**

Reuse the existing loading/error/retry pattern. Show region-name list search when SVG loading fails. Expose a live caption describing active, selected, solved, and adjacent states.

- [ ] **Step 3: Implement SVG state styling**

Use the existing design tokens for idle, active, correct, incorrect, solved, adjacent, and selected states. Preserve vector viewBox, avoid clipping labels, and use a detail view only for the selected city’s child districts.

- [ ] **Step 4: Implement region picker**

Provide 서울/경기 tabs, Korean search, overview map selection, and a list fallback. Show 세부 코스 badges for 수원·성남·용인 without calling them a ranking or recommendation.

- [ ] **Step 5: Run lint and existing tests**

Run: `npm run lint && npm test`
Expected: PASS with the existing Seoul map behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add seoul-district-quiz/src/components/RegionPackMap.tsx seoul-district-quiz/src/components/RegionPicker.tsx seoul-district-quiz/src/components/SeoulDistrictMap.tsx seoul-district-quiz/src/App.css
git commit -m "feat: render Seoul Gyeonggi interactive boundary maps"
```

### Task 7: App flow, daily review home, and completion UI

**Files:**
- Modify: `seoul-district-quiz/src/App.tsx`
- Modify: `seoul-district-quiz/src/App.css`
- Modify: `seoul-district-quiz/src/data/districts.ts`

**Interfaces:**
- App consumes `buildCourse`, `useLearningProgress`, and `RegionPicker`.
- App produces screen states: `home`, `region-picker`, `course`, `complete`, and existing `collection`, `records`, `typing` compatibility states.

- [ ] **Step 1: Write flow tests for the observable state machine**

Add a flow test for due-review priority and a second test for the existing Seoul route:

```tsx
it('복습 대상이 있으면 홈의 첫 CTA가 오늘의 5문제다', () => {
  render(<App initialRecords={recordsWithDueReview('gyeonggi:seongnam')} />)
  expect(screen.getByRole('button', { name: '오늘의 5문제' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '새 지역 찾아보기' })).toBeInTheDocument()
})

it('서울 25구 타자 도전 진입점은 계속 노출된다', async () => {
  render(<App initialRecords={emptyRecords()} />)
  await userEvent.click(screen.getByRole('button', { name: '새 지역 찾아보기' }))
  await userEvent.click(screen.getByRole('tab', { name: '서울' }))
  expect(screen.getByRole('button', { name: /25구 타자/u })).toBeInTheDocument()
})
```

Also assert that submitting a course answer updates `RegionProgress`, completion returns to the home state, and confirmation questions do not change `stage`.

- [ ] **Step 2: Implement home changes**

Show today’s due count, recent region, 서울/경기 progress side by side, `오늘의 5문제` primary CTA when due work exists, and `새 지역 찾아보기` as the fallback primary CTA when no due work exists.

- [ ] **Step 3: Implement course session state**

Replace static `QUESTIONS_BY_MODE` selection for new regional courses with `CoursePlan`. Keep answer normalization, timer, hearts, XP, combo, feedback panel, and reduced-motion behavior. Record scored answers through `recordRegionAnswer` and confirmation questions without progress updates.

- [ ] **Step 4: Implement completion UI**

Show target-region mastery change, up to three areas to review, next review timing, and buttons for `오늘 학습 마치기`, `한 세트 더`, and `새 지역 찾아보기`. Keep the existing perfect-set records and wrong-answer review action available.

- [ ] **Step 5: Add copy and responsive styles**

Use concise Korean honorific copy, avoid blame and investment advice, keep CTA above the platform safe area, and ensure 320px layouts switch answer grids to one column.

- [ ] **Step 6: Run app checks and commit**

Run: `npm run lint && npm test && npm run build`
Expected: PASS; the build produces a valid `.ait` bundle.

```bash
git add seoul-district-quiz/src/App.tsx seoul-district-quiz/src/App.css seoul-district-quiz/src/data/districts.ts
git commit -m "feat: add regional review learning flow"
```

### Task 8: Analytics and haptic instrumentation

**Files:**
- Create: `seoul-district-quiz/src/analytics/events.ts`
- Create: `seoul-district-quiz/src/analytics/events.test.ts`
- Modify: `seoul-district-quiz/src/App.tsx`

**Interfaces:**
- Produces typed `trackRegionPackViewed`, `trackRegionSelected`, `trackCourseStarted`, `trackAnswerSubmitted`, `trackCourseCompleted`, `trackReviewPromptShown`, and `trackMapLoadFailed`.

- [ ] **Step 1: Write payload privacy tests**

```ts
it('분석 payload에는 주소나 원문 검색어가 들어가지 않는다', () => {
  const payload = createAnswerPayload({ regionId: 'gyeonggi:seongnam', questionType: 'adjacent', correct: true, stageBefore: 1 })
  expect(JSON.stringify(payload)).not.toMatch(/주소|검색어|임장 목적/u)
})
```

- [ ] **Step 2: Implement SDK wrappers**

Use the Apps in Toss Analytics screen/click/log APIs with the event names from the spec. Keep wrappers no-op-safe in browser tests. Call haptic success/error only when supported; never make learning dependent on haptic availability.

- [ ] **Step 3: Instrument App boundaries**

Track screen/pack selection, course start, scored answer, completion, review prompt, and map failures. Do not track typed answer text or free-form search text.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/analytics/events.test.ts && npm run lint`
Expected: PASS.

```bash
git add seoul-district-quiz/src/analytics/events.ts seoul-district-quiz/src/analytics/events.test.ts seoul-district-quiz/src/App.tsx
git commit -m "feat: instrument regional learning events"
```

### Task 9: Full verification and release checklist

**Files:**
- Modify: `seoul-district-quiz/README.md`
- Modify: `seoul-district-quiz/docs/design-guide.md` only if a hard rule needs a clarified implementation note.
- Test: all existing and new `*.test.ts` files.

- [ ] **Step 1: Run the complete verification suite**

Run: `npm run lint && npm test && npm run build`
Expected: all checks pass and `ait build` completes without missing map assets.

- [ ] **Step 2: Verify the data contract**

Run: `node scripts/build-region-maps.mjs --check`
Expected: the command reports 31 경기 top-level regions, all detailed IDs, symmetric adjacency, cross-pack edges, and non-empty source metadata, then exits 0.

- [ ] **Step 3: Verify manual flows in browser**

Check a fresh user, a V1 migrated user, a user with due reviews, a failed map load, a failed Storage save, 320px width, keyboard navigation, reduced motion, and a full 5-question completion.

- [ ] **Step 4: Update README with current commands**

Document `npm run dev`, `npm test`, `npm run lint`, and `npm run build`, plus the map source/license maintenance rule.

- [ ] **Step 5: Commit verification documentation**

```bash
git add seoul-district-quiz/README.md seoul-district-quiz/docs/design-guide.md
git commit -m "docs: record regional learning verification"
```

## Self-Review Checklist

- Spec coverage: Tasks 1–2 cover region hierarchy, 31-city geometry, shared SVG source, adjacency, and accessibility; Tasks 3–5 cover spaced review, 2·2·1 courses, V1 migration, and Storage; Tasks 6–8 cover UI, error states, analytics, and haptic; Task 9 covers testing and release checks.
- Placeholder scan: no `TBD`, `TODO`, or unspecified “add validation” steps are used; each task names files, interfaces, tests, commands, and expected results.
- Type consistency: `RegionProgress`, `CoursePlan`, `PersonalRecordsV2`, and map component interfaces are introduced before downstream tasks consume them.
- Scope: the plan deliberately excludes prices, recommendations, login sync, notifications, advertising, payments, leagues, and non-Seoul/Gyeonggi packs.
