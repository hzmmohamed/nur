# Code Map

## Root

```
ARCHITECTURE.md          — Monorepo structure, lens-based composition, data flow, storage tiers
CLAUDE.md                — Instructions for Claude Code sessions
TODO.md                  — Active UX fixes and architecture todos
vercel.json              — Vercel deployment config (builds @nur/editor via Turborepo)
turbo.json               — Turborepo pipeline (build, test, typecheck)
pnpm-workspace.yaml      — Workspace: packages/* and apps/*
tsconfig.base.json       — Shared TypeScript config
vitest.workspace.ts      — Vitest workspace config
flake.nix                — Nix dev environment
```

## packages/core/ — `@nur/core`

Domain schemas, Y.Doc management, persistence.

```
src/index.ts                        — Package exports
src/project-doc.ts                  — ProjectDocSchema (name, frames, layers, layerGroups) + Y.Doc factory
src/project-index.ts                — ProjectIndexSchema (record of ProjectMeta)
src/frame-import.ts                 — Batch frame import pipeline (hash, store, write to Y.Doc)
src/frame-atoms.ts                  — currentFrameIndex atom from YAwareness
src/ydoc-persistence.ts             — Scoped IndexedDB persistence for Y.Doc (debounced flush)
src/schemas/
  ids.ts                            — Branded types: ProjectId, FrameId
  frame.ts                          — FrameSchema (id, index, contentHash, dimensions), BezierPointSchema
  layer.ts                          — LayerSchema (name, color, index, groupId, masks per frame), LayerGroupSchema
  awareness.ts                      — AwarenessSchema (currentFrame, activeTool, activePathId, activeLayerId, drawingState, viewport)
  project-meta.ts                   — ProjectMetaSchema (id, name, timestamps, frameCount, frameHashes)
```

## packages/object-store/ — `@nur/object-store`

Content-addressed blob storage + image variant service.

```
src/index.ts                        — Package exports
src/blob-store.ts                   — BlobStore service (put/get/has/delete), InMemory + IndexedDB implementations
src/hash.ts                         — SHA-256 hashing for content addressing
src/image-store.ts                  — ImageStore service: wraps BlobStore, generates 200px JPEG thumbnails on put, maintains ThumbIndex (originalHash → thumbHash) in separate IndexedDB
```

## packages/pen-tool/ — `@nur/pen-tool` (shell)

Empty — bezier editing code lives in apps/editor, to be extracted.

## packages/renderer/ — `@nur/renderer` (shell)

Empty — future WebGPU compositing pipeline.

## packages/design-system/ — `@nur/design-system` (unused)

Panda CSS shell, not imported by anything. Tokens live in apps/editor/src/tokens.ts instead.

## apps/editor/ — `@nur/editor`

Main React + Konva editor application.

### Entry + Config

```
src/main.tsx                        — App entry, renders RouterProvider
src/app.tsx                         — Root component with TanStack Router
src/index.css                       — Tailwind imports, @theme aliases to tokens.css, view transition CSS, scrollbar styles
src/tokens.css                      — CSS custom properties: palette, semantic, canvas domain, timeline domain, typography, spacing
src/tokens.ts                       — TypeScript design tokens (colors, sizing, canvas constants, timeline constants)
components.json                     — shadcn CLI config
```

### Routes

```
src/routes/__root.tsx               — Root layout (Outlet only)
src/routes/index.tsx                — Home page: onboarding (name input), project grid with thumbnails, hover scrub, view transitions
src/routes/project.$id.tsx          — Project editor: hotkey setup, import wiring, EditorLayout composition
src/routes/routeTree.gen.ts         — Auto-generated route tree (TanStack Router)
```

### Components

```
src/components/editor-layout.tsx    — Resizable layout shell: canvas area + right sidebar + timeline, with conditional canvas bar, minimap, status bar, and drawing overlay
src/components/canvas-bar.tsx       — Edit mode toolbar inside canvas: frame number, layer info, Edit Mask/New Mask sub-tools, Done/Discard buttons
src/components/canvas-status-bar.tsx — Bottom status bar: contextual hints per mode/tool + zoom display + Fit button
src/components/canvas-minimap.tsx   — SVG minimap overlay: viewport rectangle, visible when zoom > 100%, reads stagePositionAtom/stageSizeAtom
src/components/timeline.tsx         — SVG + HTML timeline: layer tracks, frame grid with hoverable slots, mask dots, playhead, zoom bar, frame/time toggle, footer stats
src/components/frame-drop-zone.tsx  — Drag-and-drop frame import zone with progress display
src/components/panels/
  layers-panel.tsx                  — Layer list: create, delete, select (enters Edit mode), color swatches
  properties-panel.tsx              — Placeholder for layer property editing
src/components/ui/
  button.tsx                        — shadcn Button (base-ui variant, CVA)
  card.tsx                          — shadcn Card with sub-components
  input.tsx                         — shadcn Input
  resizable.tsx                     — shadcn Resizable (PanelGroup, Panel, Handle wrapping react-resizable-panels)
  spinner.tsx                       — Loading spinner with role="status" and sr-only text
  tooltip.tsx                       — shadcn Tooltip
```

### Lib — Atoms + State

```
src/lib/atom-registry.ts            — Shared appRegistry singleton (Registry.make)
src/lib/project-doc-atoms.ts        — Project lifecycle: activeProjectIdAtom, projectDocEntryAtom (Y.Doc + persistence + awareness), projectNameAtom, framesAtom, currentFrameAtom
src/lib/path-atoms.ts               — Pen tool state: activeToolAtom, activePathIdAtom, drawingStateAtom, isDrawingAtom
src/lib/layer-atoms.ts              — Layer state: activeLayerIdAtom, layersAtom, activeLayerAtom, isEditModeAtom, createLayerAtom, deleteLayerAtom, discardCurrentMaskAtom
src/lib/viewport-atoms.ts           — Canvas viewport: zoomAtom, setZoomAtom, resetViewSignalAtom
src/lib/import-atoms.ts             — Frame import: importFnAtom (uses ImageStore.putImage), importProgressAtom, updates project meta with frameHashes
src/lib/drawing-actions.ts          — DRY finalization for New Mask mode: commitNewMask(), discardNewMask()
src/lib/user-profile.ts             — userProfileAtom (Atom.kvs, localStorage) for onboarding name
src/lib/blob-store-layer.ts         — Effect Layer composing IndexedDB BlobStore + ImageStore
src/lib/frame-image-cache.ts        — frameImageAtom: loads full frame images as HTMLImageElement for Konva
src/lib/thumbnail-cache.ts          — thumbnailAtom (Atom.family): loads thumb variant as object URL for project cards
src/lib/logger.ts                   — loglayer module logger factory
src/lib/utils.ts                    — cn() utility (clsx + tailwind-merge)
```

### Lib — Canvas + Bezier

```
src/lib/canvas-atom.ts              — Konva stage lifecycle atom: creates Stage, image layer, paths layer, handles zoom/pan/pointer events, subscribes to frame/layer/path/zoom atoms, manages BezierPath instances
src/lib/canvas-objects/
  bezier-curve.ts                   — BezierPath class: Konva objects for points/handles/path line, ghost vertex, hover states, zoom-independent scaling, structural + render loops from YLinkedListLens
  bezier-math.ts                    — Pure math: buildSvgPathData (with Z for closed paths), sampleCubicBezier, splitCubicBezierAt, findNearestPointOnPath (de Casteljau)
  path.ts                           — Re-exports BezierPointSchema from @nur/core
src/lib/domain/
  coordinate-utils.ts               — cartesianToPolar, polarToCartesian, bounds utilities
```

### Actors

```
src/actors/hotkey-manager.ts        — Global keyboard shortcut system: scope stack (pushHotkeyScope/popHotkeyScope), only top scope's bindings active, parseKey with modifier support
```

### Hooks

```
src/hooks/use-project-index.ts      — projectsAtom (Atom.kvs), createProject, deleteProject
```

## docs/

```
docs/resilient-ui-guide.md                          — UI patterns: state handling, error classification with effect-atom Result
docs/editor-atom-architecture.md                    — Atom architecture overview
docs/bugs/                                          — Bug investigations
docs/plans/                                         — Design docs and implementation plans (chronological, 21 files)
```
