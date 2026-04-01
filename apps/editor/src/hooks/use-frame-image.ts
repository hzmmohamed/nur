import { Result } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { frameImageAtom, emptyImageAtom } from "../lib/frame-image-cache"

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const result = useAtomValue(contentHash ? frameImageAtom(contentHash) : emptyImageAtom)
  return Result.isSuccess(result) ? result.value : undefined
}
