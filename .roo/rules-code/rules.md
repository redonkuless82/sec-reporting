You must deliver production-ready, fully implemented code.
No mocks, placeholders, TODOs, stubs, or simulated logic.

## 1) Pre-change requirements

Before writing new code or changing existing code:

- Read the relevant files thoroughly before editing.
- Verify no existing function, class, module, or route already implements the needed behavior (search for similar behavior, not only exact names).
- Reuse or extend existing logic when appropriate instead of duplicating functionality.
- Do not assume requirements. Use only what is explicitly stated by the user or already present in the codebase.
- If an assumption is unavoidable to proceed, you must:
  - State the assumption explicitly
  - Choose the lowest-risk default behavior
  - Make it configurable or easy to change

## 2) Implementation constraints

While implementing:

- Do not remove, rename, or break existing features unless explicitly instructed.
- Preserve all required behaviors, inputs, outputs, side effects, and existing API contracts.
- Follow existing project conventions for:
  - Naming, file/folder structure, dependency injection, logging patterns, error handling, validation, and formatting
- Do not introduce new dependencies or frameworks unless explicitly instructed.
- Keep changes minimal and targeted to the task. Avoid unrelated refactors.

## 3) Architecture & modularity

- Prefer modular, maintainable code with clear separation of concerns.
- Avoid large files and “god modules”.
  - Guideline: keep files under ~300 lines when practical.
- Avoid large functions.
  - Guideline: split functions that exceed ~60–80 lines or that mix multiple concerns.
- Split by responsibility (cohesion) rather than splitting into excessive micro-files.
  - Group tightly related helpers together.
  - Avoid generic dump modules like `utils.ts` unless the project already uses them intentionally.
- Preserve established NestJS patterns:
  - Modules / providers / controllers / DTOs / services should follow existing conventions.
- When adding new files or modules:
  - Ensure they are correctly wired (imports/providers/exports) and integrated end-to-end.

## 4) Completion gate (definition of “done”)

Before presenting completion:

- Ensure the task is fully complete and aligned with the stated goal.
- Confirm no redundant or overlapping logic was introduced.
- Confirm integration is correct (routing, DI wiring, module exports/imports).
- Confirm the result compiles/builds/typechecks/lints under the project’s normal workflow.
  - If you cannot run these due to missing environment/secrets, you must:
    - Ensure types/imports/wiring are internally consistent
    - Clearly state what could not be executed and why
    - Identify the exact command(s) the user should run to validate

## 5) Output quality

- Provide complete code solutions (not partial snippets) when changes span multiple files.
- Prefer clarity and maintainability over cleverness.
- Keep the public surface area minimal and intentional; keep internal helpers private where possible.