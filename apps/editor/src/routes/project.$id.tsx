import { createFileRoute, Link, useBlocker } from "@tanstack/react-router"
import { useRef, useCallback, useMemo } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet, useAtomMount } from "@effect-atom/atom-react/Hooks"
import { useProjectDoc } from "../hooks/use-project-doc"
import { useCurrentFrame } from "../hooks/use-current-frame"
import { FrameDropZone } from "../components/frame-drop-zone"
import { FrameCanvas } from "../components/frame-canvas"
import { Timeline } from "../components/timeline"
import type { Frame } from "@nur/core"
import { importFnAtom, importProgressAtom } from "../lib/import-atoms"
import {
  registerHotkeyContext,
  unregisterHotkeyContext,
} from "../actors/hotkey-manager"
import { Button } from "@/components/ui/button"

const canvasSizeAtom = Atom.make({ width: 0, height: 0 })
const timelineWidthAtom = Atom.make(0)

export const Route = createFileRoute("/project/$id")({
  component: ProjectEditorPage,
})

function ProjectEditorPage() {
  const { id } = Route.useParams()
  const { root, doc, ready } = useProjectDoc(id)
  const { currentFrame, setCurrentFrame } = useCurrentFrame(doc)
  const mainRef = useRef<HTMLDivElement>(null)
  const canvasSize = useAtomValue(canvasSizeAtom)
  const timelineWidth = useAtomValue(timelineWidthAtom)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Reactive frames from Y.Doc
  const framesAtom = useMemo(() => root.focus("frames").atom(), [root])
  const framesRecord = useAtomValue(framesAtom) as Record<string, Frame> | undefined
  const frames = useMemo(() => {
    const record = framesRecord ?? {}
    return Object.values(record).sort((a, b) => a.index - b.index)
  }, [framesRecord])

  const frameCount = frames.length
  const currentFrameData = frames.find((f) => f.index === currentFrame)

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
    triggerImport({ files, root, startIndex: frameCount })
  }, [triggerImport, root, frameCount])

  // Canvas resize observer
  const canvasResizeAtom = useMemo(() =>
    Atom.make((get) => {
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
    }),
    [],
  )
  useAtomMount(canvasResizeAtom)

  // Timeline width observer
  const timelineResizeAtom = useMemo(() =>
    Atom.make((get) => {
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
    }),
    [],
  )
  useAtomMount(timelineResizeAtom)

  // Register hotkey context for arrow key navigation
  const hotkeyAtom = useMemo(() =>
    Atom.make((get) => {
      registerHotkeyContext({
        id: "editor",
        bindings: [
          {
            key: "ArrowRight",
            handler: () => setCurrentFrame(Math.min(currentFrame + 1, frameCount - 1)),
          },
          {
            key: "ArrowLeft",
            handler: () => setCurrentFrame(Math.max(currentFrame - 1, 0)),
          },
        ],
      })
      get.addFinalizer(() => unregisterHotkeyContext("editor"))
    }),
    [currentFrame, frameCount, setCurrentFrame],
  )
  useAtomMount(hotkeyAtom)

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  const name = root.focus("name").syncGet() || "Untitled"

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-border">
        <Button variant="link" asChild>
          <Link to="/">Back</Link>
        </Button>
        <h1 className="text-lg font-semibold">{name}</h1>
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
            contentHash={currentFrameData?.contentHash}
            width={canvasSize.width}
            height={canvasSize.height}
            frameWidth={currentFrameData?.width ?? 1}
            frameHeight={currentFrameData?.height ?? 1}
          />
        )}
      </main>

      <div ref={timelineRef}>
        <Timeline
          frameCount={frameCount}
          currentFrame={currentFrame}
          onFrameSelect={setCurrentFrame}
          width={timelineWidth}
        />
      </div>
    </div>
  )
}
