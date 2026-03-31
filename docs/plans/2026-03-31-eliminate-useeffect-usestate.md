# Eliminate useEffect/useState — Atom-Only Reactivity

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove every `useEffect` and `useState` from `apps/editor/src/`, replacing them with `effect-atom` atoms and `atom-react` hooks, then add an ESLint rule to ban them permanently.

**Architecture:** All reactive state lives in atoms (`Atom.make`, `Atom.kvs`, `Atom.fn`, etc.). React components subscribe via `useAtomValue`, `useAtom`, `useAtomSet`. Side effects that would use `useEffect` become atom computations with `get.addFinalizer` for cleanup, or `Atom.fn` for imperative triggers. The `appRegistry` singleton (in `apps/editor/src/lib/atom-registry.ts`) is used for imperative reads/writes from non-React code.

**Tech Stack:** `@effect-atom/atom`, `@effect-atom/atom-react`, `effect`, `eslint` with `no-restricted-imports` + `no-restricted-syntax`

**Key atom-react hooks reference:**
- `useAtomValue(atom)` — read-only subscription
- `useAtom(writable)` — `[value, set]` tuple
- `useAtomSet(writable)` — write-only
- `useAtomMount(atom)` — mount an atom (trigger its computation) without reading
- `useAtomSubscribe(atom, callback)` — subscribe with side-effect callback
- `useAtomRefresh(atom)` — get a `() => void` to force recomputation

---

## Files with useEffect/useState

| File | useState | useEffect | Strategy |
|------|----------|-----------|----------|
| `routes/index.tsx` | `newName` (input) | — | `Atom.make("")` for input state |
| `hooks/use-project-doc.ts` | `ready` | persistence sync | Atom that resolves from `IndexeddbPersistence.synced` |
| `hooks/use-frame-image.ts` | `image` | blob fetch | `Atom.family` keyed on `contentHash`, returns `Result<HTMLImageElement>` |
| `routes/project.$id.tsx` | `canvasSize`, `timelineWidth` | ResizeObserver x2, hotkey registration | Atoms for element sizes, atom for hotkeys |
| `components/frame-drop-zone.tsx` | `dragOver` | — | `Atom.make(false)` for drag state |
| `components/timeline.tsx` | `zoomLevel`, `isScrubbing` | global mouse events, wheel zoom | Atoms for zoom/scrub, atom with `addFinalizer` for global listeners |

---

### Task 1: Add ESLint with useEffect/useState ban

**Files:**
- Create: `apps/editor/eslint.config.js`
- Modify: `apps/editor/package.json`

**Step 1: Create ESLint config**

```js
// apps/editor/eslint.config.js
export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "react",
            importNames: ["useEffect", "useState"],
            message: "Use effect-atom instead. See CLAUDE.md → effect-atom docs.",
          },
        ],
      }],
    },
  },
]
```

**Step 2: Add eslint devDependency and lint script**

Add to `apps/editor/package.json` devDependencies: `"eslint": "^9.0.0"`
Add script: `"lint": "eslint src/"`

**Step 3: Run lint to see all violations**

Run: `cd apps/editor && npx eslint src/ 2>&1 | head -60`
Expected: errors in all 6 files listed above

**Step 4: Commit**

```
chore(editor): add eslint with useEffect/useState ban
```

---

### Task 2: Convert `routes/index.tsx` — input state atom

**Files:**
- Modify: `apps/editor/src/routes/index.tsx`

The `newName` input state becomes a `Writable<string>` atom. Use `useAtom` for `[value, set]`.

**Step 1: Replace useState with atom**

Replace the `useState("")` with a module-level atom and `useAtom`:

```tsx
import { Atom } from "@effect-atom/atom"
import { useAtom, useAtomValue } from "@effect-atom/atom-react/Hooks"

const newNameAtom = Atom.make("")

function ProjectListPage() {
  const { projects, createProject, deleteProject } = useProjectIndex()
  const navigate = useNavigate()
  const [newName, setNewName] = useAtom(newNameAtom)
  // ... rest unchanged, setNewName("") works, setNewName(e.target.value) works
}
```

Remove `useState` from imports.

**Step 2: Verify typecheck**

Run: `cd apps/editor && npx tsc --noEmit`

**Step 3: Commit**

```
refactor(editor): replace useState with atom in project list input
```

---

### Task 3: Convert `components/frame-drop-zone.tsx` — drag state atom

**Files:**
- Modify: `apps/editor/src/components/frame-drop-zone.tsx`

The `dragOver` boolean becomes a local `Atom.make(false)`. Since this is component-scoped UI state (one drop zone at a time), a module-level atom is fine.

**Step 1: Replace useState with atom**

```tsx
import { Atom } from "@effect-atom/atom"
import { useAtom, useAtomValue } from "@effect-atom/atom-react/Hooks"

const dragOverAtom = Atom.make(false)

export function FrameDropZone(props: { ... }) {
  const [dragOver, setDragOver] = useAtom(dragOverAtom)
  // ... rest unchanged
}
```

Remove `useState` from imports. Keep `useCallback` (it's fine — it's not useState/useEffect).

**Step 2: Verify typecheck**

Run: `cd apps/editor && npx tsc --noEmit`

**Step 3: Commit**

```
refactor(editor): replace useState with atom in frame drop zone
```

---

### Task 4: Convert `hooks/use-project-doc.ts` — persistence ready atom

**Files:**
- Modify: `apps/editor/src/hooks/use-project-doc.ts`

The `ready` state tracks `IndexeddbPersistence.synced`. Replace with an atom per project that listens for the `synced` event.

**Step 1: Replace useState/useEffect with atom**

```ts
import { useMemo } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { createProjectDoc, ProjectId } from "@nur/core"
import type { YDocumentRoot } from "effect-yjs"
import type { ProjectDoc } from "@nur/core"
import type * as Y from "yjs"
import * as S from "effect/Schema"

const parseProjectId = S.decodeSync(ProjectId)

const cache = new Map<string, ReturnType<typeof createProjectDoc> & { readyAtom: Atom.Atom<boolean> }>()

function getProjectDoc(projectId: string) {
  let entry = cache.get(projectId)
  if (!entry) {
    const id = parseProjectId(projectId)
    const doc = createProjectDoc(id)
    const readyAtom = Atom.make((get) => {
      if (doc.persistence.synced) return true
      const handler = () => get.setSelf(true)
      doc.persistence.once("synced", handler)
      get.addFinalizer(() => doc.persistence.off("synced", handler))
      return false
    })
    entry = { ...doc, readyAtom }
    cache.set(projectId, entry)
  }
  return entry
}

export function useProjectDoc(projectId: string): {
  root: YDocumentRoot<ProjectDoc>
  doc: Y.Doc
  ready: boolean
} {
  const entry = useMemo(() => getProjectDoc(projectId), [projectId])
  const ready = useAtomValue(entry.readyAtom)
  return { root: entry.root, doc: entry.doc, ready }
}
```

Remove `useState`, `useEffect` from imports.

**Step 2: Verify typecheck**

Run: `cd apps/editor && npx tsc --noEmit`

**Step 3: Commit**

```
refactor(editor): replace useState/useEffect with atom in use-project-doc
```

---

### Task 5: Convert `hooks/use-frame-image.ts` — image loading atom family

**Files:**
- Modify: `apps/editor/src/hooks/use-frame-image.ts`
- Modify: `apps/editor/src/lib/frame-image-cache.ts`

Replace the useState/useEffect with an `Atom.family` keyed on `contentHash` that returns `Result<HTMLImageElement>`. The atom runs an Effect to load from BlobStore and decode.

**Step 1: Rewrite frame-image-cache.ts**

Keep the `decodeImage` helper. Replace the imperative cache with an `Atom.family`:

```ts
import * as Effect from "effect/Effect"
import { Atom } from "@effect-atom/atom"
import { BlobStore } from "@nur/object-store"
import { AppBlobStore } from "./blob-store-layer"

const decodeImage = (data: Uint8Array): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const blob = new Blob([data])
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to decode image"))
    }
    img.src = url
  })

const storageRuntime = Atom.runtime(AppBlobStore)

export const frameImageAtom = Atom.family((contentHash: string) =>
  storageRuntime.atom(
    Effect.gen(function* () {
      const store = yield* BlobStore
      const data = yield* store.get(contentHash)
      if (!data) return yield* Effect.fail(new Error(`Blob not found: ${contentHash}`))
      return yield* Effect.promise(() => decodeImage(data))
    }),
  ).pipe(Atom.setIdleTTL("5 minutes")),
)
```

**Step 2: Rewrite use-frame-image.ts**

```ts
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import * as Result from "@effect-atom/atom/Result"
import { frameImageAtom } from "../lib/frame-image-cache"

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const result = useAtomValue(
    contentHash ? frameImageAtom(contentHash) : undefined!,
    (r) => (r && Result.isSuccess(r) ? r.value : undefined),
  )
  // When no contentHash, return undefined without subscribing
  if (!contentHash) return undefined
  return result
}
```

Wait — `useAtomValue` can't be called conditionally (hooks rules). Better approach: always subscribe to a "noop" atom or use the selector pattern differently.

Actually, re-reading the `useAtomValue` signature: `useAtomValue<A>(atom: Atom<A>): A` or `useAtomValue<A, B>(atom: Atom<A>, f: (a: A) => B): B`. It requires a non-null atom.

Better approach — make the atom handle `undefined` contentHash:

```ts
import { useMemo } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import * as Result from "@effect-atom/atom/Result"
import { frameImageAtom } from "../lib/frame-image-cache"

const noImageAtom = Atom.make(undefined as HTMLImageElement | undefined).pipe(Atom.keepAlive)

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const atom = useMemo(
    () => contentHash
      ? Atom.mapResult(frameImageAtom(contentHash), (img): HTMLImageElement | undefined => img)
      : noImageAtom,
    [contentHash],
  )
  return useAtomValue(atom, (v) => {
    if (v === undefined) return undefined
    if (Result.isSuccess(v)) return v.value
    return undefined
  })
}
```

Hmm, this is getting complex because the type differs. Simpler: just always subscribe to the family atom and handle the no-hash case:

```ts
import { useMemo } from "react"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import * as Result from "@effect-atom/atom/Result"
import { frameImageAtom } from "../lib/frame-image-cache"

// Sentinel atom for "no content hash" — always returns initial
const emptyAtom = Atom.make(Result.initial<HTMLImageElement, Error>()).pipe(Atom.keepAlive)

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const atom = useMemo(
    () => contentHash ? frameImageAtom(contentHash) : emptyAtom,
    [contentHash],
  )
  const result = useAtomValue(atom)
  return Result.isSuccess(result) ? result.value : undefined
}
```

Remove `useState`, `useEffect` from imports.

**Step 3: Verify typecheck**

Run: `cd apps/editor && npx tsc --noEmit`

**Step 4: Commit**

```
refactor(editor): replace useState/useEffect with atom family for frame images
```

---

### Task 6: Convert `components/timeline.tsx` — zoom, scrub, and listener atoms

**Files:**
- Modify: `apps/editor/src/components/timeline.tsx`

Three pieces of state: `zoomLevel`, `isScrubbing`, and two `useEffect`s for global mouse/wheel listeners.

**Step 1: Replace state atoms and listener effects**

```tsx
import { useRef, useCallback, useMemo } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtom, useAtomValue, useAtomMount } from "@effect-atom/atom-react/Hooks"
import { Stage, Layer, Rect, Text, Line } from "react-konva"

// ... interface and constants unchanged ...

const zoomLevelAtom = Atom.make(1)
const isScrubbingAtom = Atom.make(false)

export function Timeline(props: TimelineProps) {
  const { frameCount, currentFrame, onFrameSelect, width } = props
  const [zoomLevel, setZoomLevel] = useAtom(zoomLevelAtom)
  const [isScrubbing, setIsScrubbing] = useAtom(isScrubbingAtom)
  const containerRef = useRef<HTMLDivElement>(null)

  // ... cellWidth, totalWidth, positionToFrame, handleMouseDown unchanged ...

  // Global mouse events for scrubbing — atom with addFinalizer
  const scrubbingListenerAtom = useMemo(() =>
    Atom.make((get) => {
      const scrubbing = get(isScrubbingAtom)
      if (!scrubbing) return

      const handleMouseMove = (e: MouseEvent) => {
        onFrameSelect(positionToFrame(e.clientX))
      }
      const handleMouseUp = () => get.set(isScrubbingAtom, false)

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      get.addFinalizer(() => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      })
    }),
    [onFrameSelect, positionToFrame],
  )
  useAtomMount(scrubbingListenerAtom)

  // Ctrl+wheel zoom — atom with addFinalizer
  const wheelZoomAtom = useMemo(() =>
    Atom.make((get) => {
      const container = containerRef.current
      if (!container) return

      const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey) {
          e.preventDefault()
          const prev = get.once(zoomLevelAtom)
          const next = e.deltaY < 0
            ? Math.min(5, prev + 0.1)
            : Math.max(0.5, prev - 0.1)
          get.set(zoomLevelAtom, parseFloat(next.toFixed(1)))
        }
      }
      container.addEventListener("wheel", handleWheel, { passive: false })
      get.addFinalizer(() => container.removeEventListener("wheel", handleWheel))
    }),
    [],
  )
  useAtomMount(wheelZoomAtom)

  // ... frameCells, render unchanged ...
}
```

Remove `useState`, `useEffect` from imports.

**Step 2: Verify typecheck**

Run: `cd apps/editor && npx tsc --noEmit`

**Step 3: Commit**

```
refactor(editor): replace useState/useEffect with atoms in timeline
```

---

### Task 7: Convert `routes/project.$id.tsx` — resize observers and hotkeys

**Files:**
- Modify: `apps/editor/src/routes/project.$id.tsx`

Three `useState` + three `useEffect` to replace:
1. `canvasSize` + ResizeObserver → atom
2. `timelineWidth` + ResizeObserver → atom
3. Hotkey registration → atom with `addFinalizer`

**Step 1: Replace resize state with atoms**

```tsx
import { useRef, useCallback, useMemo } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtomValue, useAtomMount } from "@effect-atom/atom-react/Hooks"
// ... other imports unchanged, remove useState/useEffect ...

const canvasSizeAtom = Atom.make({ width: 0, height: 0 })
const timelineWidthAtom = Atom.make(0)

function ProjectEditorPage() {
  const { id } = Route.useParams()
  const { root, doc, ready } = useProjectDoc(id)
  const { currentFrame, setCurrentFrame } = useCurrentFrame(doc)
  const mainRef = useRef<HTMLDivElement>(null)
  const canvasSize = useAtomValue(canvasSizeAtom)
  const timelineWidth = useAtomValue(timelineWidthAtom)
  const timelineRef = useRef<HTMLDivElement>(null)

  // ... framesAtom, frames, frameCount, currentFrameData unchanged ...

  // Canvas resize observer atom
  const canvasResizeAtom = useMemo(() =>
    Atom.make((get) => {
      const el = mainRef.current
      if (!el) return
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) {
          get.set(canvasSizeAtom, {
            width: Math.floor(entry.contentRect.width),
            height: Math.floor(entry.contentRect.height),
          })
        }
      })
      observer.observe(el)
      get.addFinalizer(() => observer.disconnect())
    }),
    [],
  )
  useAtomMount(canvasResizeAtom)

  // Timeline width resize observer atom
  const timelineResizeAtom = useMemo(() =>
    Atom.make((get) => {
      const el = timelineRef.current
      if (!el) return
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) {
          get.set(timelineWidthAtom, Math.floor(entry.contentRect.width))
        }
      })
      observer.observe(el)
      get.addFinalizer(() => observer.disconnect())
    }),
    [],
  )
  useAtomMount(timelineResizeAtom)

  // Hotkey registration atom
  const hotkeyAtom = useMemo(() =>
    Atom.make((get) => {
      registerHotkeyContext({
        id: "editor",
        bindings: [
          {
            key: "ArrowRight",
            handler: () => setCurrentFrame(Math.min(currentFrame + 1, frameCount - 1)),
          },
          {
            key: "ArrowLeft",
            handler: () => setCurrentFrame(Math.max(currentFrame - 1, 0)),
          },
        ],
      })
      get.addFinalizer(() => unregisterHotkeyContext("editor"))
    }),
    [currentFrame, frameCount, setCurrentFrame],
  )
  useAtomMount(hotkeyAtom)

  // ... handleFilesSelected, render unchanged ...
}
```

Remove `useState`, `useEffect` from imports.

**Step 2: Verify typecheck**

Run: `cd apps/editor && npx tsc --noEmit`

**Step 3: Commit**

```
refactor(editor): replace useState/useEffect with atoms in project editor
```

---

### Task 8: Final verification — lint clean + tests pass

**Step 1: Run ESLint**

Run: `cd apps/editor && npx eslint src/`
Expected: 0 errors, 0 warnings

**Step 2: Run typecheck**

Run: `cd apps/editor && npx tsc --noEmit`
Expected: no errors

**Step 3: Run core tests**

Run: `cd packages/core && npx vitest run`
Expected: all tests pass

**Step 4: Commit any remaining fixes**

```
chore(editor): verify zero useEffect/useState lint compliance
```
