import { useEffect, useState } from "react"
import { getCachedFrameImage, loadAndCacheFrameImage } from "../lib/frame-image-cache"

export function useFrameImage(contentHash: string | undefined): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement | undefined>(
    contentHash ? getCachedFrameImage(contentHash) : undefined
  )

  useEffect(() => {
    if (!contentHash) {
      setImage(undefined)
      return
    }

    const cached = getCachedFrameImage(contentHash)
    if (cached) {
      setImage(cached)
      return
    }

    let cancelled = false
    loadAndCacheFrameImage(contentHash)
      .then((img) => { if (!cancelled) setImage(img) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [contentHash])

  return image
}
