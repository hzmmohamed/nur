# Editor Atom Architecture

## Dependency Graph

```
projectDocCacheAtom [keepAlive]
│  Effect Cache with persistence.sync() in lookup
│  No consumer sees the Y.Doc until IndexedDB is fully hydrated
│
├─→ projectDocEntryAtom(projectId) [family]
│   │  Result<ProjectDocEntry> — the single entry point to Y.Doc data
│   │
│   ├─→ projectNameAtom(projectId) [family]
│   │     Reads: projectDocEntryAtom → lazily caches nameAtom from Y.Doc lens
│   │     Returns: Result<string | undefined>
│   │
│   ├─→ framesAtom(projectId) [family]
│   │     Reads: projectDocEntryAtom → lazily caches rawAtom from Y.Doc lens
│   │     Returns: Result<Frame[]> sorted by index
│   │     NOTE: may lag behind syncGet() during initial hydration
│   │
│   ├─→ currentFrameAtom(projectId) [family]
│   │     Reads: projectDocEntryAtom → awareness.currentFrameIndex.atom
│   │     Returns: Result<number>
│   │
│   ├─→ activeToolAtom(projectId) [family, in path-atoms.ts]
│   │     Reads: projectDocEntryAtom → awareness.local.focus("activeTool").atom()
│   │     Returns: Result<string> ("select" | "pen")
│   │
│   ├─→ activePathIdAtom(projectId) [family, in path-atoms.ts]
│   │     Reads: projectDocEntryAtom → awareness.local.focus("activePathId").atom()
│   │     Returns: Result<string | null>
│   │
│   └─→ canvasAtom(projectId) [family, keepAlive, in canvas-atom.ts]
│         Reads: canvasContainerAtom, projectDocEntryAtom
│         Subscribes: framesAtom, currentFrameAtom, activePathIdAtom, frameImageAtom
│         Owns: Konva Stage, image layer, paths layer, BezierPath instances
│         Initial setup uses root.focus("frames").syncGet() (bypasses framesAtom lag)
│
├─→ setCurrentFrameAtom(projectId) [family, fn]
│     Writes: awareness.currentFrameIndex.set(index)
│
├─→ setActiveToolAtom(projectId) [family, fn, in path-atoms.ts]
│     Writes: awareness.local.focus("activeTool").syncSet(tool)
│
└─→ setActivePathIdAtom(projectId) [family, fn, in path-atoms.ts]
      Writes: awareness.local.focus("activePathId").syncSet(pathId)

canvasContainerAtom(projectId) [family]
│  Writable<HTMLDivElement | null>
│  Set by ref callback in project.$id.tsx
│
└─→ canvasAtom (dependency)

editorHotkeyAtom(projectId) [family, keepAlive]
│  Side effect: registers hotkey bindings
│  Handlers read atoms via appRegistry.get() (no closures over React state)
│
└─→ reads: framesAtom, currentFrameAtom (in handlers, via appRegistry)

frameImageAtom(contentHash) [family, idleTTL 5min]
│  Effect: BlobStore.get → decodeImage
│  Returns: Result<HTMLImageElement>
│  No Y.Doc access
│
└─→ canvasAtom (subscribed per frame)

importFnAtom(projectId) [family, fn]
│  Uses: storageRuntime (AppBlobStore layer)
│  Reads: getProjectDoc() → projectDocCacheAtom (sync guaranteed)
│  Writes: Y.Doc frames, importProgressAtom, flushProjectDoc
│
└─→ importProgressAtom(projectId) [family]
      Writable<ImportProgress>
```

## File Locations

| File | Atoms |
|------|-------|
| `lib/project-doc-atoms.ts` | projectDocCacheAtom, projectDocEntryAtom, projectReadyAtom (deprecated), projectNameAtom, framesAtom, currentFrameAtom, setCurrentFrameAtom |
| `lib/path-atoms.ts` | activeToolAtom, activePathIdAtom, setActiveToolAtom, setActivePathIdAtom |
| `lib/canvas-atom.ts` | canvasContainerAtom, canvasAtom |
| `lib/frame-image-cache.ts` | frameImageAtom, emptyImageAtom |
| `lib/import-atoms.ts` | importFnAtom, importProgressAtom |
| `hooks/use-project-index.ts` | projectsAtom |
| `routes/project.$id.tsx` | editorHotkeyAtom |
| `routes/index.tsx` | newNameAtom |
| `components/timeline.tsx` | zoomLevelAtom, isScrubbingAtom |
| `components/frame-drop-zone.tsx` | dragOverAtom |
| `actors/hotkey-manager.ts` | activeContextIdAtom |

## Hydration Sequence

```
1. Router navigates to /project/:id
2. ProjectEditorPage reads projectsAtom (localStorage) → project exists?
3. ProjectEditorPage reads projectDocEntryAtom(id)
   → Cache lookup fires:
     a. createProjectDoc(id) → new Y.Doc + root lens
     b. persistence.sync() → loads IndexedDB updates into Y.Doc
     c. YAwareness.make() → awareness state
     d. Returns ProjectDocEntry (doc is fully hydrated)
   → Result transitions: Initial → Success
4. ProjectEditorPage renders ProjectEditor
5. ProjectEditor mounts canvasAtom(id) via useAtomMount
   → canvasAtom reads canvasContainerAtom (null until div renders)
   → canvasAtom reads projectDocEntryAtom (already Success)
   → Returns early (no container yet)
6. React renders <div ref={containerRef}> → ref callback fires
   → appRegistry.set(canvasContainerAtom(id), divElement)
   → canvasAtom dependency changed → rebuilds
   → Stage created, initial frames read via syncGet(), paths synced
7. Subscriptions active: frames, currentFrame, activePathId react to changes
```

## Key Design Decisions

### persistence.sync() in cache lookup
The cache lookup is effectful (`Effect.gen`) and awaits `persistence.sync()` before returning. No consumer can access the Y.Doc until IndexedDB data is fully loaded. This eliminates the hydration race condition where lenses would read empty Y.Maps.

### canvasAtom owns the Konva Stage
The entire canvas lifecycle (Stage, layers, BezierPaths, resize observer, click handler) lives in a single atom. Dependencies are tracked via `get()`, subscriptions via `get.subscribe()`, cleanup via `get.addFinalizer()`. No imperative calls from React components.

### Initial setup via syncGet, ongoing via subscriptions
On creation, `canvasAtom` reads `root.focus("frames").syncGet()` directly from the lens (guaranteed accurate post-sync). For ongoing changes, it subscribes to `framesAtom` and `currentFrameAtom`. The initial `syncGet` bypasses the atom reactivity lag where `framesAtom` may not have received its Y.Map observe event yet.

### syncPaths diffs instead of destroy+recreate
When `framesAtom` updates (e.g., a point is added to a path, triggering a Y.Map observe), `syncPaths` is called. It diffs existing BezierPath instances against the current path keys — only creates new ones and removes deleted ones. Existing paths are untouched.

### No Atom.make inside components
Atoms are defined at module scope or inside `Atom.family`. Components are pure render functions that read atoms via `useAtomValue` and dispatch actions via `useAtomSet` or `appRegistry.set()`. No `Atom.make()` in component bodies — this prevents mount/dispose loops on re-render.

### No raw Y.Doc access
All Y.Doc reads/writes go through effect-yjs lenses. No direct `Y.Map`, `Y.Array`, or `rootMap` access. If the lens doesn't support a pattern, fix the lens layer — don't work around it.
