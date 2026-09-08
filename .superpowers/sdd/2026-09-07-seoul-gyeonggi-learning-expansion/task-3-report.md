# Task 3 report: progress stages and spaced review

## RED

Command (from `seoul-district-quiz/`):

```text
npm test -- --run src/game/progress.test.ts
```

Result: failed as expected because `src/game/progress.ts` did not exist (`Cannot find module './progress'`).

## GREEN

Implemented `ProgressStage`, serializable `RegionProgress`, stage transitions, review scheduling, due checks, and optional session-aware promotion in `src/game/progress.ts`. Added focused behavior tests in `src/game/progress.test.ts`.

Commands and results:

```text
npm test -- --run src/game/progress.test.ts   # 1 file, 5 tests passed
npm run lint                                  # passed
npm test                                      # 6 files, 45 tests passed
npm run build                                 # passed; Vite and AIT bundle built
```

## Edge cases covered

- Stage 0 does not schedule a review; incorrect answers never go below stage 0.
- Correct answers use 1, 3, 7, and 21 calendar-day intervals; stage 4 remains capped at 4 and uses 21 days.
- Calendar-day addition uses the intended local offset and stores canonical UTC ISO instants (`Z`), including a KST midnight and near-midnight boundary.
- Due status is false immediately before the instant and true at the exact due instant.
- Two correct answers in one identified session can reach stage 2, but stage 3 requires a later session; the last promotion session is serializable.
- Three-argument `applyScoredAnswer` calls remain valid for compatibility.

## Self-review

- Module has no Storage, UI, or framework dependency and does not mutate its input.
- Attempts, correct-answer count, last-answer time, and next-review time update only for scored answers through `applyScoredAnswer`.
- Invalid dates fail explicitly with `RangeError`; all generated timestamps use `Date#toISOString()`.
- `git diff --check`, focused tests, full tests, lint, and build passed.

## Concerns

- A JavaScript `Date` does not retain its source timezone. Date objects default to the app's KST calendar context; explicit date strings with an offset preserve that offset when adding calendar days.

## Fix round 1: session-boundary regression

### RED

Added regression tests for sessionless promotion caps, same-session stage 3→4 blocking, and legacy stage 2/3 records without session metadata.

```text
npm test -- --run src/game/progress.test.ts
```

Result: failed 3 tests as expected. The existing implementation promoted sessionless 2→3 and promoted the first identified answer on legacy stage 2/3.

### GREEN

Sessionless correct answers now stop at stage 2 when a promotion would enter stage 3+. Identified sessions are recorded at stages 1/2, and a legacy stage 2/3 record first establishes a baseline session without high-stage promotion. Same-session high-stage attempts remain scored and rescheduled at the retained stage.

```text
npm test -- --run src/game/progress.test.ts   # 1 file, 9 tests passed
npm run lint                                  # passed
npm test                                      # 6 files, 49 tests passed
npm run build                                 # passed; Vite and AIT bundle built
```

The input progress object remains immutable. The fix is committed in git history as `fix: enforce spaced review session boundaries`.
