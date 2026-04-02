import { Stage, Layer, Image as KonvaImage } from "react-konva"
import { useFrameImage } from "../hooks/use-frame-image"
import Konva from "konva"
import { forwardRef, useImperativeHandle, useRef, useCallback } from "react"

export interface FrameCanvasHandle {
  getStage(): Konva.Stage | null
}

export const FrameCanvas = forwardRef<FrameCanvasHandle, {
  contentHash: string | undefined
  width: number
  height: number
  frameWidth: number
  frameHeight: number
  onStageClick?: (stage: Konva.Stage) => void
  onStageReady?: (stage: Konva.Stage) => void
}>(function FrameCanvas(props, ref) {
  const stageRef = useRef<Konva.Stage>(null)
  const stageReadyFired = useRef(false)
  const image = useFrameImage(props.contentHash)

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
  }))

  const stageRefCallback = useCallback((node: Konva.Stage | null) => {
    (stageRef as any).current = node
    if (node && !stageReadyFired.current && props.onStageReady) {
      stageReadyFired.current = true
      props.onStageReady(node)
    }
  }, [props.onStageReady])

  if (!props.width || !props.height || !props.frameWidth || !props.frameHeight) {
    return null
  }

  const scale = Math.min(
    props.width / props.frameWidth,
    props.height / props.frameHeight
  )
  const scaledW = props.frameWidth * scale
  const scaledH = props.frameHeight * scale
  const offsetX = (props.width - scaledW) / 2
  const offsetY = (props.height - scaledH) / 2

  return (
    <Stage
      ref={stageRefCallback}
      width={props.width}
      height={props.height}
      onClick={() => {
        const stage = stageRef.current
        if (stage && props.onStageClick) props.onStageClick(stage)
      }}
    >
      <Layer>
        {image && (
          <KonvaImage
            image={image}
            x={offsetX}
            y={offsetY}
            width={scaledW}
            height={scaledH}
          />
        )}
      </Layer>
    </Stage>
  )
})
