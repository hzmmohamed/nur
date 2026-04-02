import { createFileRoute, Link, useBlocker } from "@tanstack/react-router"
import { useCallback } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet, useAtomMount } from "@effect-atom/atom-react/Hooks"
import { projectsAtom } from "../hooks/use-project-index"
import {
  activeProjectIdAtom,
  activeEntryAtom,
  projectNameAtom,
  framesAtom,
  currentFrameAtom,
  setCurrentFrameAtom,
} from "../lib/project-doc-atoms"
import { FrameDropZone } from "../components/frame-drop-zone"
import { Timeline } from "../components/timeline"
import { EditorLayout } from "../components/editor-layout"
import { importFnAtom, importProgressAtom } from "../lib/import-atoms"
import { canvasContainerAtom, canvasAtom } from "../lib/canvas-atom"
import { appRegistry } from "../lib/atom-registry"
import { registerHotkeyContext } from "../actors/hotkey-manager"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  setActiveToolAtom,
  setActivePathIdAtom,
} from "../lib/path-atoms"
import { setActiveLayerIdAtom } from "../lib/layer-atoms"

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

// -- Hotkey registration --

function setupEditorHotkeys() {
  registerHotkeyContext({
    id: "editor",
    bindings: [
      {
        key: "ArrowRight",
        handler: () => {
          const framesResult = appRegistry.get(framesAtom) as any
          const currentResult = appRegistry.get(currentFrameAtom) as any
          const frames = framesResult?._tag === "Success" ? framesResult.value : []
          const current = currentResult?._tag === "Success" ? currentResult.value : 0
          appRegistry.set(setCurrentFrameAtom, Math.min(current + 1, frames.length - 1))
        },
      },
      {
        key: "ArrowLeft",
        handler: () => {
          const currentResult = appRegistry.get(currentFrameAtom) as any
          const current = currentResult?._tag === "Success" ? currentResult.value : 0
          appRegistry.set(setCurrentFrameAtom, Math.max(current - 1, 0))
        },
      },
      {
        key: "v",
        handler: () => appRegistry.set(setActiveToolAtom, "select"),
      },
      {
        key: "p",
        handler: () => appRegistry.set(setActiveToolAtom, "pen"),
      },
      {
        key: "Escape",
        handler: () => {
          appRegistry.set(setActivePathIdAtom, null)
          appRegistry.set(setActiveLayerIdAtom, null)
        },
      },
    ],
  })
}

// -- Hotkey setup atom (runs once) --
const editorHotkeyAtom = Atom.make(() => {
  setupEditorHotkeys()
}).pipe(Atom.keepAlive)

function ProjectEditorPage() {
  const { id } = Route.useParams()
  const projects = useAtomValue(projectsAtom)

  // Set active project ID
  appRegistry.set(activeProjectIdAtom, id)

  if (!(id in projects)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <Button variant="link" asChild>
          <Link to="/">Go to home</Link>
        </Button>
      </div>
    )
  }

  const entryResult = useAtomValue(activeEntryAtom)
  if (!Result.isSuccess(entryResult)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    )
  }

  return <ProjectEditor />
}

function ProjectEditor() {
  // -- Mount reactive atoms --
  useAtomMount(canvasAtom)
  useAtomMount(editorHotkeyAtom)

  // -- Read-only atom values for rendering --
  const nameResult = useAtomValue(projectNameAtom)
  const name = nameResult._tag === "Success" ? nameResult.value as string | undefined : undefined

  const framesResult = useAtomValue(framesAtom)
  const frames = framesResult._tag === "Success" ? framesResult.value : []

  const currentFrameResult = useAtomValue(currentFrameAtom)
  const currentFrame = currentFrameResult._tag === "Success" ? currentFrameResult.value : 0

  const triggerSetFrame = useAtomSet(setCurrentFrameAtom)

  const frameCount = frames.length

  // -- Import --
  const triggerImport = useAtomSet(importFnAtom)
  const importResult = useAtomValue(importFnAtom)
  const importProgress = useAtomValue(importProgressAtom)
  const isImporting = Result.isWaiting(importResult)

  useBlocker({
    shouldBlockFn: () => {
      if (!isImporting) return false
      const leave = window.confirm("Import in progress. Abort and leave?")
      if (leave) triggerImport(Atom.Interrupt)
      return !leave
    },
    enableBeforeUnload: () => isImporting,
  })

  const handleFilesSelected = useCallback((files: FileList) => {
    triggerImport(files)
  }, [triggerImport])

  // -- Container ref callback writes to atom --
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    appRegistry.set(canvasContainerAtom, el)
  }, [])

  return (
    <EditorLayout
      header={
        <header className="flex items-center gap-4 px-4 py-2 border-b border-border">
          <Button variant="link" asChild>
            <Link to="/">Back</Link>
          </Button>
          <h1 className="text-lg font-semibold">{name || "Untitled"}</h1>
          <p className="text-sm text-muted-foreground">
            {frameCount} frames
          </p>
          {frameCount > 0 && (
            <p className="text-sm text-muted-foreground">
              Frame {currentFrame + 1} / {frameCount}
            </p>
          )}
        </header>
      }
      canvas={
        <div className="relative h-full overflow-hidden">
          <div ref={containerRef} className="w-full h-full" />
          {(frameCount === 0 || isImporting) && (
            <div className="absolute inset-0">
              <FrameDropZone
                onFilesSelected={handleFilesSelected}
                progress={importProgress}
                isImporting={isImporting}
              />
            </div>
          )}
        </div>
      }
      timeline={
        <Timeline
          frameCount={frameCount}
          currentFrame={currentFrame}
          onFrameSelect={(index) => triggerSetFrame(index)}
          width={0}
        />
      }
    />
  )
}
