import { createFileRoute, Link, useBlocker } from "@tanstack/react-router"
import { useRef, useCallback } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import Konva from "konva"
import { projectsAtom } from "../hooks/use-project-index"
import {
  projectReadyAtom,
  projectNameAtom,
  framesAtom,
  currentFrameAtom,
  setCurrentFrameAtom,
  projectDocEntryAtom,
} from "../lib/project-doc-atoms"
import { FrameDropZone } from "../components/frame-drop-zone"
import { FrameCanvas, type FrameCanvasHandle } from "../components/frame-canvas"
import { Timeline } from "../components/timeline"
import { Toolbar } from "../components/toolbar"
import { importFnAtom, importProgressAtom } from "../lib/import-atoms"
import {
  activeToolAtom,
  activePathIdAtom,
  setActiveToolAtom,
  setActivePathIdAtom,
} from "../lib/path-atoms"
import { PathsOverlay } from "../lib/canvas-objects/paths-overlay"
import { appRegistry } from "../lib/atom-registry"
import { registerHotkeyContext } from "../actors/hotkey-manager"
import { Button } from "@/components/ui/button"
import { createModuleLogger } from "../lib/logger"

const penLog = createModuleLogger("pen-tool")

const canvasSizeAtom = Atom.make({ width: 0, height: 0 })
const timelineWidthAtom = Atom.make(0)

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

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

  const readyResult = useAtomValue(projectReadyAtom(id))
  if (!Result.isSuccess(readyResult)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  return <ProjectEditor id={id} />
}

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

function ProjectEditor({ id }: { id: string }) {
  const nameResult = useAtomValue(projectNameAtom(id))
  const name = nameResult._tag === "Success" ? nameResult.value as string | undefined : undefined

  const framesResult = useAtomValue(framesAtom(id))
  const frames = framesResult._tag === "Success" ? framesResult.value : []

  const currentFrameResult = useAtomValue(currentFrameAtom(id))
  const currentFrame = currentFrameResult._tag === "Success" ? currentFrameResult.value : 0

  const triggerSetFrame = useAtomSet(setCurrentFrameAtom(id))

  const mainRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<FrameCanvasHandle>(null)
  const overlayRef = useRef<PathsOverlay | null>(null)
  const canvasSize = useAtomValue(canvasSizeAtom)
  const timelineWidth = useAtomValue(timelineWidthAtom)
  const timelineRef = useRef<HTMLDivElement>(null)

  const frameCount = frames.length
  const currentFrameData = frames.find((f) => f.index === currentFrame)

  // -- Project doc entry (for PathsOverlay) --
  const entryResult = useAtomValue(projectDocEntryAtom(id))
  const entry = entryResult._tag === "Success" ? entryResult.value : null

  // -- Tool state --
  const toolResult = useAtomValue(activeToolAtom(id))
  const activeTool = Result.isSuccess(toolResult) ? toolResult.value : "select"

  const pathIdResult = useAtomValue(activePathIdAtom(id))
  const activePathId = Result.isSuccess(pathIdResult) ? pathIdResult.value : null
  const setActivePathId = useAtomSet(setActivePathIdAtom(id))

  // -- Create overlay eagerly when stage is ready --
  const handleStageReady = useCallback((stage: Konva.Stage) => {
    penLog.withContext({ hasOverlay: !!overlayRef.current, hasEntry: !!entry, frameId: currentFrameData?.id }).info("handleStageReady")
    if (overlayRef.current || !entry) return
    overlayRef.current = new PathsOverlay(stage, entry.root, {
      onSelectPath: (pathId) => appRegistry.set(setActivePathIdAtom(id), pathId),
    })
    overlayRef.current.setFrame(currentFrameData?.id ?? null)
  }, [entry, currentFrameData?.id, id])

  // Update overlay when frame changes and sync active path styling
  // Deferred to avoid setState-during-render when lens creates Y structures
  const currentFrameId = currentFrameData?.id ?? null
  const prevFrameIdRef = useRef<string | null>(null)
  const prevActivePathIdRef = useRef<string | null>(null)
  if (overlayRef.current && (currentFrameId !== prevFrameIdRef.current || activePathId !== prevActivePathIdRef.current)) {
    prevFrameIdRef.current = currentFrameId
    prevActivePathIdRef.current = activePathId
    queueMicrotask(() => {
      overlayRef.current?.setFrame(currentFrameId)
      overlayRef.current?.setActivePathId(activePathId)
    })
  }

  // -- Stage click handler for pen tool --
  const handleStageClick = useCallback((stage: Konva.Stage) => {
    const overlay = overlayRef.current
    penLog.withContext({ activeTool, hasOverlay: !!overlay, activePathId }).info("handleStageClick called")
    if (activeTool !== "pen") return

    const pos = stage.getPointerPosition()
    if (!pos || !overlay) return

    let pathId = activePathId
    if (!pathId) {
      pathId = overlay.createPath()
      if (!pathId) return
      setActivePathId(pathId)
    }

    const bp = overlay.getPath(pathId)
    if (bp) {
      bp.appendPoint(pos.x, pos.y)
    }
  }, [activeTool, activePathId, setActivePathId])

  // Import atoms
  const importFn = importFnAtom(id)
  const triggerImport = useAtomSet(importFn)
  const importResult = useAtomValue(importFn)
  const importProgress = useAtomValue(importProgressAtom(id))
  const isImporting = Result.isWaiting(importResult)

  // Block navigation while importing
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

  // -- Imperative ResizeObservers (no atoms needed) --
  const mainRefCallback = useCallback((el: HTMLDivElement | null) => {
    (mainRef as any).current = el
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        appRegistry.set(canvasSizeAtom, {
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const timelineRefCallback = useCallback((el: HTMLDivElement | null) => {
    (timelineRef as any).current = el
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        appRegistry.set(timelineWidthAtom, Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // -- Hotkeys: register on mount, unregister on unmount --
  const hotkeySetupRef = useRef(false)
  if (!hotkeySetupRef.current) {
    setupEditorHotkeys(id)
    hotkeySetupRef.current = true
  }

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

      <main ref={mainRefCallback} className="flex-1 relative overflow-hidden">
        {frameCount === 0 || isImporting ? (
          <FrameDropZone
            onFilesSelected={handleFilesSelected}
            progress={importProgress}
            isImporting={isImporting}
          />
        ) : (
          <FrameCanvas
            ref={canvasRef}
            contentHash={currentFrameData?.contentHash}
            width={canvasSize.width}
            height={canvasSize.height}
            frameWidth={currentFrameData?.width ?? 1}
            frameHeight={currentFrameData?.height ?? 1}
            onStageClick={handleStageClick}
            onStageReady={handleStageReady}
          />
        )}
      </main>

      <div ref={timelineRefCallback}>
        <Timeline
          frameCount={frameCount}
          currentFrame={currentFrame}
          onFrameSelect={(index) => triggerSetFrame(index)}
          width={timelineWidth}
        />
      </div>
    </div>
  )
}
