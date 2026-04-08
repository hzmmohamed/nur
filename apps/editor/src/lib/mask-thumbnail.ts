/**
 * Mask thumbnail data atom + render utility.
 *
 * The atom reads mask inner path data from Y.Doc reactively.
 * The component renders it onto a <canvas> via ref callback.
 */

import { Atom, Result } from "@effect-atom/atom"
import { activeEntryAtom } from "./project-doc-atoms"
import { buildSvgPathData } from "./canvas-objects/bezier-math"
import type { BezierPointData } from "./canvas-objects/path"

const THUMB_SIZE = 40
const THUMB_PADDING = 4

// ── Render function (called from component ref) ────────────

export function renderMaskThumbnail(
  canvas: HTMLCanvasElement,
  points: ReadonlyArray<BezierPointData>,
  color: string,
): void {
  if (points.length < 2) return

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  // Compute bounding box including bezier handle extents
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const pt of points) {
    // Control point
    if (pt.x < minX) minX = pt.x
    if (pt.y < minY) minY = pt.y
    if (pt.x > maxX) maxX = pt.x
    if (pt.y > maxY) maxY = pt.y
    // Handle-in extent
    if (pt.handleInDistance > 0) {
      const hx = pt.x + Math.cos(pt.handleInAngle) * pt.handleInDistance
      const hy = pt.y + Math.sin(pt.handleInAngle) * pt.handleInDistance
      if (hx < minX) minX = hx
      if (hy < minY) minY = hy
      if (hx > maxX) maxX = hx
      if (hy > maxY) maxY = hy
    }
    // Handle-out extent
    if (pt.handleOutDistance > 0) {
      const hx = pt.x + Math.cos(pt.handleOutAngle) * pt.handleOutDistance
      const hy = pt.y + Math.sin(pt.handleOutAngle) * pt.handleOutDistance
      if (hx < minX) minX = hx
      if (hy < minY) minY = hy
      if (hx > maxX) maxX = hx
      if (hy > maxY) maxY = hy
    }
  }

  // Add margin around the bounding box
  const margin = Math.max((maxX - minX), (maxY - minY)) * 0.1
  minX -= margin
  minY -= margin
  maxX += margin
  maxY += margin

  const pathW = maxX - minX || 1
  const pathH = maxY - minY || 1
  const drawSize = THUMB_SIZE - THUMB_PADDING * 2
  const scale = Math.min(drawSize / pathW, drawSize / pathH)
  const offsetX = THUMB_PADDING + (drawSize - pathW * scale) / 2 - minX * scale
  const offsetY = THUMB_PADDING + (drawSize - pathH * scale) / 2 - minY * scale

  // Clear
  ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE)

  // Build SVG path and render via Path2D
  const svgData = buildSvgPathData(points)
  const path = new Path2D(svgData)

  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY)

  ctx.fillStyle = color
  ctx.globalAlpha = 0.4
  ctx.fill(path)

  ctx.strokeStyle = color
  ctx.globalAlpha = 0.8
  ctx.lineWidth = 1.5 / scale
  ctx.stroke(path)

  ctx.restore()
}

// ── Atom family: reads mask data reactively ────────────────

export const maskThumbnailAtom = Atom.family((keyStr: string) =>
  Atom.make((get): { points: ReadonlyArray<BezierPointData>; color: string } | null => {
    const result = get(activeEntryAtom)
    if (!Result.isSuccess(result)) return null

    const entry = result.value
    const [layerId, frameId, maskId] = keyStr.split(":")
    if (!layerId || !frameId || !maskId) return null

    try {
      const layerData = (entry.root.focus("layers").focus(layerId) as any).syncGet()
      if (!layerData?.color) return null
      const color = layerData.color as string

      const maskData = (entry.root
        .focus("layers").focus(layerId)
        .focus("masks").focus(frameId)
        .focus(maskId) as any).syncGet()
      if (!maskData?.inner) return null

      const innerPoints = maskData.inner as ReadonlyArray<BezierPointData>
      if (!Array.isArray(innerPoints) || innerPoints.length < 2) return null

      return { points: innerPoints, color }
    } catch {
      return null
    }
  }),
)

export function maskThumbnailKey(layerId: string, frameId: string, maskId: string): string {
  return `${layerId}:${frameId}:${maskId}`
}
