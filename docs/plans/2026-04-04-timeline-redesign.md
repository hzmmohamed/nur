# Timeline Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the timeline panel with full-height frame slots as the base layer, a tree-structured layer panel with DnD grouping/reordering/rename/duplicate/delete, layer tracks overlaid on the slots, and a filled-dot playhead marker.

**Architecture:** The timeline is split into two regions: a left layer tree panel (using shadcn-treeview with @dnd-kit/react for drag-and-drop reordering/grouping) and a right frame grid. The frame grid renders full-panel-height column slots as the base layer, with per-layer track rows overlaid. The current frame is marked with a filled dot per layer row instead of a thin vertical line. Layer CRUD atoms (rename, duplicate, reorder, group) are added to `layer-atoms.ts` and backed by Y.Doc via the existing lens system.

**Tech Stack:** React 19, shadcn-treeview (ggoggam), @dnd-kit/react, effect-atom, effect-yjs, Tailwind CSS, SVG

---

## Task 1: Install shadcn-treeview and @dnd-kit/react

**Files:**
- Modify: `apps/editor/package.json`
- Create: `apps/editor/src/components/ui/tree-view.tsx` (via shadcn CLI)

**Step 1: Install the treeview component**

```bash
cd apps/editor && npx shadcn@latest add https://ggoggam.github.io/shadcn-treeview/r/tree-view.json
```

This will install `@dnd-kit/react` as a dependency and copy the tree-view component into `src/components/ui/`.

**Step 2: Verify installation**

```bash
npx turbo typecheck --filter=@nur/editor
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/editor/package.json apps/editor/src/components/ui/tree-view.tsx pnpm-lock.yaml
git commit -m "chore: add shadcn-treeview component"
```

---

## Task 2: Add layer CRUD atoms (rename, duplicate, reorder, set group)

**Files:**
- Modify: `apps/editor/src/lib/layer-atoms.ts`

**Context:** The existing `layer-atoms.ts` has `createLayerAtom` and `deleteLayerAtom`. We need to add `renameLayerAtom`, `duplicateLayerAtom`, `reorderLayersAtom`, and `setLayerGroupAtom`. All write through the Y.Doc lens via `projectDocRuntime.fn`.

**Step 1: Add renameLayerAtom**

After the existing `deleteLayerAtom` in `layer-atoms.ts`, add:

```typescript
/** Rename a layer */
export const renameLayerAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* ({ layerId, name }: { layerId: string; name: string }, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const layersMap = entry.doc.getMap("root").get("layers") as any
    if (!layersMap) return
    const layerMap = layersMap.get(layerId) as any
    if (!layerMap) return
    layerMap.set("name", name)
  }),
)
```

**Step 2: Add duplicateLayerAtom**

```typescript
/** Duplicate a layer (copies properties, not mask data) */
export const duplicateLayerAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (layerId: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const existingLayers = (entry.root.focus("layers").syncGet() ?? {}) as Record<string, Layer>
    const source = existingLayers[layerId]
    if (!source) return

    const newId = crypto.randomUUID()
    const count = Object.keys(existingLayers).length
    ;(entry.root.focus("layers").focus(newId) as any).syncSet({
      name: `${source.name} copy`,
      color: source.color,
      index: count,
      groupId: source.groupId,
      masks: {},
    })

    return newId
  }),
)
```

**Step 3: Add reorderLayersAtom**

This receives the new ordered list of `{ id, groupId }` pairs from the tree view after a drag-and-drop, and bulk-updates indices and group assignments in a single Y.Doc transaction.

```typescript
/** Bulk reorder layers and update group assignments (from tree DnD) */
export const reorderLayersAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (
    order: Array<{ id: string; groupId: string | null }>,
    get: Atom.FnContext,
  ) {
    const entry = yield* get.result(activeEntryAtom)
    entry.doc.transact(() => {
      const layersMap = entry.doc.getMap("root").get("layers") as any
      if (!layersMap) return
      for (let i = 0; i < order.length; i++) {
        const layerMap = layersMap.get(order[i].id) as any
        if (!layerMap) continue
        layerMap.set("index", i)
        layerMap.set("groupId", order[i].groupId)
      }
    })
  }),
)
```

**Step 4: Add layer group CRUD atoms**

```typescript
/** Create a layer group */
export const createLayerGroupAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (name: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const groupId = crypto.randomUUID()
    const existingGroups = (entry.root.focus("layerGroups").syncGet() ?? {}) as Record<string, any>
    const count = Object.keys(existingGroups).length
    ;(entry.root.focus("layerGroups").focus(groupId) as any).syncSet({
      name,
      index: count,
    })
    return groupId
  }),
)

/** Layer groups atom (from Y.Doc) */
export const layerGroupsAtom = (() => {
  let rawAtom: Atom.Atom<Record<string, import("@nur/core").LayerGroup> | undefined> | undefined
  return Atom.make((get): Result.Result<Array<import("@nur/core").LayerGroup & { id: string }>> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as any
    if (!rawAtom) {
      rawAtom = result.value.root.focus("layerGroups").atom() as any
    }
    const record = (get(rawAtom) as Record<string, import("@nur/core").LayerGroup> | undefined) ?? {}
    const groups = Object.entries(record)
      .map(([id, g]) => ({ ...g, id }))
      .sort((a, b) => a.index - b.index)
    return Result.success(groups)
  })
})()

/** Delete a layer group (ungroups its children) */
export const deleteLayerGroupAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (groupId: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    entry.doc.transact(() => {
      // Ungroup all layers in this group
      const layersMap = entry.doc.getMap("root").get("layers") as any
      if (layersMap) {
        layersMap.forEach((layerMap: any) => {
          if (layerMap.get("groupId") === groupId) {
            layerMap.set("groupId", null)
          }
        })
      }
      // Delete the group
      const groupsMap = entry.doc.getMap("root").get("layerGroups") as any
      if (groupsMap) groupsMap.delete(groupId)
    })
  }),
)
```

**Step 5: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

Expected: PASS

**Step 6: Commit**

```bash
git add apps/editor/src/lib/layer-atoms.ts
git commit -m "feat: add layer rename, duplicate, reorder, and group atoms"
```

---

## Task 3: Build the timeline layer tree panel

**Files:**
- Create: `apps/editor/src/components/timeline-layers.tsx`

**Context:** This replaces the flat layer label list on the left side of the timeline. Uses shadcn-treeview for tree structure with DnD. Layers with `groupId` are nested under their group node. Supports: click to select, double-click to rename inline, right-click context menu (rename, duplicate, delete), drag to reorder/group.

**Step 1: Create the TimelineLayers component**

Create `apps/editor/src/components/timeline-layers.tsx`:

```typescript
import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import { TreeView, type TreeNodeNested } from "@/components/ui/tree-view"
import {
  layersAtom,
  layerGroupsAtom,
  activeLayerIdAtom,
  setActiveLayerIdAtom,
  renameLayerAtom,
  duplicateLayerAtom,
  deleteLayerAtom,
  reorderLayersAtom,
  createLayerGroupAtom,
  deleteLayerGroupAtom,
} from "../lib/layer-atoms"

// Row height must match the timeline grid ROW_H
const ROW_H = 28

interface LayerNodeData {
  name: string
  color: string | null // null for groups
  type: "layer" | "group"
}

/** Convert flat layers + groups into nested tree structure */
function buildTree(
  layers: Array<{ id: string; name: string; color: string; groupId: string | null }>,
  groups: Array<{ id: string; name: string }>,
): TreeNodeNested<LayerNodeData>[] {
  const groupMap = new Map<string, TreeNodeNested<LayerNodeData>>()
  for (const g of groups) {
    groupMap.set(g.id, {
      id: `group-${g.id}`,
      data: { name: g.name, color: null, type: "group" },
      isGroup: true,
      children: [],
    })
  }

  const roots: TreeNodeNested<LayerNodeData>[] = []

  for (const layer of layers) {
    const node: TreeNodeNested<LayerNodeData> = {
      id: layer.id,
      data: { name: layer.name, color: layer.color, type: "layer" },
    }
    if (layer.groupId && groupMap.has(layer.groupId)) {
      groupMap.get(layer.groupId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  // Insert group nodes at their position (before any ungrouped layers at that index)
  for (const g of groups) {
    const groupNode = groupMap.get(g.id)!
    if (groupNode.children!.length > 0) {
      roots.push(groupNode)
    }
  }

  return roots
}

/** Extract flat ordering from tree structure for Y.Doc update */
function flattenTree(
  items: TreeNodeNested<LayerNodeData>[],
  parentGroupId: string | null = null,
): Array<{ id: string; groupId: string | null }> {
  const result: Array<{ id: string; groupId: string | null }> = []
  for (const item of items) {
    if (item.data.type === "group") {
      const groupId = item.id.replace("group-", "")
      if (item.children) {
        result.push(...flattenTree(item.children, groupId))
      }
    } else {
      result.push({ id: item.id, groupId: parentGroupId })
    }
  }
  return result
}

export function TimelineLayers({ headerHeight }: { headerHeight: number }) {
  const layersResult = useAtomValue(layersAtom)
  const layers = Result.isSuccess(layersResult) ? layersResult.value : []
  const groupsResult = useAtomValue(layerGroupsAtom)
  const groups = Result.isSuccess(groupsResult) ? groupsResult.value : []
  const activeLayerIdResult = useAtomValue(activeLayerIdAtom)
  const activeLayerId = Result.isSuccess(activeLayerIdResult) ? activeLayerIdResult.value : null

  const setActiveLayerId = useAtomSet(setActiveLayerIdAtom)
  const renameLayer = useAtomSet(renameLayerAtom)
  const duplicateLayer = useAtomSet(duplicateLayerAtom)
  const deleteLayer = useAtomSet(deleteLayerAtom)
  const reorderLayers = useAtomSet(reorderLayersAtom)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  const treeItems = useMemo(() => buildTree(layers, groups), [layers, groups])

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const handleDoubleClick = useCallback((id: string, currentName: string) => {
    setEditingId(id)
    setEditValue(currentName)
  }, [])

  const handleRenameCommit = useCallback((id: string) => {
    const trimmed = editValue.trim()
    if (trimmed) {
      renameLayer({ layerId: id, name: trimmed })
    }
    setEditingId(null)
  }, [editValue, renameLayer])

  const handleItemsChange = useCallback((items: TreeNodeNested<LayerNodeData>[]) => {
    const flat = flattenTree(items)
    reorderLayers(flat)
  }, [reorderLayers])

  const selectedIds = activeLayerId ? [activeLayerId] : []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center px-2 border-b border-border text-xs text-muted-foreground font-semibold flex-shrink-0"
        style={{ height: headerHeight }}
      >
        Layers
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {layers.length === 0 ? (
          <div className="flex items-center px-2 text-xs text-muted-foreground" style={{ height: ROW_H }}>
            No layers
          </div>
        ) : (
          <TreeView<LayerNodeData>
            items={treeItems}
            draggable
            droppable
            selectionMode="single"
            selectedIds={selectedIds}
            onSelectedIdsChange={(ids) => {
              const id = ids[0] ?? null
              // Don't select group nodes
              if (id && id.startsWith("group-")) return
              setActiveLayerId(id)
            }}
            defaultExpandAll
            showGuideLines={false}
            indentationWidth={12}
            onItemsChange={handleItemsChange}
            renderNode={({ node, isExpanded, depth, toggle, hasChildren }) => {
              const isLayer = node.data.type === "layer"
              const isActive = isLayer && node.id === activeLayerId
              const isEditing = editingId === node.id

              return (
                <div
                  className={`group flex items-center gap-1.5 pr-1 cursor-pointer transition-colors truncate ${
                    isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  }`}
                  style={{ height: ROW_H, paddingLeft: depth * 12 + 4 }}
                  onDoubleClick={() => handleDoubleClick(node.id, node.data.name)}
                >
                  {/* Expand toggle for groups */}
                  {hasChildren ? (
                    <button onClick={toggle} className="size-3.5 flex items-center justify-center flex-shrink-0">
                      <svg
                        className={`size-2.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
                      >
                        <path d="M8 5l8 7-8 7z" />
                      </svg>
                    </button>
                  ) : (
                    <div className="size-3.5 flex-shrink-0" />
                  )}

                  {/* Color swatch (layers only) */}
                  {isLayer && node.data.color && (
                    <div
                      className="size-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: node.data.color }}
                    />
                  )}

                  {/* Name — inline editable */}
                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleRenameCommit(node.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameCommit(node.id)
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      className="flex-1 min-w-0 text-xs bg-transparent border-b border-ring outline-none px-0 py-0"
                    />
                  ) : (
                    <span className="text-xs truncate flex-1">{node.data.name}</span>
                  )}

                  {/* Actions — visible on hover */}
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      {isLayer && (
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateLayer(node.id) }}
                          className="size-4 flex items-center justify-center rounded hover:bg-accent"
                          title="Duplicate"
                        >
                          <svg className="size-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteLayer(node.id) }}
                        className="size-4 flex items-center justify-center rounded hover:bg-destructive/20 text-destructive"
                        title="Delete"
                      >
                        <svg className="size-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
```

**Step 2: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

Expected: PASS (may need minor adjustments based on exact tree-view types)

**Step 3: Commit**

```bash
git add apps/editor/src/components/timeline-layers.tsx
git commit -m "feat: add timeline layer tree panel with DnD"
```

---

## Task 4: Redesign the timeline frame grid

**Files:**
- Modify: `apps/editor/src/components/timeline.tsx`

**Context:** The SVG grid needs three changes:
1. Frame slot columns span the full panel height (not just `layers.length * ROW_H`)
2. Layer tracks are overlaid on top of the column slots
3. Current frame marker changes from a thin `<rect>` playhead to a filled dot per layer row

**Step 1: Modify the SVG grid to use full panel height**

Replace the `bodyHeight` calculation:

```typescript
// OLD:
const bodyHeight = Math.max(layers.length * ROW_H, ROW_H)

// NEW — use the grid container's actual height:
const [gridHeight, setGridHeight] = useState(200) // will be measured

// Add a ResizeObserver in the gridRefCallback to measure actual height:
const gridRefCallback = useCallback((el: HTMLDivElement | null) => {
  ;(gridRef as any).current = el
  if (!el) return

  // Measure container height for full-height slots
  const observer = new ResizeObserver((entries) => {
    const h = entries[0]?.contentRect.height ?? 200
    setGridHeight(h)
  })
  observer.observe(el)

  // ... existing wheel handler ...

  return () => observer.disconnect()
}, [])

// SVG height is now max of content or viewport:
const bodyHeight = Math.max(layers.length * ROW_H, gridHeight - HEADER_H)
```

**Step 2: Replace playhead with filled dots**

Replace the playhead `<rect>` (the thin vertical line) with per-row filled circles:

```typescript
// OLD:
{/* Playhead */}
{currentFrame >= 0 && currentFrame < frameCount && (
  <rect
    x={currentFrame * cellW}
    y={0}
    width={tokens.timeline.playheadWidth}
    height={HEADER_H + bodyHeight}
    fill={tokens.color.timeline.playhead}
  />
)}

// NEW: Filled dot per layer row + header marker
{currentFrame >= 0 && currentFrame < frameCount && (
  <>
    {/* Header marker — small triangle or dot */}
    <circle
      cx={currentFrame * cellW + cellW / 2}
      cy={HEADER_H / 2}
      r={3}
      fill={tokens.color.timeline.playhead}
    />
    {/* Per-row filled dots */}
    {layers.map((_, layerIdx) => (
      <circle
        key={`playhead-${layerIdx}`}
        cx={currentFrame * cellW + cellW / 2}
        cy={HEADER_H + layerIdx * ROW_H + ROW_H / 2}
        r={4}
        fill={tokens.color.timeline.playhead}
        opacity={0.5}
      />
    ))}
    {/* Full-height thin guideline (subtle) */}
    <line
      x1={currentFrame * cellW + cellW / 2}
      y1={HEADER_H}
      x2={currentFrame * cellW + cellW / 2}
      y2={HEADER_H + bodyHeight}
      stroke={tokens.color.timeline.playhead}
      strokeWidth={1}
      opacity={0.2}
    />
  </>
)}
```

**Step 3: Ensure slot background extends full height**

The existing background `<rect>` already uses `HEADER_H + bodyHeight` — since `bodyHeight` now equals the full container height, the slots will naturally extend. The vertical grid lines also use `HEADER_H + bodyHeight`, so they're already correct.

**Step 4: Run typecheck + visual check**

```bash
npx turbo typecheck --filter=@nur/editor
```

**Step 5: Commit**

```bash
git add apps/editor/src/components/timeline.tsx
git commit -m "feat: full-height frame slots and filled-dot playhead"
```

---

## Task 5: Integrate timeline-layers into the timeline panel

**Files:**
- Modify: `apps/editor/src/components/timeline.tsx`

**Context:** Replace the inline layer label section with `<TimelineLayers />`. Sync vertical scroll between the tree panel and the SVG grid. Ensure row heights match.

**Step 1: Replace the left label panel**

In `timeline.tsx`, replace the entire left panel `<div ref={labelRef} ...>` section with:

```typescript
import { TimelineLayers } from "./timeline-layers"

// In the JSX, replace the labelRef div:
<div
  ref={labelRef}
  className="flex-shrink-0 overflow-hidden border-r border-border"
  style={{ width: LABEL_W }}
>
  <TimelineLayers headerHeight={HEADER_H} />
</div>
```

The vertical scroll sync already exists via `handleGridScroll` which syncs `labelRef.scrollTop`. The tree panel's overflow container will be scrolled via the ref.

**Step 2: Adjust the scroll sync**

The `TimelineLayers` component manages its own scroll internally. We need to sync the grid's vertical scroll with the tree's scroll. The simplest approach: expose a ref to the tree's scroll container, or have the timeline-layers accept an `onScroll` prop and a `scrollTop` prop for controlled scrolling.

Update `TimelineLayers` to accept `scrollRef`:

```typescript
export function TimelineLayers({ headerHeight, scrollRef }: {
  headerHeight: number
  scrollRef?: React.RefObject<HTMLDivElement>
}) {
  // ... existing code, but the overflow div gets the scrollRef:
  <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
```

Then in `timeline.tsx`:

```typescript
// Use labelRef as the scrollRef for TimelineLayers:
<TimelineLayers headerHeight={HEADER_H} scrollRef={labelRef} />
```

**Step 3: Remove old inline layer rendering code**

Delete the old `{/* Layer rows */}` section and the related layer label rendering from `timeline.tsx`.

**Step 4: Run typecheck + visual check**

```bash
npx turbo typecheck --filter=@nur/editor
```

**Step 5: Commit**

```bash
git add apps/editor/src/components/timeline.tsx apps/editor/src/components/timeline-layers.tsx
git commit -m "feat: integrate layer tree into timeline panel"
```

---

## Task 6: Wire layer panel + create layer toolbar

**Files:**
- Modify: `apps/editor/src/components/timeline-layers.tsx`
- Modify: `apps/editor/src/components/panels/layers-panel.tsx`

**Context:** The layers panel in the right sidebar currently handles layer creation. We should keep that working but also add a minimal toolbar in the timeline layer area for adding layers/groups. The right sidebar layers panel can be simplified since the tree view now handles selection, reordering, and grouping.

**Step 1: Add a toolbar row to TimelineLayers header**

Below the "Layers" header text, add + buttons for new layer and new group:

```typescript
<div
  className="flex items-center justify-between px-2 border-b border-border flex-shrink-0"
  style={{ height: headerHeight }}
>
  <span className="text-xs text-muted-foreground font-semibold">Layers</span>
  <div className="flex items-center gap-0.5">
    <button
      onClick={() => createLayer("Layer " + (layers.length + 1))}
      className="size-4 flex items-center justify-center rounded hover:bg-accent"
      title="Add layer"
    >
      <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
    <button
      onClick={() => createLayerGroup("Group " + (groups.length + 1))}
      className="size-4 flex items-center justify-center rounded hover:bg-accent"
      title="Add group"
    >
      <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  </div>
</div>
```

**Step 2: Run typecheck**

```bash
npx turbo typecheck --filter=@nur/editor
```

**Step 3: Commit**

```bash
git add apps/editor/src/components/timeline-layers.tsx apps/editor/src/components/panels/layers-panel.tsx
git commit -m "feat: add layer/group creation toolbar in timeline"
```

---

## Task 7: Final polish and cleanup

**Files:**
- Modify: `apps/editor/src/tokens.ts` — add any new timeline tokens if needed
- Modify: `apps/editor/src/components/timeline.tsx` — final SVG rendering adjustments
- Modify: `TODO.md` — mark items complete

**Step 1: Tune visual details**

- Ensure the mask dots and playhead dots have appropriate z-ordering in SVG (playhead dots render last)
- Ensure the active frame column highlight (`activeBg`) spans full height
- Verify hover states on frame slots work correctly

**Step 2: Run full build**

```bash
npx turbo build --filter=@nur/editor
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: timeline redesign — full-height slots, layer tree, filled-dot playhead"
```
