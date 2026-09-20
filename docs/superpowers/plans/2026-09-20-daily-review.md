# Daily Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 만기 지역만 학습하는 오늘의 복습과 교정 반복, 하트 회복을 구현한다.

**Architecture:** 순수 게임 규칙은 `progress.ts`와 `courseGenerator.ts`에 둔다. `App.tsx`는 전용 복습 세션의 큐와 화면 상태만 조정하고 기존 일반 코스를 유지한다.

**Tech Stack:** React, TypeScript, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-20-daily-review-design.md`

## Global Constraints

- 첫 출시에는 광고 SDK를 추가하지 않는다.
- 사용자 문구는 한국어로 작성한다.
- 터치 타깃은 44px 이상을 유지한다.
- 복습 대상이 없을 때도 완료 상태를 제공한다.

## Review Focus

- 만기 지역이 5개 미만이면 새 지역으로 채우지 않는다.
- 복습 예정일이 같은 지역의 순서가 비결정적으로 흔들리지 않는다.
- 같은 날짜의 반복 답변으로 숙련도가 여러 번 변하지 않는다.
- 교정 정답이 최초 오답 통계를 덮어쓰지 않는다.
- 하트가 3개를 넘지 않는다.

---

### Task 1: 복습 일정과 전용 코스

**Files:**
- Modify: `seoul-district-quiz/src/game/progress.ts`
- Modify: `seoul-district-quiz/src/game/progress.test.ts`
- Modify: `seoul-district-quiz/src/game/courseGenerator.ts`
- Modify: `seoul-district-quiz/src/game/courseGenerator.test.ts`

**Interfaces:**
- Produces: `buildDueReviewCourse(progressByRegion, now): CoursePlan | undefined`

- [ ] 간격 1·3·7·14일과 현지 날짜 규칙의 실패 테스트를 작성한다.
- [ ] 오래 밀린 지역부터 최대 5개만 고르는 실패 테스트를 작성한다.
- [ ] 최소 구현 후 관련 테스트를 통과시킨다.

### Task 2: 홈 복습 진입점

**Files:**
- Modify: `seoul-district-quiz/src/App.tsx`
- Modify: `seoul-district-quiz/src/App.css`
- Modify: `seoul-district-quiz/src/App.test.tsx`

**Interfaces:**
- Consumes: `buildDueReviewCourse`

- [ ] 새 지역 CTA가 먼저이고 복습 카드에서 전용 세트를 시작하는 실패 테스트를 작성한다.
- [ ] 복습 대상이 없을 때 완료 문구를 검증하는 실패 테스트를 작성한다.
- [ ] UI와 진입 로직을 구현해 테스트를 통과시킨다.

### Task 3: 교정 반복과 하트 회복

**Files:**
- Modify: `seoul-district-quiz/src/App.tsx`
- Modify: `seoul-district-quiz/src/App.test.tsx`

**Interfaces:**
- Consumes: 전용 복습 세션의 문제 목록

- [ ] 복습 오답이 뒤로 재출제되는 실패 테스트를 작성한다.
- [ ] 최초 정답 10 XP, 교정 정답 5 XP와 하트 회복 실패 테스트를 작성한다.
- [ ] 최대 5회 반복 상태를 구현하고 전체 앱 테스트를 통과시킨다.

### Task 4: 검증과 문서

**Files:**
- Modify: `seoul-district-quiz/README.md`
- Modify: `AIT_RELEASE_CHECKLIST.md`

- [ ] 실제 제공 규칙을 README에 기록한다.
- [ ] 테스트, 린트, 빌드를 실행한다.
- [ ] 변경 사항을 검토하고 커밋한다.
