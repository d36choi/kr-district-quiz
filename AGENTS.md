# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains the product specification in `design.md`. Treat it as the source of truth for quiz rules, screen states, visual tokens, accessibility, and success metrics.

No application source, tests, or asset directories exist yet. When implementation begins, keep the root uncluttered and use predictable locations such as `src/` for application code, `src/components/` for reusable UI, `src/assets/` for maps and images, and `tests/` (or colocated `*.test.*` files) for automated tests. Place Seoul district data in a dedicated module rather than embedding it in view components.

## Build, Test, and Development Commands

There is no package manifest or build system yet, so no project commands are currently available. Do not document or depend on commands until their tooling is committed. After adding a toolchain, expose standard scripts and update this guide, for example:

- `npm run dev` — start the local development server.
- `npm test` — run the automated test suite.
- `npm run build` — create a production build.
- `npm run lint` — check formatting and static-analysis rules.

## Coding Style & Naming Conventions

Follow the formatter and linter configured by the eventual toolchain. Until then, use two-space indentation for JavaScript, TypeScript, JSON, CSS, and YAML. Prefer TypeScript for application logic. Use `PascalCase` for components, `camelCase` for functions and variables, and `kebab-case` for asset filenames. Keep Korean user-facing copy centralized and match the wording in `design.md`.

## Testing Guidelines

Add tests with each implemented behavior. Prioritize answer normalization (including optional `구`), XP and combo rules, heart recovery, five-question progress, and district-selection accessibility. Name tests after observable behavior, such as `answer-normalization.test.ts`. New logic should include success, failure, and boundary cases.

## Commit & Pull Request Guidelines

The repository has no commit history, so no established convention exists. Use short imperative subjects, optionally with Conventional Commit prefixes, such as `feat: add district answer normalization`.

Pull requests should include a clear summary, validation steps, and linked issues. Include screenshots or recordings for UI changes, and note any intentional departure from `design.md`. Keep changes focused and avoid mixing unrelated refactors with feature work.
