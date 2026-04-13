import { useRef, useCallback } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtom, useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import { BrowserKeyValueStore } from "@effect/platform-browser"
import * as S from "effect/Schema"
import { appRegistry } from "../lib/atom-registry"
import { layersAtom, layerGroupsAtom, activeLayerIdAtom } from "../lib/layer-atoms"
import { canvasActor, CanvasEvent } from "../lib/canvas-machine"
import { TimelineLayers, buildTree, expandedGroupIdsAtom, type LayerNodeData } from "./timeline-layers"
import type { TreeNodeNested } from "@/lib/tree-types"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { tokens } from "@/tokens"

import type { Frame } from "@nur/core"

interface TimelineProps {
  frames: Frame[]
  currentFrame: number
  onFrameSelect: (index: number) => void
  lastModified?: number
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
  return new Date(timestamp).toLocaleDateString()
}

const CELL_W = tokens.timeline.cellBaseWidth
const HEADER_H = tokens.timeline.headerHeight
const ROW_H = 28

const FPS = 24

const timelineRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)

const zoomLevelAtom = Atom.kvs({
  runtime: timelineRuntime,
  key: "nur-timeline-zoom",
  schema: S.Number,
  defaultValue: () => 1,
}).pipe(Atom.keepAlive)

const showTimeAtom = Atom.kvs({
  runtime: timelineRuntime,
  key: "nur-timeline-show-time",
  schema: S.Boolean,
  defaultValue: () => false,
}).pipe(Atom.keepAlive)

const scrollPositionAtom = Atom.kvs({
  runtime: timelineRuntime,
  key: "nur-timeline-scroll",
  schema: S.Struct({ x: S.Number, y: S.Number }),
  defaultValue: () => ({ x: 0, y: 0 }),
}).pipe(Atom.keepAlive)

const isScrubbingAtom = Atom.make(false)
const gridContainerHeightAtom = Atom.make(200)

// -- Scrubbing --

let scrubbingCallback: ((clientX: number) => void) | null = null

function onScrubbingMouseMove(e: MouseEvent) {
  scrubbingCallback?.(e.clientX)
}
function onScrubbingMouseUp() {
  appRegistry.set(isScrubbingAtom, false)
  document.removeEventListener("mousemove", onScrubbingMouseMove)
  document.removeEventListener("mouseup", onScrubbingMouseUp)
}

appRegistry.subscribe(isScrubbingAtom, (scrubbing) => {
  if (scrubbing) {
    document.addEventListener("mousemove", onScrubbingMouseMove)
    document.addEventListener("mouseup", onScrubbingMouseUp)
  }
})

interface GroupRowInfo {
  visualRow: number
  groupId: string  // actual group ID (without "group-" prefix)
  isExpanded: boolean
  childLayerIds: string[]  // all direct child layer IDs (for collapsed aggregation)
}

/**
 * Walk the tree and compute { layerId -> visual row index }.
 * Groups occupy a row but don't get a track. Collapsed groups hide their children.
 */
function computeVisualRowMap(
  tree: TreeNodeNested<LayerNodeData>[],
  expandedIds: string[],
): { layerRows: Record<string, number>; groupRows: GroupRowInfo[]; totalRows: number } {
  const expandedSet = new Set(expandedIds)
  const layerRows: Record<string, number> = {}
  const groupRows: GroupRowInfo[] = []
  let row = 0

  function walk(nodes: TreeNodeNested<LayerNodeData>[]) {
    for (const node of nodes) {
      if (node.data.type === "group") {
        const isExpanded = expandedSet.has(node.id)
        const childLayerIds = (node.children ?? [])
          .filter((c) => c.data.type === "layer")
          .map((c) => c.data.layerId)
        groupRows.push({
          visualRow: row,
          groupId: node.data.layerId,
          isExpanded,
          childLayerIds,
        })
        row++ // group header occupies a row
        // Only recurse into children if group is expanded
        if (isExpanded && node.children) {
          walk(node.children)
        }
      } else {
        layerRows[node.data.layerId] = row
        row++
      }
    }
  }

  walk(tree)
  return { layerRows, groupRows, totalRows: row }
}

// -- Component --

export function Timeline({ frames, currentFrame, onFrameSelect, lastModified }: TimelineProps) {
  const frameCount = frames.length
  const [zoomLevel] = useAtom(zoomLevelAtom)
  const [showTime, setShowTime] = useAtom(showTimeAtom)
  const layersResult = useAtomValue(layersAtom)
  const layers = Result.isSuccess(layersResult) ? layersResult.value : []
  const groupsResult = useAtomValue(layerGroupsAtom)
  const groups = Result.isSuccess(groupsResult) ? groupsResult.value : []
  const activeLayerIdResult = useAtomValue(activeLayerIdAtom)
  const activeLayerId = Result.isSuccess(activeLayerIdResult) ? activeLayerIdResult.value : null
  // Layer selection via machine events

  // Build tree and compute visual row positions (groups take rows but don't get tracks)
  const expandedIds = useAtomValue(expandedGroupIdsAtom)
  const treeItems = buildTree(layers, groups)
  const { layerRows, groupRows, totalRows } = computeVisualRowMap(treeItems, expandedIds)

  const gridRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const [gridContainerHeight, setGridContainerHeight] = useAtom(gridContainerHeightAtom)

  const cellW = CELL_W * zoomLevel
  const gridWidth = Math.max(frameCount * cellW, 200)
  const bodyHeight = Math.max(totalRows * ROW_H, gridContainerHeight - HEADER_H, ROW_H)

  // -- Scrubbing helpers --

  const positionToFrame = useCallback(
    (clientX: number): number => {
      if (!gridRef.current) return 0
      const rect = gridRef.current.getBoundingClientRect()
      const x = clientX - rect.left + gridRef.current.scrollLeft
      return Math.max(0, Math.min(Math.floor(x / cellW), frameCount - 1))
    },
    [cellW, frameCount],
  )

  // Reverse map: visual row index -> layer id
  const rowToLayerId: Record<number, string> = {}
  for (const [layerId, row] of Object.entries(layerRows)) {
    rowToLayerId[row] = layerId
  }

  const positionToLayerId = useCallback(
    (clientY: number): string | null => {
      if (!gridRef.current) return null
      const rect = gridRef.current.getBoundingClientRect()
      const y = clientY - rect.top + gridRef.current.scrollTop - HEADER_H
      if (y < 0) return null
      const row = Math.floor(y / ROW_H)
      return rowToLayerId[row] ?? null
    },
    [layerRows],
  )

  scrubbingCallback = (clientX: number) => {
    onFrameSelect(positionToFrame(clientX))
  }

  // Single click — jump to frame
  const handleGridClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || frameCount === 0) return
      onFrameSelect(positionToFrame(e.clientX))
    },
    [frameCount, onFrameSelect, positionToFrame],
  )

  // Double click — jump to frame + enter edit mode (select layer)
  const handleGridDblClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || frameCount === 0) return
      onFrameSelect(positionToFrame(e.clientX))
      const layerId = positionToLayerId(e.clientY)
      if (layerId) {
        canvasActor?.sendSync(CanvasEvent.SelectLayer({ layerId }))
      }
    },
    [frameCount, onFrameSelect, positionToFrame, positionToLayerId],
  )

  // Sync vertical scroll between label panel and grid + persist
  const handleGridScroll = useCallback(() => {
    if (gridRef.current && labelRef.current) {
      labelRef.current.scrollTop = gridRef.current.scrollTop
      appRegistry.set(scrollPositionAtom, {
        x: gridRef.current.scrollLeft,
        y: gridRef.current.scrollTop,
      })
    }
  }, [])

  // Zoom with ctrl+scroll
  const gridRefCallback = useCallback((el: HTMLDivElement | null) => {
    ;(gridRef as any).current = el
    if (!el) return

    // Restore scroll position on mount
    const saved = appRegistry.get(scrollPositionAtom)
    el.scrollLeft = saved.x
    el.scrollTop = saved.y
    if (labelRef.current) {
      labelRef.current.scrollTop = saved.y
    }

    // Measure container height for full-height slots
    const observer = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 200
      setGridContainerHeight(h)
    })
    observer.observe(el)

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const prev = appRegistry.get(zoomLevelAtom)
        const next = e.deltaY < 0
          ? Math.min(5, prev + 0.1)
          : Math.max(0.5, prev - 0.1)
        appRegistry.set(zoomLevelAtom, parseFloat(next.toFixed(1)))
      }
    }
    el.addEventListener("wheel", handleWheel, { passive: false })

    // React 19 ref cleanup
    return () => {
      observer.disconnect()
      el.removeEventListener("wheel", handleWheel)
    }
  }, [])

  const handleZoomReset = useCallback(() => {
    appRegistry.set(zoomLevelAtom, 1)
  }, [])

  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    appRegistry.set(zoomLevelAtom, parseFloat(e.target.value))
  }, [])

  if (frameCount === 0 && layers.length === 0) {
    return (
      <div className="flex items-center px-4 py-2 min-h-16 bg-background">
        <p className="text-muted-foreground text-sm">No frames imported</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Main area: layers + grid */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* Left: layer tree */}
        <ResizablePanel defaultSize="20%" minSize="10%" maxSize="40%">
          <div className="h-full overflow-hidden">
            <TimelineLayers headerHeight={HEADER_H} scrollRef={labelRef} />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right: frame grid */}
        <ResizablePanel defaultSize="80%" minSize="40%">
          <div
            ref={gridRefCallback}
            className="h-full overflow-auto scrollbar-thin"
            onClick={handleGridClick}
            onDoubleClick={handleGridDblClick}
        onScroll={handleGridScroll}
      >
        <svg
          width={gridWidth}
          height={HEADER_H + bodyHeight}
          className="block"
        >
          {/* Background */}
          <rect
            x={0} y={0}
            width={gridWidth} height={HEADER_H + bodyHeight}
            fill={tokens.color.timeline.bg}
          />

          {/* Frame number header */}
          {Array.from({ length: frameCount }, (_, i) => {
            const x = i * cellW
            const isCurrent = i === currentFrame
            const showLabel = zoomLevel >= 1 || (zoomLevel >= 0.5 ? (i + 1) % 5 === 0 || i === 0 : (i + 1) % 10 === 0 || i === 0)
            if (showLabel) {
              return (
                <text
                  key={`h-${i}`}
                  x={x + cellW / 2}
                  y={HEADER_H - 4}
                  textAnchor="middle"
                  fill={isCurrent ? tokens.color.timeline.playhead : tokens.color.timeline.label}
                  fontSize={tokens.timeline.labelFontSize}
                  fontWeight={isCurrent ? 700 : 400}
                >
                  {showTime ? `${(i / FPS).toFixed(1)}s` : i + 1}
                </text>
              )
            }
            // When label is hidden due to zoom, show a tiny tick for the current frame
            if (isCurrent) {
              return (
                <circle
                  key={`h-${i}`}
                  cx={x + cellW / 2}
                  cy={HEADER_H - 4}
                  r={1.5}
                  fill={tokens.color.timeline.playhead}
                />
              )
            }
            return null
          })}

          {/* Header separator */}
          <line
            x1={0} y1={HEADER_H}
            x2={gridWidth} y2={HEADER_H}
            stroke={tokens.color.timeline.grid}
            strokeWidth={1}
          />

          {/* Grid lines (vertical) */}
          {Array.from({ length: frameCount + 1 }, (_, i) => (
            <line
              key={`v-${i}`}
              x1={i * cellW} y1={HEADER_H}
              x2={i * cellW} y2={HEADER_H + bodyHeight}
              stroke={tokens.color.timeline.grid}
              strokeWidth={1}
            />
          ))}

          {/* Layer tracks background (distinct from empty space below) */}
          {totalRows > 0 && (
            <rect
              x={0} y={HEADER_H}
              width={gridWidth} height={totalRows * ROW_H}
              fill="rgba(255,255,255,0.02)"
            />
          )}

          {/* Group row backgrounds (dimmed) */}
          {groupRows.map((gr) => (
            <rect
              key={`group-bg-${gr.groupId}`}
              x={0}
              y={HEADER_H + gr.visualRow * ROW_H}
              width={gridWidth}
              height={ROW_H}
              fill="rgba(255,255,255,0.03)"
              style={{ pointerEvents: "none" }}
            />
          ))}

          {/* Grid lines (horizontal) — one per visual row (layers + groups) */}
          {Array.from({ length: totalRows }, (_, i) => (
            <line
              key={`h-${i}`}
              x1={0} y1={HEADER_H + (i + 1) * ROW_H}
              x2={gridWidth} y2={HEADER_H + (i + 1) * ROW_H}
              stroke={tokens.color.timeline.grid}
              strokeWidth={1}
            />
          ))}

          {/* Frame-layer intersection slots (only for layer rows, not group rows) */}
          {layers.map((layer) => {
            const visualRow = layerRows[layer.id]
            if (visualRow === undefined) return null
            const maskFrameIds = new Set(Object.keys((layer as any).masks ?? {}))
            return Array.from({ length: frameCount }, (_, frameIdx) => {
              const x = frameIdx * cellW
              const y = HEADER_H + visualRow * ROW_H
              const hasMask = maskFrameIds.has(frames[frameIdx]?.id ?? "")
              return (
                <g key={`slot-${layer.id}-${frameIdx}`}>
                  {/* Hover target */}
                  <rect
                    x={x} y={y}
                    width={cellW} height={ROW_H}
                    fill="transparent"
                    className="timeline-slot"
                    style={{ cursor: "pointer" }}
                  />
                  {/* Mask dot — only when this layer has mask data on this frame */}
                  {hasMask && (
                    <circle
                      cx={x + cellW / 2}
                      cy={y + ROW_H / 2}
                      r={3}
                      fill={layer.color}
                      opacity={0.8}
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                </g>
              )
            })
          })}

          {/* Collapsed group slots — aggregate mask dots from child layers */}
          {groupRows.filter((gr) => !gr.isExpanded).map((gr) => {
            // Collect all mask frame IDs from child layers
            const childLayers = gr.childLayerIds.map((id) => layers.find((l) => l.id === id)).filter(Boolean)
            const masksByFrame: Record<number, string[]> = {} // frameIdx -> [layer colors]
            for (const layer of childLayers) {
              const maskFrameIds = new Set(Object.keys((layer as any).masks ?? {}))
              for (let fi = 0; fi < frameCount; fi++) {
                if (maskFrameIds.has(frames[fi]?.id ?? "")) {
                  if (!masksByFrame[fi]) masksByFrame[fi] = []
                  masksByFrame[fi].push(layer!.color)
                }
              }
            }

            const y = HEADER_H + gr.visualRow * ROW_H
            return Array.from({ length: frameCount }, (_, frameIdx) => {
              const x = frameIdx * cellW
              const colors = masksByFrame[frameIdx]
              return (
                <g key={`gslot-${gr.groupId}-${frameIdx}`}>
                  <rect
                    x={x} y={y}
                    width={cellW} height={ROW_H}
                    fill="transparent"
                    className="timeline-slot"
                    style={{ cursor: "default" }}
                  />
                  {colors && colors.length > 0 && (
                    <circle
                      cx={x + cellW / 2}
                      cy={y + ROW_H / 2}
                      r={3}
                      fill={colors[0]}
                      opacity={0.5}
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                </g>
              )
            })
          })}

          {/* Active layer left indicator */}
          {activeLayerId && (() => {
            const visualRow = layerRows[activeLayerId]
            if (visualRow === undefined) return null
            return (
              <rect
                x={0}
                y={HEADER_H + visualRow * ROW_H}
                width={3}
                height={ROW_H}
                fill={tokens.color.timeline.playhead}
                rx={1}
              />
            )
          })()}

          {/* Current frame column overlay */}
          {currentFrame >= 0 && currentFrame < frameCount && (
            <rect
              x={currentFrame * cellW} y={HEADER_H}
              width={cellW} height={bodyHeight}
              fill={tokens.color.timeline.playhead}
              opacity={0.08}
              style={{ pointerEvents: "none" }}
            />
          )}
        </svg>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Footer bar */}
      <div className="flex items-center gap-3 px-3 py-1 border-t border-border text-xs text-muted-foreground flex-shrink-0">
        {/* Frame stats */}
        {frameCount > 0 && (
          <>
            <button
              onClick={() => setShowTime(!showTime)}
              className="flex items-center gap-1 px-1 -mx-1 rounded hover:bg-accent/50 transition-colors"
              aria-label={showTime ? "Show frame numbers" : "Show timecodes"}
              title={showTime ? "Show frame numbers" : "Show timecodes"}
            >
              <span className="tabular-nums">
                {showTime
                  ? `${(currentFrame / FPS).toFixed(2)}s / ${(frameCount / FPS).toFixed(1)}s`
                  : `Frame ${currentFrame + 1} / ${frameCount}`
                }
              </span>
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {showTime ? (
                  <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8M12 8v8" /></>
                ) : (
                  <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>
                )}
              </svg>
            </button>
            <span className="text-border">·</span>
            <span className="tabular-nums">
              {(frameCount / FPS).toFixed(1)}s @{FPS}fps
            </span>
          </>
        )}
        {frameCount === 0 && <span>No frames</span>}

        {lastModified && (
          <>
            <span className="text-border">·</span>
            <span>Saved {formatRelativeTime(lastModified)}</span>
          </>
        )}

        <div className="flex-1" />

        {/* Zoom controls */}
        {frameCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomReset}
              className="p-0.5 rounded hover:bg-accent/50 transition-colors"
              aria-label="Reset zoom"
              title="Reset zoom"
            >
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
              </svg>
            </button>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={zoomLevel}
              onChange={handleZoomSlider}
              className="w-20 h-1 accent-muted-foreground cursor-pointer"
              aria-label="Timeline zoom"
            />
            <span className="w-8 text-right tabular-nums">{Math.round(zoomLevel * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}
