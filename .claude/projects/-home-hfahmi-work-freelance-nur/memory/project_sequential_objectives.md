---
name: NUR sequential objectives plan
description: 17-objective sequential build plan from zero to complete, prioritizing incremental value delivery. Prototype code is throwaway reference only.
type: project
---

NUR is being built from zero — the existing prototype in apps/web/ is reference material only, not being migrated.

**Why:** The prototype used multiple state management libraries (Jotai, Zustand, TinyBase, XState) that are all being replaced. Cleaner to start fresh with effect-yjs/effect-atom/effect-machine from day one.

**How to apply:** Never assume existing code in apps/web/ is the target. The new app lives in apps/editor/. Reference the prototype for domain logic patterns but don't copy its architecture. The full plan is in docs/plans/2026-03-26-sequential-objectives-design.md.
