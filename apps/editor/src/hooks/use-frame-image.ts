import { useMemo } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { frameImageAtom } from "../lib/frame-image-cache"

const emptyAtom = Atom.make(Result.initial<HTMLImageElement, Error>()).pipe(Atom.keepAlive)

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const atom = useMemo(
    () => contentHash ? frameImageAtom(contentHash) : emptyAtom,
    [contentHash],
  )
  const result = useAtomValue(atom)
  return Result.isSuccess(result) ? result.value : undefined
}
