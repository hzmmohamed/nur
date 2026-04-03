import { Atom, Result } from "@effect-atom/atom"
import { activeEntryAtom, projectDocRuntime } from "./project-doc-atoms"
import type { Layer } from "@nur/core"
import * as Effect from "effect/Effect"

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

// -- Active layer ID (from awareness) --

export const activeLayerIdAtom = (() => {
  let layerIdAtom: Atom.Atom<string | null | undefined> | undefined
  return Atom.make((get): Result.Result<string | null> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<string | null>
    if (!layerIdAtom) layerIdAtom = result.value.awareness.local.focus("activeLayerId").atom()
    return Result.success(get(layerIdAtom) as string | null)
  })
})()

/** Set active layer ID — writes to awareness */
export const setActiveLayerIdAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (layerId: string | null, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    ;(entry.awareness.local.focus("activeLayerId") as any).syncSet(layerId)
  }),
)

// -- Layers list (from Y.Doc) --

export const layersAtom = (() => {
  let rawAtom: Atom.Atom<Record<string, Layer> | undefined> | undefined
  return Atom.make((get): Result.Result<Array<Layer & { id: string }>> => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return result as unknown as Result.Result<Array<Layer & { id: string }>>
    if (!rawAtom) {
      rawAtom = result.value.root.focus("layers").atom() as Atom.Atom<Record<string, Layer> | undefined>
    }
    const record = (get(rawAtom) as Record<string, Layer> | undefined) ?? {}
    const layers = Object.entries(record)
      .map(([id, layer]) => ({ ...layer, id }))
      .sort((a, b) => a.index - b.index)
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

/** Create a new layer */
export const createLayerAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (name: string, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const layerId = crypto.randomUUID()

    // Determine next index and color
    const existingLayers = (entry.root.focus("layers").syncGet() ?? {}) as Record<string, Layer>
    const count = Object.keys(existingLayers).length
    const color = LAYER_COLORS[count % LAYER_COLORS.length]

    ;(entry.root.focus("layers").focus(layerId) as any).syncSet({
      name,
      color,
      index: count,
      groupId: null,
      masks: {},
    })

    // Auto-select the new layer
    ;(entry.awareness.local.focus("activeLayerId") as any).syncSet(layerId)

    return layerId
  }),
)

/** Discard the current mask being drawn (delete from Y.Doc) */
export const discardCurrentMaskAtom = projectDocRuntime.fn(
  Effect.fnUntraced(function* (_: void, get: Atom.FnContext) {
    const entry = yield* get.result(activeEntryAtom)
    const activeLayerId = (entry.awareness.local.focus("activeLayerId") as any).syncGet() as string | null
    if (!activeLayerId) return

    const currentFrame = entry.awareness.local.focus("currentFrame").syncGet() as number
    // Find the frameId for this index
    const rawFrames = (entry.root.focus("frames").syncGet() ?? {}) as Record<string, any>
    const frames = Object.values(rawFrames).sort((a: any, b: any) => a.index - b.index)
    const frame = frames[currentFrame] as { id: string } | undefined
    if (!frame) return

    // Delete the mask entry from the layer's masks record
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
    const activeId = (entry.awareness.local.focus("activeLayerId") as any).syncGet()
    if (activeId === layerId) {
      ;(entry.awareness.local.focus("activeLayerId") as any).syncSet(null)
    }

    // Remove from Y.Doc
    const layersMap = entry.doc.getMap("root").get("layers")
    if (layersMap instanceof Map || (layersMap as any)?.delete) {
      ;(layersMap as any).delete(layerId)
    }
  }),
)
