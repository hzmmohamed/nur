import { Stage, Layer, Image as KonvaImage } from "react-konva"
import { useFrameImage } from "../hooks/use-frame-image"

export function FrameCanvas(props: {
  contentHash: string | undefined
  width: number
  height: number
  frameWidth: number
  frameHeight: number
}) {
  const image = useFrameImage(props.contentHash)

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
    <Stage width={props.width} height={props.height}>
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
}
