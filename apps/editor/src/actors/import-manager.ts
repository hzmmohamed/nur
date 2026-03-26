import { Machine, State, Event, Slot } from "effect-machine/v3"
import { Schema } from "effect"
import { Atom } from "@effect-atom/atom"
import { syncSet } from "../lib/atom-registry"

// -- State --

const ImportState = State({
  Idle: {},
  Preparing: { fileCount: Schema.Number },
  Importing: { total: Schema.Number, completed: Schema.Number },
  Done: { imported: Schema.Number },
  Error: { message: Schema.String },
})

// -- Events --

const ImportEvent = Event({
  StartImport: { fileCount: Schema.Number },
  FilesPrepared: { total: Schema.Number },
  ImportProgress: { completed: Schema.Number, total: Schema.Number },
  ImportComplete: { imported: Schema.Number },
  ImportFailed: { message: Schema.String },
  Reset: {},
})

// -- Effects --

const ImportEffects = Slot.Effects({
  prepareAndImport: { fileCount: Schema.Number },
})

// -- Progress atom --

export interface ImportProgress {
  readonly state: "idle" | "preparing" | "importing" | "done" | "error"
  readonly total: number
  readonly completed: number
  readonly message?: string
}

export const importProgressAtom: Atom.Writable<ImportProgress> = Atom.make<ImportProgress>({
  state: "idle",
  total: 0,
  completed: 0,
})

// -- Machine definition --

export { ImportState, ImportEvent }

export const importManagerMachine = Machine.make({
  state: ImportState,
  event: ImportEvent,
  effects: ImportEffects,
  initial: ImportState.Idle,
})
  .on(ImportState.Idle, ImportEvent.StartImport, ({ event }) => {
    syncSet(importProgressAtom, { state: "preparing", total: event.fileCount, completed: 0 })
    return ImportState.Preparing({ fileCount: event.fileCount })
  })
  .spawn(ImportState.Preparing, ({ state, effects }) =>
    effects.prepareAndImport({ fileCount: state.fileCount })
  )
  .on(ImportState.Preparing, ImportEvent.ImportProgress, ({ event }) => {
    syncSet(importProgressAtom, { state: "importing", total: event.total, completed: event.completed })
    return ImportState.Importing({ total: event.total, completed: event.completed })
  })
  .on(ImportState.Importing, ImportEvent.ImportProgress, ({ event }) => {
    syncSet(importProgressAtom, { state: "importing", total: event.total, completed: event.completed })
    return ImportState.Importing({ total: event.total, completed: event.completed })
  })
  .on([ImportState.Preparing, ImportState.Importing], ImportEvent.ImportComplete, ({ event }) => {
    syncSet(importProgressAtom, { state: "done", total: event.imported, completed: event.imported })
    return ImportState.Done({ imported: event.imported })
  })
  .on([ImportState.Preparing, ImportState.Importing], ImportEvent.ImportFailed, ({ event }) => {
    syncSet(importProgressAtom, { state: "error", total: 0, completed: 0, message: event.message })
    return ImportState.Error({ message: event.message })
  })
  .on(ImportState.Done, ImportEvent.Reset, () => {
    syncSet(importProgressAtom, { state: "idle", total: 0, completed: 0 })
    return ImportState.Idle
  })
  .on(ImportState.Error, ImportEvent.Reset, () => {
    syncSet(importProgressAtom, { state: "idle", total: 0, completed: 0 })
    return ImportState.Idle
  })
