import { createFileRoute, Link, useBlocker } from "@tanstack/react-router"
import { useRef, useCallback } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet, useAtomMount } from "@effect-atom/atom-react/Hooks"
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
import {
  registerHotkeyContext,
  unregisterHotkeyContext,
} from "../actors/hotkey-manager"
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
  const setTool = useAtomSet(setActiveToolAtom(id))

  const pathIdResult = useAtomValue(activePathIdAtom(id))
  const activePathId = Result.isSuccess(pathIdResult) ? pathIdResult.value : null
  const setActivePathId = useAtomSet(setActivePathIdAtom(id))

  // -- Lazily initialize overlay on first interaction, dispose on unmount --
  const getOverlay = useCallback((stage: Konva.Stage): PathsOverlay | null => {
    if (!entry) return null
    if (!overlayRef.current) {
      overlayRef.current = new PathsOverlay(stage, entry.root, {
        onSelectPath: (pathId) => setActivePathId(pathId),
      })
    }
    overlayRef.current.setFrame(currentFrameData?.id ?? null)
    return overlayRef.current
  }, [entry, currentFrameData?.id, setActivePathId])

  // Stable cleanup atom — keepAlive prevents re-dispose on re-renders
  const overlayCleanupAtom = Atom.make((get) => {
    get.addFinalizer(() => {
      overlayRef.current?.dispose()
      overlayRef.current = null
    })
  }).pipe(Atom.keepAlive)
  useAtomMount(overlayCleanupAtom)

  // Update overlay when frame changes and sync active path styling
  // Safe to call during render — these are cheap idempotent checks on the ref
  overlayRef.current?.setFrame(currentFrameData?.id ?? null)
  overlayRef.current?.setActivePathId(activePathId)

  // -- Stage click handler for pen tool --
  const handleStageClick = useCallback((stage: Konva.Stage) => {
    penLog.withContext({ activeTool, hasEntry: !!entry, activePathId }).info("handleStageClick called")
    if (activeTool !== "pen") {
      penLog.withContext({ activeTool }).debug("activeTool is not pen, returning")
      return
    }
    const pos = stage.getPointerPosition()
    penLog.withContext({ pos: pos ? `${pos.x},${pos.y}` : "null" }).debug("pointer position")
    if (!pos) return

    const overlay = getOverlay(stage)
    penLog.withContext({ hasOverlay: !!overlay, currentFrameId: currentFrameData?.id }).debug("overlay check")
    if (!overlay) return

    let pathId = activePathId
    if (!pathId) {
      pathId = overlay.createPath()
      penLog.withContext({ pathId }).info("created new path")
      if (!pathId) return
      setActivePathId(pathId)
    }

    const bp = overlay.getPath(pathId)
    penLog.withContext({ pathId, hasBP: !!bp }).debug("getPath result")
    if (bp) {
      bp.appendPoint(pos.x, pos.y)
      penLog.withContext({ x: pos.x, y: pos.y, pathId }).info("appended point")
    }
  }, [activeTool, activePathId, setActivePathId, getOverlay, entry, currentFrameData?.id])

  // Import atoms
  const importFn = importFnAtom(id)
  const triggerImport = useAtomSet(importFn)
  const importResult = useAtomValue(importFn)
  const importProgress = useAtomValue(importProgressAtom(id))
  const isImporting = Result.isWaiting(importResult)

  // Block navigation while importing — confirm dialog + abort on proceed
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

  // Canvas resize observer
  const canvasResizeAtom = Atom.make((get) => {
    const el = mainRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        get.set(canvasSizeAtom, {
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        })
      }
    })
    observer.observe(el)
    get.addFinalizer(() => observer.disconnect())
  })
  useAtomMount(canvasResizeAtom)

  // Timeline width observer
  const timelineResizeAtom = Atom.make((get) => {
    const el = timelineRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        get.set(timelineWidthAtom, Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(el)
    get.addFinalizer(() => observer.disconnect())
  })
  useAtomMount(timelineResizeAtom)

  // Register hotkey context for arrow key navigation + tool switching
  const hotkeyAtom = Atom.make((get) => {
    registerHotkeyContext({
      id: "editor",
      bindings: [
        {
          key: "ArrowRight",
          handler: () => triggerSetFrame(Math.min(currentFrame + 1, frameCount - 1)),
        },
        {
          key: "ArrowLeft",
          handler: () => triggerSetFrame(Math.max(currentFrame - 1, 0)),
        },
        {
          key: "v",
          handler: () => setTool("select"),
        },
        {
          key: "p",
          handler: () => setTool("pen"),
        },
        {
          key: "Escape",
          handler: () => setActivePathId(null),
        },
      ],
    })
    get.addFinalizer(() => unregisterHotkeyContext("editor"))
  })
  useAtomMount(hotkeyAtom)

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

      <main ref={mainRef} className="flex-1 relative overflow-hidden">
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
          />
        )}
      </main>

      <div ref={timelineRef}>
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
