import { Atom, Result } from "@effect-atom/atom"
import { activeEntryAtom, projectDocRuntime, framesAtom, currentFrameAtom } from "./project-doc-atoms"
import { appRegistry } from "./atom-registry"
import type { Layer, LayerGroup, LayerOrderEntry } from "@nur/core"
import * as Effect from "effect/Effect"
import * as Y from "yjs"
import { canvasMachineStateAtom } from "./canvas-machine"

// -- Default layer colors (cycled when creating new layers) --
const LAYER_COLORS = [
  "#4A90D9", // blue
  "#E87D3E", // orange
  "#22C55E", // green
  "#DC2626", // red
  "#D97706", // amber
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
] as const

// -- Active layer ID (local writable atom) --

/** @derived from canvas machine — do not set directly */
export const activeLayerIdRawAtom = Atom.make((get): string | null => {
  const state = get(canvasMachineStateAtom)
  return state._tag === "Viewing" ? null : (state as any).layerId
})

export const activeLayerIdAtom = Atom.make((get): Result.Result<string | null> => {
  return Result.success(get(activeLayerIdRawAtom))
})

// -- Layer order (from Y.Doc Y.Array) --

/** Reactive atom for the layerOrder Y.Array — the source of truth for tree structure */
export const layerOrderAtom = (() => {
  let rawAtom: Atom.Atom<LayerOrderEntry[] | undefined> | undefined
  return Atom.make((get): Result.Result<LayerOrderEntry[]> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<LayerOrderEntry[]>
    if (!rawAtom) {
      rawAtom = result.value.root.focus("layerOrder").atom() as Atom.Atom<LayerOrderEntry[] | undefined>
    }
    return Result.success((get(rawAtom) as LayerOrderEntry[] | undefined) ?? [])
  })
})()

// -- Layers list (from Y.Doc, ordered by layerOrder) --

export const layersAtom = (() => {
  let rawAtom: Atom.Atom<Record<string, Layer> | undefined> | undefined
  return Atom.make((get): Result.Result<Array<Layer & { id: string }>> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<Array<Layer & { id: string }>>
    if (!rawAtom) {
      rawAtom = result.value.root.focus("layers").atom() as Atom.Atom<Record<string, Layer> | undefined>
    }
    const record = (get(rawAtom) as Record<string, Layer> | undefined) ?? {}

    // Use layerOrder for ordering if available, fall back to index-based sort
    const orderResult = get(layerOrderAtom)
    const order = Result.isSuccess(orderResult) ? orderResult.value : []
    const layerOrderIds = order.filter((e) => e.type === "layer").map((e) => e.id)

    let layers: Array<Layer & { id: string }>
    if (layerOrderIds.length > 0) {
      // Order by layerOrder, derive groupId from it
      const groupIdMap: Record<string, string | null> = {}
      for (const entry of order) {
        if (entry.type === "layer") {
          groupIdMap[entry.id] = entry.parentId
        }
      }
      layers = layerOrderIds
        .filter((id) => record[id])
        .map((id) => ({
          ...record[id],
          id,
          groupId: groupIdMap[id] ?? record[id].groupId,
        }))
    } else {
      // Fallback: sort by index (for existing projects without layerOrder)
      layers = Object.entries(record)
        .map(([id, layer]) => ({ ...layer, id }))
        .sort((a, b) => a.index - b.index)
    }

    return Result.success(layers)
  })
})()

/** Active layer data (derived from activeLayerIdAtom + layersAtom) */
export const activeLayerAtom = Atom.make((get): Result.Result<(Layer & { id: string }) | null> => {
  const layerIdResult = get(activeLayerIdAtom)
  if (!Result.isSuccess(layerIdResult)) return layerIdResult as unknown as Result.Result<(Layer & { id: string }) | null>
  const layerId = layerIdResult.value
  if (!layerId) return Result.success(null)

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return layersResult as unknown as Result.Result<(Layer & { id: string }) | null>
  const layer = layersResult.value.find((l) => l.id === layerId) ?? null
  return Result.success(layer)
})

/** Whether we're in Edit mode (a layer is selected) */
export const isEditModeAtom = Atom.make((get): boolean => {
  const result = get(activeLayerIdAtom)
  return Result.isSuccess(result) && result.value !== null
})

/** @derived from canvas machine — do not set directly */
export const editingPathTargetAtom = Atom.make((get): "inner" | "outer" => {
  const state = get(canvasMachineStateAtom)
  return state._tag === "EditMask" ? (state as any).target : "inner"
})

/** @derived from canvas machine — do not set directly */
export const editMaskModeAtom = Atom.make((get): boolean => {
  return get(canvasMachineStateAtom)._tag === "EditMask"
})

/** Whether the active layer has a mask on the current frame */
export const currentFrameHasMaskAtom = Atom.make((get): boolean => {
  return get(currentFrameMaskCountAtom) > 0
})

/** Number of masks on the current frame for the active layer */
export const currentFrameMaskCountAtom = Atom.make((get): number => {
  const layerIdResult = get(activeLayerIdAtom)
  if (!Result.isSuccess(layerIdResult) || !layerIdResult.value) return 0
  const layerId = layerIdResult.value

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return 0
  const layer = layersResult.value.find((l) => l.id === layerId)
  if (!layer) return 0

  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return 0
  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return 0
  const frame = framesResult.value[currentResult.value as number]
  if (!frame) return 0

  const masks = (layer as any).masks ?? {}
  const frameMasks = masks[frame.id]
  if (!frameMasks || typeof frameMasks !== "object") return 0
  return Object.keys(frameMasks).length
})

/** Whether the active layer has a mask on the previous frame (currentFrame - 1) */
export const previousFrameMaskExistsAtom = Atom.make((get): boolean => {
  const layerIdResult = get(activeLayerIdAtom)
  if (!Result.isSuccess(layerIdResult) || !layerIdResult.value) return false
  const layerId = layerIdResult.value

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return false
  const layer = layersResult.value.find((l) => l.id === layerId)
  if (!layer) return false

  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return false
  const frames = framesResult.value

  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return false
  const currentIdx = currentResult.value as number

  if (currentIdx <= 0) return false
  const prevFrame = frames[currentIdx - 1]
  if (!prevFrame) return false

  const masks = (layer as any).masks ?? {}
  const frameMasks = masks[prevFrame.id]
  return frameMasks && typeof frameMasks === "object" && Object.keys(frameMasks).length > 0
})

/** Buffer distance of the active mask on the current frame */
export const maskBufferDistanceAtom = Atom.make((get): number => {
  const layerIdResult = get(activeLayerIdAtom)
  if (!Result.isSuccess(layerIdResult) || !layerIdResult.value) return 20
  const layerId = layerIdResult.value

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return 20
  const layer = layersResult.value.find((l) => l.id === layerId)
  if (!layer) return 20

  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return 20
  const frames = framesResult.value

  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return 20
  const currentIdx = currentResult.value as number

  const frame = frames[currentIdx]
  if (!frame) return 20

  const masks = (layer as any).masks ?? {}
  const frameMasks = masks[frame.id]
  if (!frameMasks || typeof frameMasks !== "object") return 20
  const firstMask = Object.values(frameMasks)[0] as any
  return firstMask?.bufferDistance ?? 20
})

/** Outer mode of the active mask on the current frame */
export const maskOuterModeAtom = Atom.make((get): "uniform" | "free" => {
  const layerIdResult = get(activeLayerIdAtom)
  if (!Result.isSuccess(layerIdResult) || !layerIdResult.value) return "uniform"
  const layerId = layerIdResult.value

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return "uniform"
  const layer = layersResult.value.find((l) => l.id === layerId)
  if (!layer) return "uniform"

  const framesResult = get(framesAtom)
  if (!Result.isSuccess(framesResult)) return "uniform"
  const frames = framesResult.value

  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(currentResult)) return "uniform"
  const currentIdx = currentResult.value as number

  const frame = frames[currentIdx]
  if (!frame) return "uniform"

  const masks = (layer as any).masks ?? {}
  const frameMasks = masks[frame.id]
  if (!frameMasks || typeof frameMasks !== "object") return "uniform"
  const firstMask = Object.values(frameMasks)[0] as any
  return firstMask?.outerMode ?? "uniform"
})

/** Set buffer distance on the current mask */
export const setBufferDistanceAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (distance: number, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const activeLayerId = appRegistry.get(activeLayerIdRawAtom)
    if (!activeLayerId) return

    const currentFrameResult = appRegistry.get(currentFrameAtom) as any
    const currentFrame = currentFrameResult?._tag === "Success" ? currentFrameResult.value as number : 0
    const rawFrames = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, any>
    const frames = Object.values(rawFrames).sort((a: any, b: any) => a.index - b.index)
    const frame = frames[currentFrame] as { id: string } | undefined
    if (!frame) return

    const layersMap = entry.doc.getMap("root").get("layers") as any
    if (!layersMap) return
    const layerMap = layersMap.get(activeLayerId) as any
    if (!layerMap) return
    const masksMap = layerMap.get("masks") as any
    if (!masksMap) return
    const frameMasksMap = masksMap.get(frame.id) as any
    if (!frameMasksMap) return
    const firstMaskId = frameMasksMap.keys().next().value
    if (!firstMaskId) return
    const maskMap = frameMasksMap.get(firstMaskId) as any
    if (!maskMap) return
    maskMap.set("bufferDistance", distance)
  }),
)

/** Set outer mode on the current mask */
export const setOuterModeAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (mode: "uniform" | "free", get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const activeLayerId = appRegistry.get(activeLayerIdRawAtom)
    if (!activeLayerId) return

    const currentFrameResult = appRegistry.get(currentFrameAtom) as any
    const currentFrame = currentFrameResult?._tag === "Success" ? currentFrameResult.value as number : 0
    const rawFrames = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, any>
    const frames = Object.values(rawFrames).sort((a: any, b: any) => a.index - b.index)
    const frame = frames[currentFrame] as { id: string } | undefined
    if (!frame) return

    const layersMap = entry.doc.getMap("root").get("layers") as any
    if (!layersMap) return
    const layerMap = layersMap.get(activeLayerId) as any
    if (!layerMap) return
    const masksMap = layerMap.get("masks") as any
    if (!masksMap) return
    const frameMasksMap = masksMap.get(frame.id) as any
    if (!frameMasksMap) return
    const firstMaskId = frameMasksMap.keys().next().value
    if (!firstMaskId) return
    const maskMap = frameMasksMap.get(firstMaskId) as any
    if (!maskMap) return
    maskMap.set("outerMode", mode)
  }),
)

// -- Helper: read current layerOrder from Y.Doc --

function readLayerOrder(doc: Y.Doc): LayerOrderEntry[] {
  const rootMap = doc.getMap("root")
  const arr = rootMap.get("layerOrder")
  if (!(arr instanceof Y.Array)) return []
  return arr.toArray().map((item: any) => {
    if (item instanceof Y.Map) {
      return {
        id: item.get("id") as string,
        type: item.get("type") as "layer" | "group",
        parentId: item.get("parentId") as string | null,
      }
    }
    return item as LayerOrderEntry
  })
}

function writeLayerOrder(doc: Y.Doc, entries: LayerOrderEntry[]) {
  const rootMap = doc.getMap("root")
  const arr = rootMap.get("layerOrder")
  if (!(arr instanceof Y.Array)) return
  arr.delete(0, arr.length)
  for (const entry of entries) {
    const map = new Y.Map()
    map.set("id", entry.id)
    map.set("type", entry.type)
    map.set("parentId", entry.parentId)
    arr.push([map])
  }
}

// -- Layer CRUD --

/** Create a new layer */
export const createLayerAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (name: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const layerId = crypto.randomUUID()

    const existingLayers = (entry.root.focus("layers").syncGet() ?? {}) as Record<string, Layer>
    const count = Object.keys(existingLayers).length
    const color = LAYER_COLORS[count % LAYER_COLORS.length]

    entry.doc.transact(() => {
      ;(entry.root.focus("layers").focus(layerId) as any).syncSet({
        name,
        color,
        index: count,
        groupId: null,
        masks: {},
      })

      // Append to layerOrder
      const order = readLayerOrder(entry.doc)
      order.push({ id: layerId, type: "layer", parentId: null })
      writeLayerOrder(entry.doc, order)
    })

    // Auto-select the new layer
    appRegistry.set(activeLayerIdRawAtom, layerId)

    return layerId
  }),
)

/** Discard the current mask being drawn (delete from Y.Doc) */
export const discardCurrentMaskAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (_: void, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const activeLayerId = appRegistry.get(activeLayerIdRawAtom)
    if (!activeLayerId) return

    const currentFrameResult = appRegistry.get(currentFrameAtom) as any
    const currentFrame = currentFrameResult?._tag === "Success" ? currentFrameResult.value as number : 0
    const rawFrames = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, any>
    const frames = Object.values(rawFrames).sort((a: any, b: any) => a.index - b.index)
    const frame = frames[currentFrame] as { id: string } | undefined
    if (!frame) return

    const layersMap = entry.doc.getMap("root").get("layers") as any
    if (!layersMap) return
    const layerMap = layersMap.get(activeLayerId) as any
    if (!layerMap) return
    const masksMap = layerMap.get("masks") as any
    if (!masksMap) return
    masksMap.delete(frame.id)
  }),
)

/** Delete a layer */
export const deleteLayerAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (layerId: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)

    // If deleting the active layer, deselect
    const activeId = appRegistry.get(activeLayerIdRawAtom)
    if (activeId === layerId) {
      appRegistry.set(activeLayerIdRawAtom, null)
    }

    entry.doc.transact(() => {
      // Remove from layers record
      const layersMap = entry.doc.getMap("root").get("layers")
      if (layersMap instanceof Map || (layersMap as any)?.delete) {
        ;(layersMap as any).delete(layerId)
      }

      // Remove from layerOrder
      const order = readLayerOrder(entry.doc)
      writeLayerOrder(entry.doc, order.filter((e) => e.id !== layerId))
    })
  }),
)

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

/** Copy mask from previous frame to current frame for the active layer */
export const copyMaskFromPreviousAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (_: void, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const activeLayerId = appRegistry.get(activeLayerIdRawAtom)
    if (!activeLayerId) return

    const currentFrameResult = appRegistry.get(currentFrameAtom) as any
    const currentFrame = currentFrameResult?._tag === "Success" ? currentFrameResult.value as number : 0
    if (currentFrame <= 0) return

    const rawFrames = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, any>
    const frames = Object.values(rawFrames).sort((a: any, b: any) => a.index - b.index)
    const prevFrame = frames[currentFrame - 1] as { id: string } | undefined
    const currFrame = frames[currentFrame] as { id: string } | undefined
    if (!prevFrame || !currFrame) return

    entry.doc.transact(() => {
      const prevFrameMasks = entry.root
        .focus("layers").focus(activeLayerId).focus("masks").focus(prevFrame.id)
        .syncGet() as Record<string, any> | undefined

      if (prevFrameMasks) {
        const currFrameLens = entry.root
          .focus("layers").focus(activeLayerId).focus("masks").focus(currFrame.id) as any

        // Ensure frame record exists
        if (!currFrameLens.syncGet()) {
          currFrameLens.syncSet({})
        }

        // Copy each mask with a new ID
        for (const [_oldMaskId, maskData] of Object.entries(prevFrameMasks)) {
          const newMaskId = crypto.randomUUID()
          ;(currFrameLens.focus(newMaskId) as any).syncSet(maskData)
        }
      }
    })
  }),
)

/** Duplicate a layer */
export const duplicateLayerAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (layerId: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const existingLayers = (entry.root.focus("layers").syncGet() ?? {}) as Record<string, Layer>
    const source = existingLayers[layerId]
    if (!source) return

    const newId = crypto.randomUUID()
    const count = Object.keys(existingLayers).length

    entry.doc.transact(() => {
      ;(entry.root.focus("layers").focus(newId) as any).syncSet({
        name: source.name + " copy",
        color: source.color,
        index: count,
        groupId: source.groupId,
        masks: {},
      })

      // Insert after the source in layerOrder
      const order = readLayerOrder(entry.doc)
      const sourceIdx = order.findIndex((e) => e.id === layerId)
      const parentId = sourceIdx >= 0 ? order[sourceIdx].parentId : null
      const newEntry: LayerOrderEntry = { id: newId, type: "layer", parentId }
      if (sourceIdx >= 0) {
        order.splice(sourceIdx + 1, 0, newEntry)
      } else {
        order.push(newEntry)
      }
      writeLayerOrder(entry.doc, order)
    })

    // Auto-select the new layer
    appRegistry.set(activeLayerIdRawAtom, newId)

    return newId
  }),
)

/** Reorder layers — writes the full tree structure to layerOrder */
export const reorderLayersAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (
    order: Array<{ id: string; groupId: string | null }>,
    get: Atom.FnContext,
  ) {
    const entry = yield* get.result(activeEntryAtom)

    entry.doc.transact(() => {
      // Update layers record: index + groupId
      const layersMap = entry.doc.getMap("root").get("layers") as any
      if (layersMap) {
        for (let i = 0; i < order.length; i++) {
          const { id, groupId } = order[i]
          const layerMap = layersMap.get(id) as any
          if (!layerMap) continue
          layerMap.set("index", i)
          layerMap.set("groupId", groupId)
        }
      }

      // Rebuild layerOrder from the tree
      // The order array only has layers — we need to also include groups
      // Get existing groups from layerOrder to preserve them
      const existingOrder = readLayerOrder(entry.doc)
      const groupEntries = existingOrder.filter((e) => e.type === "group")
      const groupIds = new Set(groupEntries.map((e) => e.id))

      // Build new layerOrder: groups first, then layers interleaved
      // Strategy: reconstruct tree order from the flat layer order + group membership
      const newOrder: LayerOrderEntry[] = []
      const processedGroups = new Set<string>()

      for (const { id, groupId } of order) {
        // If this layer belongs to a group we haven't emitted yet, emit the group first
        if (groupId && groupIds.has(groupId) && !processedGroups.has(groupId)) {
          newOrder.push({ id: groupId, type: "group", parentId: null })
          processedGroups.add(groupId)
        }
        newOrder.push({ id, type: "layer", parentId: groupId })
      }

      // Add any remaining groups that have no children
      for (const g of groupEntries) {
        if (!processedGroups.has(g.id)) {
          newOrder.push(g)
        }
      }

      writeLayerOrder(entry.doc, newOrder)
    })
  }),
)

// -- Layer groups --

export const layerGroupsAtom = (() => {
  let rawAtom: Atom.Atom<Record<string, LayerGroup> | undefined> | undefined
  return Atom.make((get): Result.Result<Array<LayerGroup & { id: string }>> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<Array<LayerGroup & { id: string }>>
    if (!rawAtom) {
      rawAtom = result.value.root.focus("layerGroups").atom() as Atom.Atom<Record<string, LayerGroup> | undefined>
    }
    const record = (get(rawAtom) as Record<string, LayerGroup> | undefined) ?? {}
    const groups = Object.entries(record)
      .map(([id, group]) => ({ ...group, id }))
      .sort((a, b) => a.index - b.index)
    return Result.success(groups)
  })
})()

/** Create a new layer group */
export const createLayerGroupAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (name: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const groupId = crypto.randomUUID()

    const existingGroups = (entry.root.focus("layerGroups").syncGet() ?? {}) as Record<string, LayerGroup>
    const count = Object.keys(existingGroups).length

    entry.doc.transact(() => {
      ;(entry.root.focus("layerGroups").focus(groupId) as any).syncSet({
        name,
        index: count,
      })

      // Append to layerOrder
      const order = readLayerOrder(entry.doc)
      order.push({ id: groupId, type: "group", parentId: null })
      writeLayerOrder(entry.doc, order)
    })

    return groupId
  }),
)

/** Delete a layer group — ungroups all child layers and removes the group */
export const deleteLayerGroupAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (groupId: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)

    entry.doc.transact(() => {
      // Ungroup all child layers
      const layersMap = entry.doc.getMap("root").get("layers") as any
      if (layersMap) {
        layersMap.forEach((layerMap: any) => {
          if (layerMap.get("groupId") === groupId) {
            layerMap.set("groupId", null)
          }
        })
      }

      // Delete the group record
      const groupsMap = entry.doc.getMap("root").get("layerGroups") as any
      if (groupsMap?.delete) {
        groupsMap.delete(groupId)
      }

      // Update layerOrder: remove group entry, unparent its children
      const order = readLayerOrder(entry.doc)
      const updated = order
        .filter((e) => !(e.type === "group" && e.id === groupId))
        .map((e) => e.parentId === groupId ? { ...e, parentId: null } : e)
      writeLayerOrder(entry.doc, updated)
    })
  }),
)

// -- Ruler projections: per-layer bounding box of inner mask points on current frame --

export interface RulerLayerProjection {
  color: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export const rulerProjectionsAtom = Atom.make((get): RulerLayerProjection[] => {
  const entryResult = get(activeEntryAtom)
  if (!Result.isSuccess(entryResult)) return []
  const { root } = entryResult.value

  const framesResult = get(framesAtom)
  const currentResult = get(currentFrameAtom)
  if (!Result.isSuccess(framesResult) || !Result.isSuccess(currentResult)) return []
  const frame = framesResult.value[currentResult.value as number]
  if (!frame) return []

  const layersResult = get(layersAtom)
  if (!Result.isSuccess(layersResult)) return []

  const result: RulerLayerProjection[] = []
  for (const layer of layersResult.value) {
    try {
      const layerData = (root.focus("layers").focus(layer.id) as any).syncGet()
      const frameMasks = layerData?.masks?.[frame.id]
      if (!frameMasks || typeof frameMasks !== "object") continue

      let xMin = Infinity, xMax = -Infinity
      let yMin = Infinity, yMax = -Infinity

      for (const maskId of Object.keys(frameMasks)) {
        try {
          const maskData = (root.focus("layers").focus(layer.id) as any)
            .focus("masks").focus(frame.id).focus(maskId).syncGet()
          const inner = maskData?.inner
          if (!Array.isArray(inner)) continue
          for (const pt of inner as Array<{ x: number; y: number }>) {
            if (pt.x < xMin) xMin = pt.x
            if (pt.x > xMax) xMax = pt.x
            if (pt.y < yMin) yMin = pt.y
            if (pt.y > yMax) yMax = pt.y
          }
        } catch { /* skip */ }
      }

      if (xMin !== Infinity) {
        result.push({ color: layer.color, xMin, xMax, yMin, yMax })
      }
    } catch { /* skip */ }
  }
  return result
})
