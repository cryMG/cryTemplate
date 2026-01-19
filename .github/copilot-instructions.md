# Copilot Instructions (crytemplate)

## Project overview

*crytemplate* is a lightweight, safe-by-default string template engine written in TypeScript (ESM). It supports:

- Interpolations (`{{ ... }}`), optional raw output (`{{- ... }}`)
- Minimal control flow (`{% if %}`, `{% each %}`)
- A filter pipeline (`{{ value | trim | upper }}`)

A core design goal is **predictable output without arbitrary code execution**.

## MUST rules

- **Never add template features that enable code execution** (no `eval`, no `new Function`, no function calls from templates).
- **Keep resolution safe**: do not read from prototypes and do not execute getters/setters while resolving keys.
- **Do not introduce runtime dependencies** unless explicitly requested. This library aims for **zero runtime deps**.
  - Dev-only tooling deps are fine when needed (tests/build), but keep them minimal.
  - Day.js integration is optional via a reference setter; do not require/import Day.js at runtime.
- **Keep ESM/CJS/browser outputs working**. Public API changes should be deliberate and backwards-compatible.
- **Use English for code, comments, and documentation**.
- **Keep the pages up to date** with new features and syntax.

## Coding conventions

- Follow the existing TypeScript style and the configured ESLint rules (`@crycode/eslint-config`).
- Prefer small, focused functions with clear names.
- Avoid clever parsing tricks that reduce auditability; readability and security take priority.
- Preserve existing public APIs and behavior unless the change request explicitly requires breaking changes.

## Security expectations

When working on parsing/rendering/runtime:

- Templates must remain a restricted, non-Turing-complete language.
- Fail safe: malformed/unsupported tokens should degrade to literal text (or empty output where appropriate), not throw at runtime.
- Avoid side effects during rendering (no hidden execution paths).

If you add security-related behavior, add/adjust tests to lock it in.

## Commands (use npm scripts)

Prefer the repo’s scripts:

- Build: `npm run build`
- Typecheck: `npm run check`
- Lint: `npm run lint`
- Tests + coverage: `npm test`

## Testing guidelines

- Tests use Mocha + Chai (TypeScript via `tsx`).
- Add tests for:
  - New tokens/syntax/edge cases
  - Security regressions (prototype access, getters, call-like syntax)
  - Both “happy path” and malformed input
- Keep tests deterministic (avoid real time / locale differences unless explicitly handled).

## Pages

- The `pages/` folder contains a simple static site for documentation and demos to be deployed via GitHub Pages.
- Build the site with `npm run build-pages`.
- The site uses plain HTML/CSS/JS (no frameworks). Keep it lightweight and simple.
- Use the existing styles and layout components for consistency.

## Documentation

- Keep the README concise at the top (high-level guarantees) and put details in the relevant sections.
- Document syntax with small, copy-pastable examples.
