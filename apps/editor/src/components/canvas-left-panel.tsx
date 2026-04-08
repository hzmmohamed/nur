import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  canvasMachineStateAtom,
  canvasActor,
  CanvasEvent,
  editingMaskIdAtom,
} from "../lib/canvas-machine"
import {
  layersAtom,
  activeLayerIdAtom,
  activeLayerAtom,
  currentFrameHasMaskAtom,
  previousFrameMaskExistsAtom,
  currentFrameMaskCountAtom,
  maskBufferDistanceAtom,
  maskOuterModeAtom,
  setBufferDistanceAtom,
  setOuterModeAtom,
  editingPathTargetAtom,
  editMaskModeAtom,
  copyMaskFromPreviousAtom,
} from "../lib/layer-atoms"
import {
  framesAtom,
  currentFrameAtom,
  currentFrameRawAtom,
} from "../lib/project-doc-atoms"
import { zoomRawAtom } from "../lib/viewport-atoms"
import { maskThumbnailAtom, maskThumbnailKey, renderMaskThumbnail } from "../lib/mask-thumbnail"
import { drawingStateAtom } from "../lib/path-atoms"
import { appRegistry } from "../lib/atom-registry"
import { commitNewMask, discardNewMask } from "../lib/drawing-actions"
import { buildSvgPathData } from "../lib/canvas-objects/bezier-math"
import { Button } from "@/components/ui/button"

// ── Main component ─────────────────────────────────────────

export function CanvasLeftPanel() {
  const machineState = useAtomValue(canvasMachineStateAtom)
  const tag = (machineState as any)._tag as string

  // Common reads
  const framesResult = useAtomValue(framesAtom)
  const frames = framesResult._tag === "Success" ? framesResult.value : []
  const frameCount = frames.length
  const currentFrameResult = useAtomValue(currentFrameAtom) as Result.Result<number>
  const currentFrame = Result.isSuccess(currentFrameResult)
    ? currentFrameResult.value
    : 0
  const layersResult = useAtomValue(layersAtom)
  const layers = Result.isSuccess(layersResult) ? layersResult.value : []

  // Empty states
  if (frameCount === 0) {
    return (
      <PanelShell>
        <EmptyState message="Import frames to get started" />
      </PanelShell>
    )
  }
  if (layers.length === 0) {
    return (
      <PanelShell>
        <FrameHeader currentFrame={currentFrame} frameCount={frameCount} variant="title" showNav />
        <EmptyState message="Add layers in the timeline to start masking" />
      </PanelShell>
    )
  }

  // Extract layerId from machine state (present on all non-Viewing states)
  const layerId = (machineState as any).layerId as string | undefined

  switch (tag) {
    case "NewMask":
    case "NewMaskClosed":
      return (
        <NewMaskPanel
          currentFrame={currentFrame}
          frameCount={frameCount}
          layerId={layerId!}
          layers={layers}
          isClosed={tag === "NewMaskClosed"}
        />
      )
    case "EditMask":
      return (
        <EditMaskPanel
          currentFrame={currentFrame}
          frameCount={frameCount}
          layerId={layerId!}
          layers={layers}
          maskId={(machineState as any).maskId as string}
        />
      )
    case "Editing":
      return (
        <EditingPanel
          currentFrame={currentFrame}
          frameCount={frameCount}
          layers={layers}
          frames={frames}
          layerId={layerId!}
        />
      )
    default:
      // Viewing
      return (
        <ViewingPanel
          currentFrame={currentFrame}
          frameCount={frameCount}
          layers={layers}
          frames={frames}
        />
      )
  }
}

// ── Shell & shared sub-components ──────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto scrollbar-thin animate-in fade-in duration-150">
      {children}
    </div>
  )
}

const HEADER_HEIGHT = "h-10"

function PanelHeader({
  title,
  color,
  onBack,
}: {
  title: string
  color?: string
  onBack: () => void
}) {
  return (
    <div className={`flex items-center px-3 border-b border-border ${HEADER_HEIGHT}`}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 flex-shrink-0"
        onClick={onBack}
        title="Back"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold">
        {color && <div className="size-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        {title}
      </span>
      <div className="w-7 flex-shrink-0" />
    </div>
  )
}

function FrameHeader({
  currentFrame,
  frameCount,
  showNav,
  variant = "secondary",
}: {
  currentFrame: number
  frameCount: number
  showNav?: boolean
  variant?: "title" | "secondary"
}) {
  const isTitle = variant === "title"
  return (
    <div className={`flex items-center justify-center gap-2 px-3 ${isTitle ? `${HEADER_HEIGHT} border-b border-border` : "py-1.5"}`}>
      {showNav && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={currentFrame <= 0}
          onClick={() => appRegistry.set(currentFrameRawAtom, currentFrame - 1)}
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
      )}
      <span className={`tabular-nums ${isTitle ? "text-sm font-semibold" : "text-xs text-muted-foreground"}`}>
        Frame {currentFrame + 1} / {frameCount}
      </span>
      {showNav && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={currentFrame >= frameCount - 1}
          onClick={() => appRegistry.set(currentFrameRawAtom, currentFrame + 1)}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <p className="text-sm text-muted-foreground text-center">{message}</p>
    </div>
  )
}

function LayerIndicator({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border">
      <div
        className="size-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-medium">{name}</span>
    </div>
  )
}

// ── ViewingPanel ───────────────────────────────────────────

function ViewingPanel({
  currentFrame,
  frameCount,
  layers,
  frames,
}: {
  currentFrame: number
  frameCount: number
  layers: Array<{ id: string; name: string; color: string }>
  frames: Array<{ id: string }>
}) {
  const frame = frames[currentFrame]

  return (
    <PanelShell>
      <FrameHeader currentFrame={currentFrame} frameCount={frameCount} variant="title" showNav />
      <div className="px-3 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Masks on this frame
        </h3>
        {layers.filter((layer) => {
          const fm = frame ? ((layer as any).masks?.[frame.id] ?? {}) : {}
          return Object.keys(fm).length > 0
        }).map((layer) => {
          const frameMasks = frame
            ? ((layer as any).masks?.[frame.id] ?? {})
            : {}
          const maskEntries = Object.entries(frameMasks)
          return (
            <div key={layer.id} className="mb-1">
              <div className="flex items-center gap-1.5 py-1">
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="text-xs">{layer.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {maskEntries.length}
                </span>
              </div>
              {maskEntries.map(([maskId, mask], idx) => (
                <div
                  key={maskId}
                  className="flex items-center gap-2 pl-5 py-0.5 rounded hover:bg-accent/50 cursor-pointer"
                  onClick={() =>
                    canvasActor?.sendSync(
                      CanvasEvent.SelectLayer({ layerId: layer.id }),
                    )
                  }
                >
                  {frame && <MaskThumbnail layerId={layer.id} frameId={frame.id} maskId={maskId} />}
                  <span className="text-xs text-muted-foreground">
                    {(mask as any).name ?? `#${idx + 1}`}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </PanelShell>
  )
}

// ── EditingPanel ───────────────────────────────────────────

function EditingPanel({
  currentFrame,
  frameCount,
  layers,
  frames,
  layerId,
}: {
  currentFrame: number
  frameCount: number
  layers: Array<{ id: string; name: string; color: string }>
  frames: Array<{ id: string }>
  layerId: string
}) {
  const layer = layers.find((l) => l.id === layerId)
  const hasMask = useAtomValue(currentFrameHasMaskAtom)
  const hasPrevMask = useAtomValue(previousFrameMaskExistsAtom)
  const triggerCopyMask = useAtomSet(copyMaskFromPreviousAtom)
  const frame = frames[currentFrame]
  const frameMasks = frame
    ? ((layer as any)?.masks?.[frame.id] ?? {})
    : {}
  const maskEntries = Object.entries(frameMasks)

  return (
    <PanelShell>
      <PanelHeader
        title={layer?.name ?? "Layer"}
        color={layer?.color}
        onBack={() => canvasActor?.sendSync(CanvasEvent.DeselectLayer)}
      />
      <FrameHeader currentFrame={currentFrame} frameCount={frameCount} showNav />

      <div className="px-3 py-2 space-y-3">
        {/* Actions — consistent location above the list */}
        <div className="flex gap-2">
          <Button
            variant="default"
            className="flex-1 gap-1.5"
            onClick={() => canvasActor?.sendSync(CanvasEvent.StartNewMask)}
          >
            <PenIcon className="size-4" />
            New Mask
          </Button>
          {!hasMask && hasPrevMask && (
            <Button
              variant="secondary"
              className="flex-1 gap-1.5"
              onClick={() => triggerCopyMask()}
            >
              <CopyIcon className="size-4" />
              Copy from Previous
            </Button>
          )}
        </div>

        {/* Masks on this frame for focused layer */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Masks ({maskEntries.length})
          </h3>
          {maskEntries.length > 0 ? (
            maskEntries.map(([maskId, mask], idx) => (
              <div
                key={maskId}
                className="flex items-center gap-2 py-1 rounded hover:bg-accent/50 cursor-pointer"
                onClick={() =>
                  canvasActor?.sendSync(CanvasEvent.EnterEditMask({ maskId }))
                }
              >
                {frame && <MaskThumbnail layerId={layerId} frameId={frame.id} maskId={maskId} />}
                <span className="text-xs">
                  {(mask as any).name ?? `#${idx + 1}`}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground/60 py-1">No masks on this frame</p>
          )}
        </div>
      </div>

      {/* Other layers */}
      <div className="px-3 py-2 border-t border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Other layers
        </h3>
        {layers
          .filter((l) => {
            if (l.id === layerId) return false
            const fm = frame ? ((l as any).masks?.[frame.id] ?? {}) : {}
            return Object.keys(fm).length > 0
          })
          .map((l) => {
            const otherFrameMasks = frame
              ? ((l as any).masks?.[frame.id] ?? {})
              : {}
            const count = Object.keys(otherFrameMasks).length
            return (
              <div
                key={l.id}
                className="flex items-center gap-1.5 py-1 rounded hover:bg-accent/50 cursor-pointer"
                onClick={() =>
                  canvasActor?.sendSync(
                    CanvasEvent.SelectLayer({ layerId: l.id }),
                  )
                }
              >
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
                <span className="text-xs">{l.name}</span>
                {count > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {count}
                  </span>
                )}
              </div>
            )
          })}
      </div>
    </PanelShell>
  )
}

// ── NewMaskPanel ───────────────────────────────────────────

function NewMaskPanel({
  currentFrame,
  frameCount,
  layerId,
  layers,
  isClosed,
}: {
  currentFrame: number
  frameCount: number
  layerId: string
  layers: Array<{ id: string; name: string; color: string }>
  isClosed: boolean
}) {
  const layer = layers.find((l) => l.id === layerId)

  return (
    <PanelShell>
      <PanelHeader
        title={layer?.name ?? "New Mask"}
        color={layer?.color}
        onBack={discardNewMask}
      />
      <FrameHeader currentFrame={currentFrame} frameCount={frameCount} />
      <div className="px-3 py-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          {isClosed
            ? "Path closed. Click Done to commit."
            : "Click to add points. Click first point to close the path."}
        </p>
        <div className="flex gap-2">
          <span
            title={
              !isClosed
                ? "Close the path by clicking the first point"
                : undefined
            }
          >
            <Button
              variant={isClosed ? "default" : "ghost"}
              size="sm"
              className="text-xs"
              disabled={!isClosed}
              onClick={commitNewMask}
            >
              Done
            </Button>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive"
            onClick={discardNewMask}
          >
            Discard
          </Button>
        </div>
      </div>
    </PanelShell>
  )
}

// ── EditMaskPanel ──────────────────────────────────────────

function EditMaskPanel({
  currentFrame,
  frameCount,
  layerId,
  layers,
  maskId,
}: {
  currentFrame: number
  frameCount: number
  layerId: string
  layers: Array<{ id: string; name: string; color: string }>
  maskId: string
}) {
  const layer = layers.find((l) => l.id === layerId)
  const bufferDistance = useAtomValue(maskBufferDistanceAtom)
  const outerMode = useAtomValue(maskOuterModeAtom)
  const triggerSetBuffer = useAtomSet(setBufferDistanceAtom)
  const triggerSetOuterMode = useAtomSet(setOuterModeAtom)
  const editingTarget = useAtomValue(editingPathTargetAtom)

  return (
    <PanelShell>
      <PanelHeader
        title={layer?.name ?? "Edit Mask"}
        color={layer?.color}
        onBack={() => canvasActor?.sendSync(CanvasEvent.ExitEditMask)}
      />
      <FrameHeader currentFrame={currentFrame} frameCount={frameCount} />
      <div className="px-3 py-3 space-y-4">

        {/* Mode toggle */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Mode</label>
          <div className="flex gap-1">
            <Button
              variant={outerMode === "uniform" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => triggerSetOuterMode("uniform")}
            >
              Uniform
            </Button>
            <Button
              variant={outerMode === "free" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => triggerSetOuterMode("free")}
            >
              Free
            </Button>
          </div>
        </div>

        {/* Inner/Outer — free mode only */}
        {outerMode === "free" && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Editing</label>
            <div className="flex gap-1">
              <Button
                variant={editingTarget === "inner" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() =>
                  canvasActor?.sendSync(
                    CanvasEvent.SetEditingTarget({ target: "inner" }),
                  )
                }
              >
                Inner
              </Button>
              <Button
                variant={editingTarget === "outer" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1 text-xs"
                onClick={() =>
                  canvasActor?.sendSync(
                    CanvasEvent.SetEditingTarget({ target: "outer" }),
                  )
                }
              >
                Outer
              </Button>
            </div>
          </div>
        )}

        {/* Buffer distance */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Buffer</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="2"
              max="100"
              step="1"
              value={bufferDistance}
              onChange={(e) => triggerSetBuffer(Number(e.target.value))}
              className="flex-1 h-1 accent-muted-foreground cursor-pointer"
            />
            <input
              type="number"
              min="2"
              max="200"
              step="1"
              value={bufferDistance}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!isNaN(v) && v >= 2) triggerSetBuffer(v)
              }}
              className="w-12 h-6 px-1 text-xs text-right tabular-nums bg-transparent border border-border rounded outline-none focus:border-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground/60">
            Drag outer path to adjust visually
          </p>
        </div>

      </div>
    </PanelShell>
  )
}

// ── Icons ──────────────────────────────────────────────────

function MaskThumbnail({ layerId, frameId, maskId }: { layerId: string; frameId: string; maskId: string }) {
  const key = maskThumbnailKey(layerId, frameId, maskId)
  const data = useAtomValue(maskThumbnailAtom(key))

  if (!data) {
    return <div className="size-6 rounded bg-muted/30 flex-shrink-0" />
  }

  return (
    <canvas
      className="size-6 rounded flex-shrink-0"
      width={40}
      height={40}
      ref={(el) => {
        if (el) renderMaskThumbnail(el, data.points, data.color)
      }}
    />
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
