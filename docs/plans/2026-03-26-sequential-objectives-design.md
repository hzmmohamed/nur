# NUR: Sequential Objectives — Zero to Complete

## Context

NUR is a local-first web application for traditional 2D hand-drawn animators. Animators import flat-colored animation frames, create bezier path masks to define material regions, configure lighting/material properties per mask, and the system renders the frames with applied lighting.

The existing prototype code is reference material only — we are building from zero.

This document defines a sequential list of objectives that delivers value incrementally, so the tool becomes usable as early as possible and grows in capability over time.

---

## Key Design Decisions

These decisions were made during the brainstorming process and apply across all objectives.

### State Architecture
- **effect-yjs** for all domain state (frames, masks, layers, paths, lighting) and Yjs awareness (current frame, active tool, selection, viewport zoom/pan)
- **effect-atom** for purely ephemeral UI state (panel sizes, transient hover, drag-in-progress)
- **effect-machine** for the pen tool state machine
- Yjs awareness includes viewport zoom/pan to support "follow user" mode in collaboration

### Persistence
- Y.Doc persisted locally via y-indexeddb from day one (project survives page reload)
- Frame image blobs stored in content-addressed IndexedDB (SHA-256 keyed)
- No cloud sync until Objective 12

### Rendering
- WebGPU (WGSL shaders) from day one for the compositing/lighting pipeline
- Konva for the interaction layer (bezier editing, selection, hit detection)
- Two layers overlaid: Konva for editing UI, WebGPU for rendered preview

### Lighting Model
- Minimum: inner/outer bezier paths per lighting layer with falloff gradient between them
- No ML depth maps initially — simple 2D falloff interpolation
- Depth-aware lighting added in Objective 17

### UI
- Park UI (Ark UI) + Panda CSS for the component library and styling
- react-resizable-panels for the editor panel layout
- Design system package with NUR theme tokens via Panda CSS

### Monorepo Package Structure
```
packages/
  core/           # Project, frame, layer, lighting schemas + Y.Doc composition
  pen-tool/       # Bezier editing (schema, state machine, math, Konva rendering)
  design-system/  # Park UI theme, NUR tokens, shared components
  renderer/       # WebGPU SDF compositing pipeline
  object-store/   # Content-addressed IndexedDB blob storage + R2 sync
  ml/             # ML inference worker (later)

apps/
  editor/         # React app — thin shell composing packages
  server/         # Cloudflare Workers + Durable Objects + R2
```

Dependencies (effect-yjs, effect-atom, effect-machine) are installed via pnpm, not moved from `.agents/` submodules.

---

## Section 1: Foundation

### Objective 1: Monorepo Infrastructure + Shared Config

Create `tsconfig.base.json` with shared compiler options. Scaffold `packages/` with empty shells: `core`, `pen-tool`, `design-system`, `renderer`, `object-store`. Each package gets `package.json` and `tsconfig.json` extending base. Set up Vitest workspace config for `turbo test`. Configure Park UI + Tailwind in `@nur/design-system` with NUR theme tokens. Install effect-yjs, effect-atom, effect-machine via pnpm where needed. Validate with `turbo build` and `turbo test` passing across the workspace.

**Delivers:** Working build infrastructure that all subsequent objectives build on.

### Objective 2: Core Domain + Project Management

In `@nur/core`: define initial effect-yjs schemas — `ProjectSchema` (name, metadata), `FrameSchema` (id, index, contentHash). Compose into a Y.Doc schema. Wire up y-indexeddb for persistence and Yjs awareness (current frame, active tool, selection, viewport zoom/pan).

In `apps/editor`: build the project list screen (create, open, delete) using Park UI. Opening a project instantiates its Y.Doc and drops you into the editor shell.

**Delivers:** Persistent multi-project management with the collaborative data foundation in place.

### Objective 3: Frame Import + Timeline

In `@nur/object-store`: build content-addressed IndexedDB blob storage (SHA-256 keyed).

In `apps/editor`: build frame import (drag-drop images -> hash -> store blob -> write frame entry to Y.Doc via `@nur/core` lens). Build timeline panel for scrubbing through imported frames. Display current frame on a Konva layer.

**Milestone: You can create a project, import animation frames, and scrub through them.**

---

## Section 2: Mask Editing

### Objective 4: Pen Tool + Bezier Path Editing

In `@nur/pen-tool`: build the bezier editing system. Point schema (effect-yjs), pen tool state machine (effect-machine), bezier math (de Casteljau, split, hit detection), Konva rendering of paths from lens data. All edits flow through effect-yjs lenses. The pen tool works on a single frame — create, edit, and delete bezier paths with control handles.

**Delivers:** The core drawing instrument for the entire application.

### Objective 5: Masking Layers + Per-Frame Mask Management

In `@nur/core`: add `MaskingLayerSchema` and `MaskingShapeSchema`. A masking layer has a name, color label, and a map of frame ranges to bezier paths.

In `apps/editor`: build the masks panel (create/delete/reorder layers, assign to frame ranges). When navigating frames in the timeline, the pen tool loads that frame's mask paths for the selected layer. Draw a mask on frame 1, scrub to frame 2, draw/adjust a different version of that mask.

**Milestone: Full manual mask-per-frame workflow.**

### Objective 6: Lighting Layers + Simple Preview

In `@nur/core`: add `LightingLayerSchema` — references a masking layer, has inner/outer bezier paths, base color, intensity, blend mode.

In `apps/editor`: build the lighting panel (create lighting layers on a mask, set color/intensity/blend, edit inner/outer falloff paths with the pen tool). Render a basic 2D canvas preview showing the lighting color blended over the frame within the mask region — not the full WebGPU pipeline yet, just enough to see what you're doing.

**Milestone: Complete manual editing loop — import, mask, light, see result.**

---

## Section 3: Rendering + Export

### Objective 7: WebGPU Rendering Pipeline

In `@nur/renderer`: build the SDF-based compositing pipeline. For a given frame:

1. Upload the raster image as a GPUTexture
2. Rasterize mask bezier paths to SDF textures
3. Rasterize inner/outer lighting paths to SDF textures
4. Compute falloff gradient between inner/outer SDFs
5. Apply color * intensity * falloff, composite via blend mode
6. Final composite to canvas

Replace the basic 2D preview from Objective 6 with the real WebGPU output.

**Milestone: The editor shows production-quality rendered frames in real time as you edit.**

### Objective 8: Export Pipeline

In `@nur/renderer`: add export capability. Render each frame through the pipeline, read back pixels, produce a PNG sequence. Add WebCodecs video encoding (MP4/WebM) for single-file output. Build export UI in the editor — select frame range, format, resolution.

**Milestone: An animator can produce deliverable output from the tool.**

---

## Section 4: Editing Quality-of-Life

### Objective 9: Frame Edge Detection + Snapping Guides

Build a frame processing step — on import or on demand, run edge detection (e.g. Canny or similar, could be a WASM module or canvas-based implementation) on each frame. Store the edge map in `@nur/object-store` as derived content. In the pen tool, use the edge map to snap bezier control points to detected edges as the user draws.

**Milestone: Mask drawing becomes significantly faster and more precise.**

### Objective 10: Mask Propagation Across Frames

Build an algorithm that takes a mask on frame N and attempts to adjust it for frame N+1 based on the edge maps of both frames. The user draws a mask on the first frame of a range, then the system proposes mask positions for subsequent frames. The user can accept, adjust, or redraw.

**Milestone: Multi-frame mask editing goes from tedious to fast.**

### Objective 11: Undo/Redo + Transactions

In `@nur/core`: implement Yjs undo/redo manager scoped to the current user. Group related operations into transactions (e.g. drawing a complete path is one undo step, not one per point). Wire keyboard shortcuts.

**Milestone: Non-destructive editing workflow.**

---

## Section 5: Collaboration + Sync

### Objective 12: Cloudflare Server Infrastructure

In `apps/server`: build the Cloudflare Worker for request routing and auth. Build the Durable Object per project room — handles Yjs WebSocket sync, persists Y.Doc state. Set up R2 bucket for blob storage. At this point the server exists but the client still works locally.

**Milestone: Server infrastructure deployed and testable.**

### Objective 13: Real-Time Collaboration

Connect the client Y.Doc to the Durable Object via WebSocket. Yjs handles the sync protocol — edits from one client appear on another in real time. Awareness state (current frame, active tool, selection, viewport) syncs too, enabling "follow user" viewport mode. y-indexeddb remains for offline — client works offline and syncs when reconnected.

**Milestone: Two animators can work on the same project simultaneously.**

### Objective 14: Blob Sync (Object-Store to R2)

In `@nur/object-store`: build the sync engine. Background upload of new blobs to R2. When a Y.Doc references a content hash not in local IndexedDB, fetch from R2. The two sync layers are independent — Yjs syncs "what exists", blob sync ensures "content is available".

**Milestone: Projects fully portable across devices.**

---

## Section 6: ML + Advanced Features

### Objective 15: ML Inference Infrastructure

In `@nur/ml`: set up the Comlink web worker for client-side WebGPU inference. Build the server-side fallback endpoint in `apps/server` for clients without WebGPU. Outputs are content-addressed and stored in `@nur/object-store` like any other derived data. This is infrastructure — no specific model yet.

**Delivers:** The runtime for all ML features that follow.

### Objective 16: ML-Powered Segmentation + Vectorization

Integrate a segmentation model (e.g. Segment Anything) for auto-suggesting mask regions. Integrate vectorization for converting raster frames into cleaner vector representations. These feed into the snapping guides (Objective 9) and mask propagation (Objective 10) to make them significantly smarter.

**Milestone: Mask creation goes from assisted to semi-automatic.**

### Objective 17: Depth Map Generation for Advanced Lighting

Integrate a monocular depth estimation model. Use the depth map in the rendering pipeline to modulate lighting falloff — light wraps around 3D form rather than just interpolating between 2D paths.

**Milestone: Lighting quality jumps from flat-shaded to form-aware.**

---

## Summary

| # | Objective | Key Deliverable |
|---|-----------|----------------|
| 1 | Monorepo infrastructure | Build system works |
| 2 | Core domain + project management | Create/open/delete projects with persistence |
| 3 | Frame import + timeline | Import frames and scrub through them |
| 4 | Pen tool + bezier paths | Draw and edit bezier paths on a frame |
| 5 | Masking layers + per-frame masks | Manual mask-per-frame workflow |
| 6 | Lighting layers + simple preview | Complete editing loop: import, mask, light, preview |
| 7 | WebGPU rendering pipeline | Production-quality rendered preview |
| 8 | Export pipeline | Produce PNG sequences and video output |
| 9 | Edge detection + snapping | Faster, more precise mask drawing |
| 10 | Mask propagation across frames | Semi-automatic multi-frame masking |
| 11 | Undo/redo + transactions | Non-destructive editing |
| 12 | Cloudflare server infrastructure | Server deployed |
| 13 | Real-time collaboration | Multi-user simultaneous editing |
| 14 | Blob sync to R2 | Projects portable across devices |
| 15 | ML inference infrastructure | Runtime for ML features |
| 16 | ML segmentation + vectorization | Semi-automatic mask creation |
| 17 | ML depth maps for lighting | Form-aware 3D lighting |
