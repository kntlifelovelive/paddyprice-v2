# AGENTS.md — Global Development Rules for Paddy Project V2

> **This is the primary instruction file for AI-assisted development on Paddy Project
> V2.** Any AI coding agent working in this repository MUST read and follow this
> document before making changes. It is the top-level authority on *how* to work in
> this repository.

## 1. Project context

- Paddy Project V2 is an **architectural rebuild** of the existing, working Paddy
  Project. It is **not a feature expansion**.
- V2 must **preserve the existing product features and business behavior**.
- The current Paddy Project is a **behavioral reference only**:
  - Use it to understand existing behavior.
  - **Never** modify it from any V2 task.
- **Do not add new features** unless explicitly requested.
- **Do not invent business rules.** Paddy business rules and calculations come from
  `docs/DOMAIN_RULES.md`.

## 2. Documentation hierarchy

The hierarchy below is authoritative. For business behavior, precedence is:
`docs/DOMAIN_RULES.md` > `docs/PROJECT_SPEC.md` > `docs/REFERENCE_NOTES.md`.

| Document | Role |
| --- | --- |
| `AGENTS.md` | Global development rules and AI coding workflow (this file) |
| `docs/DOMAIN_RULES.md` | **Authoritative** Paddy business rules and calculations |
| `docs/PROJECT_SPEC.md` | V2 feature requirements and expected behavior |
| `docs/REFERENCE_NOTES.md` | Current project behavior / reference information |
| `docs/ARCHITECTURE.md` | V2 module boundaries, structure, and dependency rules |

Interpretation rules:

- Business calculations MUST come from `docs/DOMAIN_RULES.md`. Never invent formulas,
  rounding, or thresholds.
- Feature expectations come from `docs/PROJECT_SPEC.md`.
- When behavior is unclear, read `docs/REFERENCE_NOTES.md` first, then inspect the
  reference project's code **before** making assumptions.
- If documentation is missing or stale, report it instead of inventing answers.

## 3. Scope control

- Make the **smallest change required** to complete the task.
- No unnecessary feature additions and no scope creep.
- No unrelated refactoring. Refactor only when the task explicitly requires it.
- Preserve existing behavior unless the task explicitly changes it.
- If completing the task would require touching files outside its stated scope, stop
  and report instead of expanding scope silently.

## 4. Architecture and separation of concerns

V2 uses a **feature-oriented structure** with domain and infrastructure separation.
Detailed layout lives in `docs/ARCHITECTURE.md`. The mandatory separation rules are:

- **Business/domain logic MUST NOT depend** on React, SQLite, Capacitor, Electron,
  UI, or any framework/infrastructure code.
- **UI components MUST NOT contain** core Paddy business calculations.
- **Database/SQL code MUST stay** inside the `infrastructure` db layer.
- **Platform-specific code MUST stay** inside `infrastructure/platform`.
- **Shared code MUST remain** generic and reusable.
- **Services** coordinate domain + infrastructure; they do not re-implement business
  rules.
- Keep the architecture simple and appropriate for this application.

## 5. Dependency direction

Allowed dependency edges (a row's layer may depend on the layers in the second column):

| Layer | May depend on | Must NOT depend on |
| --- | --- | --- |
| `app` | features, domain, infrastructure, services, shared | — |
| `features` | domain, services, infrastructure, shared | other `features` |
| `services` | domain, shared, infrastructure | features, app, UI |
| `infrastructure` | domain (types), shared | features, services, app, UI |
| `domain` | shared (types only) | React, SQLite, Capacitor, Electron, UI, infrastructure, services, features, app |
| `shared` | nothing project-internal | any other layer |

Forbidden edges:

- `domain` → any UI / SQLite / Capacitor / Electron / infrastructure code.
- `infrastructure` → `features`.
- `features` → other `features` (share via `shared`/`services`/`domain` instead).
- `shared` → any project layer (shared stays standalone, generic, reusable).
- UI components re-implementing business calculations.

## 6. Do NOT introduce

Do **not** introduce unnecessary patterns such as: Clean Architecture ceremony, DDD,
CQRS, Event Sourcing, Redux, dependency-injection containers, or microservices.

## 7. Prefer instead

- React + TypeScript
- Feature-oriented structure
- Pure domain functions
- Zustand for shared state only; local `useState` otherwise
- DAO / data-access functions for SQLite
- Platform adapters wherever platform differences exist
- Small focused services
- Small focused components

## 8. Domain / business logic

- Domain modules contain pure TypeScript functions, types, and calculation rules.
- Domain functions MUST be **pure, deterministic, and unit-testable** — no I/O, no
  side effects, no platform or UI imports.
- Paddy calculation functions implement the rules in `docs/DOMAIN_RULES.md` and
  nothing else. No invented formulas, constants, or thresholds.
- UI reads results from domain functions; it never re-derives calculation rules.

## 9. Feature boundaries

- Each feature is a self-contained module under `features/` with its own components,
  hooks, store slices, data-access usage, and tests.
- Features MUST NOT import other features. Shared functionality moves to `shared`
  (generic), `services` (orchestration), or `domain` (business rules).

## 10. Infrastructure boundaries

- All SQLite / SQL code stays inside the `infrastructure` db layer.
- Data access is exposed through small DAO / data-access functions that return plain
  data to callers.
- Platform-specific code (Capacitor, Electron, web storage, filesystem, notifications)
  stays inside `infrastructure/platform` and is used through small platform-adapter
  interfaces.
- Business logic never branches on the platform.

## 11. State management

- Default to local component state (`useState`, hooks).
- Use **Zustand** only for state genuinely shared across multiple parts of the app.
- Do NOT put everything in global stores. No Redux.
- Store state shapes follow `domain` types.

## 12. Shared code

- `shared` holds generic utilities, constants, and types used across features.
- Shared code must remain framework-light, generic, and reusable.
- Extract duplication into `shared` (or `domain`/`services`, as appropriate) instead
  of copying code.

## 13. Code quality

- Prefer simple, functional TypeScript/React patterns.
- Avoid unnecessary design patterns and over-engineering.
- Keep modules focused on one clear responsibility.
- Avoid large God components and monolithic services.
- Keep business calculations pure and testable.
- Use existing utilities/services instead of duplicating logic.

## 14. AI-assisted development workflow

Before implementing a feature or change, an AI agent MUST:

1. Read `AGENTS.md` (this file).
2. Read the relevant docs: `docs/PROJECT_SPEC.md`, `docs/DOMAIN_RULES.md`,
   `docs/REFERENCE_NOTES.md`, `docs/ARCHITECTURE.md` as applicable.
3. Inspect existing code **before** creating new abstractions.
4. Prefer existing utilities/services over duplication.
5. Report uncertainty instead of inventing behavior — ask or flag when requirements
   are ambiguous.
6. Give the smallest implementation that satisfies the task.

## 15. Change discipline

- Make the smallest change required.
- Do not modify unrelated files.
- Do not introduce new dependencies without justification.
- Do not silently change existing business behavior.
- Keep diffs focused and reviewable.

## 16. Verification and testing

- Run build / typecheck / tests when appropriate, using the project's existing scripts
  and conventions.
- Report failures clearly; do not hide or ignore them.
- Do not modify business logic merely to make tests pass.
- Unit-test domain calculations against `docs/DOMAIN_RULES.md`.
- If a change cannot be verified, say so explicitly.

## 17. Summary

1. V2 is an architectural rebuild — preserve existing behavior and features.
2. Read the docs and inspect the reference project before assuming anything.
3. Domain is pure; infrastructure lives at the edges.
4. Keep everything small, focused, and simple.
5. When in doubt, check the reference project — never invent business rules or
   features.
