import { useCallback } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtom, useAtomValue } from "@effect-atom/atom-react/Hooks"
import { importProgressAtom } from "../actors/import-manager"

const dragOverAtom = Atom.make(false)

export function FrameDropZone(props: {
  onFilesSelected: (files: FileList) => void
}) {
  const [dragOver, setDragOver] = useAtom(dragOverAtom)
  const progress = useAtomValue(importProgressAtom)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      props.onFilesSelected(e.dataTransfer.files)
    }
  }, [props.onFilesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleClick = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.accept = "image/*"
    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        props.onFilesSelected(input.files)
      }
    }
    input.click()
  }, [props.onFilesSelected])

  const isImporting = progress.state === "preparing" || progress.state === "importing"

  return (
    <div
      className={`flex flex-col items-center justify-center flex-1 border-2 border-dashed rounded-lg m-4 gap-2 transition-colors ${
        dragOver ? "border-ring bg-muted/50" : "border-border bg-transparent"
      } ${isImporting ? "cursor-default" : "cursor-pointer"}`}
      onDrop={isImporting ? undefined : handleDrop}
      onDragOver={isImporting ? undefined : handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={isImporting ? undefined : handleClick}
    >
      {isImporting ? (
        <>
          <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
          <p className="text-muted-foreground">
            Importing frames... {progress.completed}/{progress.total}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-center">
          Drop image files here or click to browse
        </p>
      )}
    </div>
  )
}
