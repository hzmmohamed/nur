import { createFileRoute, Link } from "@tanstack/react-router"
import { useRef, useCallback, useMemo } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtomValue, useAtomMount } from "@effect-atom/atom-react/Hooks"
import { useProjectDoc } from "../hooks/use-project-doc"
import { useCurrentFrame } from "../hooks/use-current-frame"
import { FrameDropZone } from "../components/frame-drop-zone"
import { FrameCanvas } from "../components/frame-canvas"
import { Timeline } from "../components/timeline"
import { sortFramesByName, importFrames, type PreparedFrame, type Frame } from "@nur/core"
import { AppBlobStore } from "../lib/blob-store-layer"
import * as Effect from "effect/Effect"
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

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load: ${file.name}`))
    }
    img.src = url
  })
}

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

  // Handle file import
  const handleFilesSelected = useCallback(async (fileList: FileList) => {
    const imageFiles = Array.from(fileList).filter((f) => f.type.startsWith("image/"))
    if (imageFiles.length === 0) return

    const sorted = sortFramesByName(imageFiles)
    const prepared: Array<PreparedFrame> = []
    for (const file of sorted) {
      const [buffer, dims] = await Promise.all([
        readFileAsArrayBuffer(file),
        getImageDimensions(file),
      ])
      prepared.push({
        data: new Uint8Array(buffer),
        name: file.name,
        width: dims.width,
        height: dims.height,
      })
    }

    await Effect.runPromise(
      importFrames({
        files: prepared,
        projectRoot: root,
        startIndex: frameCount,
      }).pipe(Effect.provide(AppBlobStore))
    )
  }, [root, frameCount])

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
        {frameCount === 0 ? (
          <FrameDropZone onFilesSelected={handleFilesSelected} />
        ) : (
          <>
            <FrameCanvas
              contentHash={currentFrameData?.contentHash}
              width={canvasSize.width}
              height={canvasSize.height}
              frameWidth={currentFrameData?.width ?? 1}
              frameHeight={currentFrameData?.height ?? 1}
            />
          </>
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
