import { useEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import Konva from "konva"
import * as Y from "yjs"
import { YDocument } from "effect-yjs"
import { PathDocumentSchema } from "@/lib/canvas-objects/path"
import { BezierPath } from "@/lib/canvas-objects/bezier-curve"

function BezierTestPage() {
  const container1Ref = useRef<HTMLDivElement>(null)
  const container2Ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const c1 = container1Ref.current
    const c2 = container2Ref.current
    if (!c1 || !c2) return

    // --- Create two Y.Docs ---
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    // --- Bidirectional sync ---
    doc1.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote") {
        Y.applyUpdate(doc2, update, "remote")
      }
    })
    doc2.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote") {
        Y.applyUpdate(doc1, update, "remote")
      }
    })

    // --- Bind schemas ---
    const root1 = YDocument.bind(PathDocumentSchema, doc1)
    const root2 = YDocument.bind(PathDocumentSchema, doc2)

    const lens1 = root1.focus("points")
    const lens2 = root2.focus("points")

    // --- Create Konva stages ---
    const width = Math.floor(c1.clientWidth)
    const height = Math.floor(c1.clientHeight)

    const stage1 = new Konva.Stage({
      container: c1,
      width,
      height,
    })
    const layer1 = new Konva.Layer()
    stage1.add(layer1)

    const stage2 = new Konva.Stage({
      container: c2,
      width,
      height,
    })
    const layer2 = new Konva.Layer()
    stage2.add(layer2)

    // --- Create BezierPath instances ---
    const path1 = new BezierPath(lens1, layer1)
    const path2 = new BezierPath(lens2, layer2)

    // --- Stage click handlers (click on empty area -> append point) ---
    stage1.on("click", (e) => {
      // Only handle clicks on the stage background
      if (e.target !== stage1) return
      const pos = stage1.getPointerPosition()
      if (!pos) return
      path1.appendPoint(pos.x, pos.y)
    })

    stage2.on("click", (e) => {
      if (e.target !== stage2) return
      const pos = stage2.getPointerPosition()
      if (!pos) return
      path2.appendPoint(pos.x, pos.y)
    })

    // --- Resize handler ---
    const handleResize = () => {
      if (!c1 || !c2) return
      const w = Math.floor(c1.clientWidth)
      const h = Math.floor(c1.clientHeight)
      stage1.width(w)
      stage1.height(h)
      stage2.width(w)
      stage2.height(h)
    }
    window.addEventListener("resize", handleResize)

    // --- Cleanup ---
    return () => {
      window.removeEventListener("resize", handleResize)
      path1.dispose()
      path2.dispose()
      stage1.destroy()
      stage2.destroy()
      doc1.destroy()
      doc2.destroy()
    }
  }, [])

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 border-r border-border">
        <div className="p-2 text-xs text-muted-foreground text-center">
          Doc 1 — Click to add points, drag to move
        </div>
        <div ref={container1Ref} className="w-full" style={{ height: "calc(100% - 28px)" }} />
      </div>
      <div className="flex-1">
        <div className="p-2 text-xs text-muted-foreground text-center">
          Doc 2 — Synced via direct Y.Doc update exchange
        </div>
        <div ref={container2Ref} className="w-full" style={{ height: "calc(100% - 28px)" }} />
      </div>
    </div>
  )
}

export const Route = createFileRoute("/bezier-test")({
  component: BezierTestPage,
})
