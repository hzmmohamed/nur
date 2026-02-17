# NUR Architecture

## Context

NUR is a local-first web application for traditional 2D hand-drawn animators. Animators import flat-colored animation frames, create bezier path masks to define material regions (skin, ear, fabric), configure lighting/material properties per mask, and the system renders the frames with applied lighting. The project is transitioning from a single Vite app to a Turborepo monorepo with clean package boundaries.

The central architectural principle is **lens-based composition via effect-yjs**: packages define their own schemas and declare the lens types they need. The editor app composes all schemas into a single Y.Doc and feeds lenses to each package. Components never touch Y.Doc directly.

---

## Architectural Decisions

### Reactive Layer
- **effect-atom**: All reactive state (UI, derived, Yjs-backed atoms)
- **effect-yjs**: Schema-first Yjs binding, produces effect-atoms from Y.Doc lenses
- **effect-machine**: Pen tool state machine only
- **Eliminated**: Jotai, Zustand, TinyBase, XState

### Storage: Two Tiers
1. **Yjs Y.Doc** -> local IndexedDB (y-indexeddb) + Cloudflare Durable Object sync
   - Project metadata, frame references (content hashes), masks, lighting, bezier paths
2. **Content-addressed blob store** -> local IndexedDB + Cloudflare R2 sync
   - Source frame images, vectorized frames, ML inference outputs
   - Keyed by SHA-256 hash (`crypto.subtle.digest`)
   - Derived data (vectorization, ML) computed once, synced to R2 like source frames

### Server: Cloudflare
- **Durable Object** per project room: Yjs WebSocket sync, persists Y.Doc state
- **R2 bucket**: Content-addressed blob storage
- **Worker**: Request routing, auth, ML inference fallback

### Rendering: WebGPU
- SDF-based mask rasterization from bezier paths
- Custom WGSL shaders for falloff gradients (inner/outer lighting paths)
- Blend mode compositing (normal, add, multiply, screen, overlay)
- Export: PNG frame sequence + WebCodecs video encoding (MP4/WebM)

### ML: Client-preferred, server fallback
- WebGPU inference in browser web worker (via Comlink)
- Server-side fallback when client GPU is unavailable
- Outputs are content-addressed and synced like source frames

---

## Lens-Based Composition Pattern

Each package defines its own effect-yjs schema and exports the lens type it expects:

```
@nur/pen-tool defines BezierPointSchema -> exports YLinkedListLens<BezierPointSchema>
@nur/layers defines MaskingLayerSchema  -> exports YMapLens<MaskingLayerSchema>
@nur/project composes all schemas       -> creates full Y.Doc, focuses lenses for each package
Editor app passes lenses to components  -> components are decoupled from document structure
```

**Schema placement heuristic:**
- Schemas intrinsic to a package's capability live in that package (BezierPointSchema in pen-tool)
- Schemas for cross-cutting domain concepts live in their own domain packages (@nur/layers, @nur/frames)
- The full Y.Doc schema is composed in @nur/project
- During development, apply this heuristic case-by-case; if a schema clearly belongs to a single package, put it there

Packages are **effect-yjs-focused**, not generic components. Their primary API surface is lens-in, reactive-behavior-out. They may optionally export thinner generic wrappers.

---

## Monorepo Structure

```
nur/
├── packages/
│   │
│   │  # -- Infrastructure --
│   ├── effect-yjs/          # Schema-first Yjs <-> Effect Schema binding (existing submodule)
│   ├── effect-atom/         # Reactive atom primitives (existing submodule)
│   ├── design-system/       # Generic UI primitives (Button, Slider, Panel, ColorPicker),
│   │                        #   design tokens, theme system. NUR theme layered on top.
│   │
│   │  # -- Capabilities (effect-yjs focused) --
│   ├── pen-tool/            # Bezier editing, path rendering, bezier math
│   │   ├── schema.ts        #   BezierPointSchema, PathSchema (effect-yjs schemas)
│   │   ├── lens-types.ts    #   Exported lens type contracts
│   │   ├── machine.ts       #   Pen tool state machine (effect-machine)
│   │   ├── bezier-path.ts   #   BezierPath class (Konva rendering from lens)
│   │   ├── bezier-math.ts   #   Pure math: de Casteljau, split, SDF, hit detection
│   │   └── components/      #   React/Konva components
│   │
│   ├── timeline/            # Scrubbing, playback, frame navigation
│   │   ├── schema.ts        #   Timeline-related schemas
│   │   ├── lens-types.ts    #   Exported lens type contracts
│   │   └── components/      #   Timeline React components
│   │
│   ├── layers/              # Masking + Lighting (grouped: lighting references masking)
│   │   ├── masking/         #   MaskingLayerSchema, MaskingShapeSchema, shape management
│   │   ├── lighting/        #   LightingLayerSchema, LightingShapeSchema, blend/falloff
│   │   └── lens-types.ts    #   Exported lens type contracts for both
│   │
│   ├── frames/              # Frame entity, frame-to-hash reference mapping
│   │   ├── schema.ts        #   FrameSchema (id, index, contentHash, timestamp, etc.)
│   │   └── lens-types.ts    #   Exported lens type contracts
│   │
│   │  # -- Domain composition --
│   ├── project/             # Composes all package schemas into the full Y.Doc schema
│   │   ├── schema.ts        #   AnimationProjectSchema (imports from pen-tool, layers, frames, etc.)
│   │   ├── document.ts      #   YDocument.bind(ComposedSchema, ydoc) + lens focusing
│   │   └── operations.ts    #   Project-level operations (create, undo/redo, transactions)
│   │
│   │  # -- Storage & Sync --
│   ├── object-store/        # Content-addressed IndexedDB + R2 sync
│   │   ├── content-store.ts #   SHA-256 keyed IndexedDB blob storage
│   │   ├── sync-engine.ts   #   Background upload/download to R2
│   │   └── frame-cache.ts   #   LRU memory cache for ImageBitmaps
│   │
│   │  # -- Rendering & Compute --
│   ├── renderer/            # WebGPU compositing pipeline
│   │   ├── shaders/         #   WGSL: SDF rasterization, falloff, blending
│   │   ├── pipeline.ts      #   Render pipeline orchestration
│   │   └── export.ts        #   PNG frame sequence + WebCodecs video encoding
│   │
│   └── ml/                  # ML inference (WebGPU + server fallback)
│       ├── vectorizer.ts    #   Frame -> vector outline extraction
│       ├── segmentation.ts  #   Auto-segmentation for mask suggestions
│       └── worker.ts        #   Comlink worker entry point
│
├── apps/
│   ├── editor/              # React + Konva -- thin shell composing packages
│   │   └── src/
│   │       ├── app.tsx      #   Root: instantiates Y.Doc, creates @nur/project, wires lenses
│   │       ├── atoms/       #   Ephemeral UI state (tool selection, viewport, etc.) as effect-atoms
│   │       ├── routes/      #   TanStack Router pages
│   │       ├── hooks/       #   React bindings for effect-atom subscriptions
│   │       └── modules/     #   NUR-specific UI panels (domain-tied, not reusable)
│   │           ├── masks-panel/       # Mask layer list, create/delete, per-frame shape mgmt
│   │           ├── lighting-panel/    # Lighting controls: color, intensity, falloff, blend
│   │           ├── properties-panel/  # Selected object properties (context-dependent)
│   │           ├── project-manager/   # Project listing, create/open/delete
│   │           └── frame-viewer/      # Main canvas: composites frame + masks + lighting
│   │
│   └── server/              # Cloudflare Workers + Durable Objects + R2
│       ├── worker.ts        #   Request routing, auth
│       ├── yjs-room.ts      #   Durable Object: Yjs WebSocket sync per project
│       ├── r2-storage.ts    #   R2 blob upload/download endpoints
│       └── ml-fallback.ts   #   Server-side ML inference for clients without WebGPU
│
├── turbo.json               # Turborepo task configuration
├── pnpm-workspace.yaml      # pnpm workspace definition
└── tsconfig.base.json       # Shared TypeScript config
```

---

## Data Flow

### Frame Import
```
User drops frame images
  -> hash each blob via crypto.subtle.digest('SHA-256', buffer)
  -> store blob in @nur/object-store (IndexedDB, key: hash)
  -> write frame entry to Yjs via @nur/frames lens (frameId -> { index, contentHash, ... })
  -> @nur/object-store sync engine queues blob for background upload to R2
```

### Frame Display
```
Navigate to frame N
  -> @nur/frames lens resolves frame N -> contentHash
  -> @nur/object-store: LRU memory cache -> IndexedDB -> remote R2 fetch (fallback chain)
  -> createImageBitmap -> render on Konva stage in frame-viewer module
```

### Editing
```
Open frame -> pen tool activated
  -> Editor focuses lens: project.focus("masks").focus(layerId).focus(frameId).focus("points")
  -> Lens type matches YLinkedListLens<BezierPointSchema> -> pass to @nur/pen-tool
  -> Pen tool renders bezier path on Konva, handles interactions via effect-machine
  -> All edits flow through lens.syncSet() -> Yjs -> reactive atoms -> re-render
```

### Rendering Pipeline
```
For a given frame:
  1. Load flat-colored raster image (contentHash -> ImageBitmap -> GPUTexture)
  2. For each visible masking layer (from @nur/layers lens, sorted by order):
     a. Rasterize mask bezier paths to SDF texture
  3. For each visible lighting layer on that mask:
     a. Rasterize inner/outer bezier paths to SDF textures
     b. Compute shader: interpolate between SDFs for falloff gradient
     c. Apply baseColor * intensity * falloff, composite via blendMode
  4. Final composite -> canvas (preview) or readback -> export
```

### Frame Processing (Derived Data)
```
Frame needs vectorization or ML inference
  -> Check @nur/object-store for cached result: key = derivedHash (from Yjs metadata)
  -> If missing: run pipeline
    -> @nur/ml worker (Comlink) attempts client WebGPU
    -> Falls back to server endpoint if unavailable
  -> Hash output, store in @nur/object-store
  -> Write derivedHash to Yjs via @nur/frames lens
  -> Sync engine uploads derived blob to R2
```

### Sync
```
Yjs layer:
  Client <-> Cloudflare Durable Object (WebSocket)
  + y-indexeddb for offline local persistence
  On fresh start: connects to DO, receives full Y.Doc, works locally after

File layer:
  @nur/object-store watches for new blobs -> uploads to R2 (background)
  When Yjs references a hash not in local IndexedDB -> fetches from R2
  Two engines are independent: Yjs syncs "what exists", file sync ensures "content is available"
```

---

## Migration Path (from current state)

### Phase 1: Monorepo scaffold
- Set up Turborepo + pnpm workspaces
- Move existing `.agents/effect-yjs` and `.agents/effect-atom` to `packages/`
- Create empty package shells with tsconfig, package.json
- Current app continues working as `apps/editor/`

### Phase 2: Extract packages bottom-up
- `@nur/pen-tool`: Extract from `src/lib/canvas-objects/` and `src/lib/pen-tool-yjs/`
- `@nur/frames`: Extract from `src/lib/frame-fetcher.machine.ts` and frame-related schemas
- `@nur/layers`: Extract from `src/lib/domain/impl-yjs/` (masking + lighting)
- `@nur/timeline`: Extract from `src/components/timeline-panel.tsx`
- `@nur/design-system`: Extract from `src/components/ui/` (Radix wrappers)
- `@nur/object-store`: Extract from `src/lib/frame-fetcher.machine.ts` (IndexedDB parts), build new content-addressed layer

### Phase 3: Eliminate old state management
- Replace TinyBase scenes store -> Yjs-backed via @nur/project
- Replace Jotai atoms -> effect-atom
- Replace Zustand masks store -> already in Yjs domain model
- Replace XState machines -> effect-atom (frame fetcher), effect-machine (pen tool)

### Phase 4: Compose and wire
- `@nur/project`: Build composed schema from all package schemas
- Editor app: instantiate Y.Doc from composed schema, focus lenses, pass to components

### Phase 5: New capabilities
- `@nur/renderer`: WebGPU compositing pipeline
- `@nur/ml`: WebGPU inference worker
- `@nur/object-store` sync engine: R2 upload/download
- `apps/server/`: Cloudflare Workers + DO + R2

---

## Key Existing Files to Migrate

| Current Location | Target Package |
|-----------------|----------------|
| `src/lib/canvas-objects/bezier-curve.ts` | `@nur/pen-tool` |
| `src/lib/canvas-objects/bezier-math.ts` | `@nur/pen-tool` |
| `src/lib/canvas-objects/path.ts` | `@nur/pen-tool` |
| `src/lib/pen-tool-yjs/` | `@nur/pen-tool` |
| `src/lib/domain/impl-yjs/masking-*.ts` | `@nur/layers/masking` |
| `src/lib/domain/impl-yjs/lighting-*.ts` | `@nur/layers/lighting` |
| `src/lib/domain/schemas-effect.ts` | Split across packages (per heuristic) |
| `src/lib/domain/interfaces.ts` | Split across packages |
| `src/lib/domain/coordinate-utils.ts` | `@nur/pen-tool` |
| `src/lib/frame-fetcher.machine.ts` | `@nur/object-store` (storage) + `@nur/frames` (schema) |
| `src/lib/scenes.store.ts` | `@nur/project` (migrate to Yjs) |
| `src/lib/masks.store.ts` | Eliminate (already in Yjs domain model) |
| `src/components/timeline-panel.tsx` | `@nur/timeline` |
| `src/components/layers-panel-5.tsx` | `apps/editor/src/modules/masks-panel/` |
| `src/components/ui/` | `@nur/design-system` |
| `src/lib/editor.machine.ts` | `apps/editor/src/atoms/` (rewrite as effect-atoms) |
| `.agents/effect-yjs/` | `packages/effect-yjs/` |
| `.agents/effect-atom/` | `packages/effect-atom/` |
