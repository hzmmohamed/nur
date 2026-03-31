# NUR — Claude Code Guide

## Architecture & Design

- [ARCHITECTURE.md](ARCHITECTURE.md) — Monorepo structure, lens-based composition, data flow, storage tiers, migration plan

## UI Patterns

- [docs/resilient-ui-guide.md](docs/resilient-ui-guide.md) — Resilient UI: state handling, error classification, decision trees using effect-atom Result and effect-machine

## effect-atom (reactive state)

- [.agents/effect-atom/AGENTS.md](.agents/effect-atom/AGENTS.md) — Decision guide: which constructor/combinator to use, gotchas, type cheat sheet
- [.agents/effect-atom/PATTERNS.md](.agents/effect-atom/PATTERNS.md) — Copy-paste canonical patterns (fetch, mutation, optimistic, pagination, persistence, etc.)
- [.agents/effect-atom/API.md](.agents/effect-atom/API.md) — Exhaustive API reference: every method, type, and parameter

## effect-machine v3 (state machines)

- [.agents/effect-machine/SKILL.md](.agents/effect-machine/SKILL.md) — Quick reference: core pattern, key methods, actors, testing, critical gotchas
