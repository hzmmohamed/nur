import { createFileRoute, Link, useBlocker } from "@tanstack/react-router"
import { useCallback } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet, useAtomMount } from "@effect-atom/atom-react/Hooks"
import { projectsAtom } from "../hooks/use-project-index"
import {
  projectDocEntryAtom,
  projectNameAtom,
  framesAtom,
  currentFrameAtom,
  setCurrentFrameAtom,
} from "../lib/project-doc-atoms"
import { FrameDropZone } from "../components/frame-drop-zone"
import { Timeline } from "../components/timeline"
import { Toolbar } from "../components/toolbar"
import { importFnAtom, importProgressAtom } from "../lib/import-atoms"
import { canvasContainerAtom, canvasAtom } from "../lib/canvas-atom"
import { appRegistry } from "../lib/atom-registry"
import { registerHotkeyContext } from "../actors/hotkey-manager"
import { Button } from "@/components/ui/button"
import {
  setActiveToolAtom,
  setActivePathIdAtom,
} from "../lib/path-atoms"

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

// -- Hotkey registration (reads current values from atoms via registry) --

function setupEditorHotkeys(projectId: string) {
  registerHotkeyContext({
    id: "editor",
    bindings: [
      {
        key: "ArrowRight",
        handler: () => {
          const framesResult = appRegistry.get(framesAtom(projectId)) as any
          const currentResult = appRegistry.get(currentFrameAtom(projectId)) as any
          const frames = framesResult?._tag === "Success" ? framesResult.value : []
          const current = currentResult?._tag === "Success" ? currentResult.value : 0
          appRegistry.set(setCurrentFrameAtom(projectId), Math.min(current + 1, frames.length - 1))
        },
      },
      {
        key: "ArrowLeft",
        handler: () => {
          const currentResult = appRegistry.get(currentFrameAtom(projectId)) as any
          const current = currentResult?._tag === "Success" ? currentResult.value : 0
          appRegistry.set(setCurrentFrameAtom(projectId), Math.max(current - 1, 0))
        },
      },
      {
        key: "v",
        handler: () => appRegistry.set(setActiveToolAtom(projectId), "select"),
      },
      {
        key: "p",
        handler: () => appRegistry.set(setActiveToolAtom(projectId), "pen"),
      },
      {
        key: "Escape",
        handler: () => appRegistry.set(setActivePathIdAtom(projectId), null),
      },
    ],
  })
}

// -- Hotkey setup atom (per project, runs once) --
const editorHotkeyAtom = Atom.family((projectId: string) =>
  Atom.make(() => {
    setupEditorHotkeys(projectId)
  }).pipe(Atom.keepAlive),
)

function ProjectEditorPage() {
  const { id } = Route.useParams()
  const projects = useAtomValue(projectsAtom)

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

  const entryResult = useAtomValue(projectDocEntryAtom(id))
  if (!Result.isSuccess(entryResult)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  return <ProjectEditor id={id} />
}

function ProjectEditor({ id }: { id: string }) {
  // -- Mount reactive atoms --
  useAtomMount(canvasAtom(id))
  useAtomMount(editorHotkeyAtom(id))

  // -- Read-only atom values for rendering --
  const nameResult = useAtomValue(projectNameAtom(id))
  const name = nameResult._tag === "Success" ? nameResult.value as string | undefined : undefined

  const framesResult = useAtomValue(framesAtom(id))
  const frames = framesResult._tag === "Success" ? framesResult.value : []

  const currentFrameResult = useAtomValue(currentFrameAtom(id))
  const currentFrame = currentFrameResult._tag === "Success" ? currentFrameResult.value : 0

  const triggerSetFrame = useAtomSet(setCurrentFrameAtom(id))

  const frameCount = frames.length

  // -- Import --
  const importFn = importFnAtom(id)
  const triggerImport = useAtomSet(importFn)
  const importResult = useAtomValue(importFn)
  const importProgress = useAtomValue(importProgressAtom(id))
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
    triggerImport({ files, projectId: id })
  }, [triggerImport, id])

  // -- Container ref callback writes to atom --
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    appRegistry.set(canvasContainerAtom(id), el)
  }, [id])

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-border">
        <Button variant="link" asChild>
          <Link to="/">Back</Link>
        </Button>
        <Toolbar projectId={id} />
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

      <main className="flex-1 relative overflow-hidden">
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
      </main>

      <div>
        <Timeline
          frameCount={frameCount}
          currentFrame={currentFrame}
          onFrameSelect={(index) => triggerSetFrame(index)}
          width={0}
        />
      </div>
    </div>
  )
}
