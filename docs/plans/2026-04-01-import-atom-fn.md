# Frame Import via Atom.fn — Implementation Plan

**Goal:** Replace the async `Effect.runPromise` import callback and the unused effect-machine import-manager with a per-project `Atom.fn` that provides reactive progress and proper lifecycle management.

**Architecture:** `Atom.family` keyed by `projectId` creates an `Atom.fn` per project. The fn runs the import as a single Effect, updating a progress atom after each frame. `Atom.Interrupt` aborts. Router `beforeLeave` guard blocks navigation during import.

---

### Task 1: Create `apps/editor/src/lib/import-atoms.ts`

**New file** with:

1. `importProgressAtom = Atom.family((projectId: string) => Atom.make({ total: 0, completed: 0, currentFile: "" }))`
2. `importFnAtom = Atom.family((projectId: string) => storageRuntime.fn(...))`
   - The fn accepts `{ files: FileList, root: YDocumentRoot<ProjectDoc>, startIndex: number }`
   - Inside the Effect:
     - Filter image files, sort with `sortFramesByName`
     - Set progress atom total
     - `Effect.forEach` (sequential) over sorted files:
       - `readFileAsArrayBuffer(file)` via `Effect.promise`
       - `getImageDimensions(file)` via `Effect.promise`
       - `store.put(new Uint8Array(buffer))` → contentHash
       - Generate frame ID, create Frame object
       - `root.focus("frames").focus(id).syncSet(frame)` — sync Y.Doc write
       - Update `importProgressAtom(projectId)` with completed count + current file name
     - Return array of imported frames
   - The `storageRuntime` is `Atom.runtime(AppBlobStore)` (same as frame-image-cache.ts — share it)
3. Export `ImportProgress` type: `{ total: number, completed: number, currentFile: string }`
4. Move `readFileAsArrayBuffer` and `getImageDimensions` helpers from `project.$id.tsx` into this file (they're pure utilities needed by the Effect)

**Commit:** `feat(editor): add atom-based frame import with per-frame progress`

---

### Task 2: Update `apps/editor/src/routes/project.$id.tsx`

1. Remove `readFileAsArrayBuffer` and `getImageDimensions` (moved to import-atoms)
2. Remove the `handleFilesSelected` async callback entirely
3. Remove `import * as Effect from "effect/Effect"` and `AppBlobStore` import
4. Import `importFnAtom`, `importProgressAtom` from `../lib/import-atoms`
5. In the component:
   - `const importSet = useAtomSet(importFnAtom(id))`
   - `const importResult = useAtomValue(importFnAtom(id))`
   - `const importProgress = useAtomValue(importProgressAtom(id))`
   - Pass `importSet`, `importResult`, `importProgress` as props to `FrameDropZone`
   - The drop zone calls `importSet({ files: fileList, root, startIndex: frameCount })` synchronously
6. Show `FrameCanvas` when `frameCount > 0` regardless of import state (partially imported frames are valid)
7. Show progress bar overlay when `Result.isSuccess(importResult) && importResult.waiting` or `Result.isInitial(importResult) && importResult.waiting`

**Commit:** `refactor(editor): wire import-atoms into project editor`

---

### Task 3: Update `apps/editor/src/components/frame-drop-zone.tsx`

1. Remove import of `importProgressAtom` from `../actors/import-manager`
2. Accept props: `onImport: (files: FileList) => void`, `progress: ImportProgress`, `isImporting: boolean`
3. Use `props.isImporting` and `props.progress` for UI state instead of reading from the old atom
4. When `isImporting`, disable drop/click handlers and show progress

**Commit:** `refactor(editor): update frame-drop-zone to use import props`

---

### Task 4: Delete `apps/editor/src/actors/import-manager.ts`

1. Delete the file
2. Verify no remaining imports reference it (grep)

**Commit:** `refactor(editor): remove unused import-manager machine`

---

### Task 5: Add navigation guard

1. In `apps/editor/src/routes/project.$id.tsx`:
   - Use TanStack Router's `useBlocker` or `Route.beforeLeave` to block navigation when importing
   - Check: `Result.waiting` on `importFnAtom(id)` — if true, show browser confirm dialog
   - On confirm: `set(importFnAtom(id), Atom.Interrupt)` then allow navigation
   - On cancel: block navigation

**Commit:** `feat(editor): block navigation during frame import`

---

### Task 6: Remove debug logging + final verification

1. Remove `console.log` debug statements from `frame-image-cache.ts`, `use-frame-image.ts`, `project.$id.tsx`
2. Run `npx tsc --noEmit -p apps/editor/tsconfig.json`
3. Run `cd apps/editor && npx eslint src/`
4. Run `cd packages/core && npx vitest run`

**Commit:** `chore(editor): remove debug logging from frame import`
