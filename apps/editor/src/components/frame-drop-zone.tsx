import { useCallback } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtom } from "@effect-atom/atom-react/Hooks"
import type { ImportProgress } from "../lib/import-atoms"

const dragOverAtom = Atom.make(false)

export function FrameDropZone(props: {
  onFilesSelected: (files: FileList) => void
  progress: ImportProgress
  isImporting: boolean
}) {
  const [dragOver, setDragOver] = useAtom(dragOverAtom)

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

  return (
    <div
      className={`flex flex-col items-center justify-center flex-1 border-2 border-dashed rounded-lg m-4 gap-2 transition-colors ${
        dragOver ? "border-ring bg-muted/50" : "border-border bg-transparent"
      } ${props.isImporting ? "cursor-default" : "cursor-pointer"}`}
      onDrop={props.isImporting ? undefined : handleDrop}
      onDragOver={props.isImporting ? undefined : handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={props.isImporting ? undefined : handleClick}
    >
      {props.isImporting ? (
        <>
          <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
          <p className="text-muted-foreground">
            Importing frames... {props.progress.completed}/{props.progress.total}
          </p>
          {props.progress.currentFile && (
            <p className="text-xs text-muted-foreground">{props.progress.currentFile}</p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-center">
          Drop image files here or click to browse
        </p>
      )}
    </div>
  )
}
