/**
 * Canvas interaction state machine.
 *
 * Single source of truth for all canvas interaction modes.
 * Replaces 6 independent writable atoms with guaranteed state transitions.
 *
 * States: Viewing → Editing → NewMask/NewMaskClosed/EditMask
 * Side effects (hotkey scope, Y.Doc writes) attached to transitions via slots.
 */

import * as S from "effect/Schema"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"
import { Machine, State, Event, Slot } from "effect-machine/v3"
import { Atom } from "@effect-atom/atom"
import { appRegistry } from "./atom-registry"

// ── State Schema ────────────────────────────────────────────

export const CanvasState = State({
  Viewing: {},
  Editing: {
    layerId: S.String,
  },
  NewMask: {
    layerId: S.String,
  },
  NewMaskClosed: {
    layerId: S.String,
  },
  EditMask: {
    layerId: S.String,
    maskId: S.String,
    mode: S.Literal("uniform", "free"),
    target: S.Literal("inner", "outer"),
  },
})

export type CanvasStateType = typeof CanvasState.Type

// ── Event Schema ────────────────────────────────────────────

export const CanvasEvent = Event({
  SelectLayer: { layerId: S.String },
  DeselectLayer: {},
  StartNewMask: {},
  ClosePath: {},
  CommitMask: {},
  DiscardMask: {},
  EnterEditMask: { maskId: S.String },
  ExitEditMask: {},
  SetOuterMode: { mode: S.Literal("uniform", "free") },
  SetEditingTarget: { target: S.Literal("inner", "outer") },
})

// ── Slots ───────────────────────────────────────────────────

const Effects = Slot.Effects({
  pushDrawingHotkeys: {},
  popDrawingHotkeys: {},
  discardMaskData: {},
})

// ── Machine ─────────────────────────────────────────────────

export const canvasMachine = Machine.make({
  state: CanvasState,
  event: CanvasEvent,
  effects: Effects,
  initial: CanvasState.Viewing,
})

  // Viewing → Editing
  .on(CanvasState.Viewing, CanvasEvent.SelectLayer, ({ event }) =>
    CanvasState.Editing({ layerId: event.layerId }),
  )

  // Editing → Viewing
  .on(CanvasState.Editing, CanvasEvent.DeselectLayer, () =>
    CanvasState.Viewing,
  )

  // EditMask → Viewing (can exit directly)
  .on(CanvasState.EditMask, CanvasEvent.DeselectLayer, () =>
    CanvasState.Viewing,
  )

  // Editing → NewMask
  .on(CanvasState.Editing, CanvasEvent.StartNewMask, ({ state, effects }) =>
    Effect.gen(function* () {
      yield* effects.pushDrawingHotkeys()
      return CanvasState.NewMask({ layerId: state.layerId })
    }),
  )

  // NewMask → NewMaskClosed
  .on(CanvasState.NewMask, CanvasEvent.ClosePath, ({ state }) =>
    CanvasState.NewMaskClosed({ layerId: state.layerId }),
  )

  // NewMaskClosed → Editing (commit)
  .on(CanvasState.NewMaskClosed, CanvasEvent.CommitMask, ({ state, effects }) =>
    Effect.gen(function* () {
      yield* effects.popDrawingHotkeys()
      return CanvasState.Editing({ layerId: state.layerId })
    }),
  )

  // NewMask → Editing (discard — path not closed)
  .on(CanvasState.NewMask, CanvasEvent.DiscardMask, ({ state, effects }) =>
    Effect.gen(function* () {
      yield* effects.popDrawingHotkeys()
      yield* effects.discardMaskData()
      return CanvasState.Editing({ layerId: state.layerId })
    }),
  )

  // NewMaskClosed → Editing (discard — user changed their mind)
  .on(CanvasState.NewMaskClosed, CanvasEvent.DiscardMask, ({ state, effects }) =>
    Effect.gen(function* () {
      yield* effects.popDrawingHotkeys()
      yield* effects.discardMaskData()
      return CanvasState.Editing({ layerId: state.layerId })
    }),
  )

  // Editing → EditMask
  .on(CanvasState.Editing, CanvasEvent.EnterEditMask, ({ state, event }) =>
    CanvasState.EditMask({ layerId: state.layerId, maskId: event.maskId, mode: "uniform", target: "inner" }),
  )

  // EditMask → Editing (back)
  .on(CanvasState.EditMask, CanvasEvent.ExitEditMask, ({ state }) =>
    CanvasState.Editing({ layerId: state.layerId }),
  )

  // EditMask: change outer mode (reenter)
  .reenter(CanvasState.EditMask, CanvasEvent.SetOuterMode, ({ state, event }) =>
    CanvasState.EditMask.derive(state, { mode: event.mode }),
  )

  // EditMask: change editing target (reenter)
  .reenter(CanvasState.EditMask, CanvasEvent.SetEditingTarget, ({ state, event }) =>
    CanvasState.EditMask.derive(state, { target: event.target }),
  )

  // Editing: SelectLayer switches to different layer
  .on(CanvasState.Editing, CanvasEvent.SelectLayer, ({ event }) =>
    CanvasState.Editing({ layerId: event.layerId }),
  )

  // EditMask: SelectLayer switches (exits edit mask, enters editing on new layer)
  .on(CanvasState.EditMask, CanvasEvent.SelectLayer, ({ event }) =>
    CanvasState.Editing({ layerId: event.layerId }),
  )

// ── Machine State Atom ──────────────────────────────────────

/**
 * Reactive atom holding the current canvas machine state.
 * Updated by the machine actor's subscribe callback.
 * All derived atoms read from this.
 */
export const canvasMachineStateAtom = Atom.make<CanvasStateType>(
  { _tag: "Viewing" } as CanvasStateType,
)

/** @derived from canvas machine — do not set directly */
export const editingMaskIdAtom = Atom.make((get): string | null => {
  const state = get(canvasMachineStateAtom)
  return state._tag === "EditMask" ? (state as any).maskId : null
})

// ── Actor Reference ─────────────────────────────────────────

/**
 * Mutable reference to the spawned machine actor.
 * Set by spawnCanvasMachine(), read by UI components via sendSync().
 */
export let canvasActor: { sendSync: (event: any) => void } | null = null

/**
 * Spawn the canvas machine actor. Call once when the project loads.
 * Subscribes to state changes and writes to canvasMachineStateAtom.
 * Returns a cleanup function that stops the actor.
 */
export function spawnCanvasMachine(slotImpls: {
  pushDrawingHotkeys: () => void
  popDrawingHotkeys: () => void
  discardMaskData: () => void
}): () => void {
  const builtMachine = canvasMachine.build({
    pushDrawingHotkeys: () => Effect.sync(slotImpls.pushDrawingHotkeys),
    popDrawingHotkeys: () => Effect.sync(slotImpls.popDrawingHotkeys),
    discardMaskData: () => Effect.sync(slotImpls.discardMaskData),
  })

  // Create a scope and spawn the actor into it
  const scope = Effect.runSync(Scope.make())
  const actor = Effect.runSync(
    Machine.spawn(builtMachine).pipe(
      Effect.provideService(Scope.Scope, scope),
    ),
  )

  canvasActor = actor

  // Subscribe to state changes → update atom
  const unsub = actor.subscribe((state: CanvasStateType) => {
    appRegistry.set(canvasMachineStateAtom, state)
  })

  return () => {
    unsub()
    canvasActor = null
    Effect.runSync(Scope.close(scope, Exit.void))
  }
}

