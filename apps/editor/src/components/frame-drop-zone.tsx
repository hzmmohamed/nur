import { useState, useCallback } from "react"
import { css } from "../../styled-system/css"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import { importProgressAtom } from "../actors/import-manager"
import { Text } from "@/components/ui/text"
import { Spinner } from "@/components/ui/spinner"

export function FrameDropZone(props: {
  onFilesSelected: (files: FileList) => void
}) {
  const [dragOver, setDragOver] = useState(false)
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
      className={css({
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: "1",
        border: "2px dashed",
        borderColor: dragOver ? "border.outline" : "border.default",
        borderRadius: "lg",
        m: "4",
        cursor: isImporting ? "default" : "pointer",
        transition: "border-color 0.15s",
        bg: dragOver ? "bg.muted" : "transparent",
        gap: "2",
      })}
      onDrop={isImporting ? undefined : handleDrop}
      onDragOver={isImporting ? undefined : handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={isImporting ? undefined : handleClick}
    >
      {isImporting ? (
        <>
          <Spinner />
          <Text color="fg.muted">
            Importing frames... {progress.completed}/{progress.total}
          </Text>
        </>
      ) : (
        <Text color="fg.muted" textAlign="center">
          Drop image files here or click to browse
        </Text>
      )}
    </div>
  )
}
