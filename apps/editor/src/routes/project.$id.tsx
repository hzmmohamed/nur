import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router"
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
import { awarenessSyncAtom } from "../lib/awareness-sync"
import { canvasMachineAtom } from "../lib/canvas-machine-lifecycle"
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
import { setZoomAtom, resetViewSignalAtom } from "../lib/viewport-atoms"
import { transitionProjectIdAtom } from "./index"

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
      {
        key: "ctrl+0",
        handler: () => {
          appRegistry.set(setZoomAtom, 1)
          appRegistry.set(resetViewSignalAtom, (appRegistry.get(resetViewSignalAtom) as number) + 1)
        },
        description: "Fit to frame",
      },
      {
        key: "ctrl+1",
        handler: () => appRegistry.set(setZoomAtom, 1),
        description: "Zoom to 100%",
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
        <Button variant="link" render={<Link to="/" />}>
          Go to home
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

  const projectMeta = projects[id]
  return <ProjectEditor metaName={projectMeta?.name} lastModified={projectMeta?.updatedAt} />
}

function ProjectEditor({ metaName, lastModified }: { metaName?: string; lastModified?: number }) {
  const navigate = useNavigate()
  const { id } = Route.useParams()

  const handleBack = useCallback(() => {
    appRegistry.set(transitionProjectIdAtom, id)
    const nav = () => navigate({ to: "/", replace: true })
    if (document.startViewTransition) {
      document.startViewTransition(nav)
    } else {
      nav()
    }
  }, [navigate, id])

  // -- Mount reactive atoms --
  useAtomMount(canvasMachineAtom)
  useAtomMount(canvasAtom)
  useAtomMount(editorHotkeyAtom)
  useAtomMount(awarenessSyncAtom)

  // -- Read-only atom values for rendering --
  const nameResult = useAtomValue(projectNameAtom)
  const docName = nameResult._tag === "Success" ? nameResult.value as string | undefined : undefined
  const name = docName || metaName || "Untitled"

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
        <header className="flex items-center gap-3 px-4 py-2 border-b border-border">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleBack}>
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Button>
          <h1 className="text-sm font-semibold">{name}</h1>
          <span className="text-xs text-muted-foreground">
            {isImporting
              ? `Importing ${importProgress.completed}/${importProgress.total}...`
              : lastModified
                ? `Saved ${formatRelativeTime(lastModified)}`
                : "No changes"
            }
          </span>
        </header>
      }
      canvas={
        <div className="relative h-full overflow-hidden" style={{ viewTransitionName: "project-canvas" }}>
          <div ref={containerRef} className="w-full h-full" />
          {(frameCount === 0 || isImporting) && (
            <FrameDropZone
              onFilesSelected={handleFilesSelected}
              progress={importProgress}
              isImporting={isImporting}
            />
          )}
        </div>
      }
      timeline={
        <Timeline
          frames={frames}
          currentFrame={currentFrame}
          onFrameSelect={(index) => triggerSetFrame(index)}
          lastModified={lastModified}
        />
      }
    />
  )
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
