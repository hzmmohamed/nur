import { useCallback } from "react"
import { Atom } from "@effect-atom/atom"
import { useAtom } from "@effect-atom/atom-react/Hooks"
import type { ImportProgress } from "../lib/import-atoms"

const dragOverAtom = Atom.make(false)
const rejectedAtom = Atom.make<string[]>([])

function validateFiles(files: DataTransfer | FileList): { valid: File[]; rejected: string[] } {
  const all = files instanceof DataTransfer ? Array.from(files.files) : Array.from(files)
  const valid: File[] = []
  const rejected: string[] = []
  for (const f of all) {
    if (f.type.startsWith("image/")) {
      valid.push(f)
    } else {
      rejected.push(f.name)
    }
  }
  return { valid, rejected }
}

export function FrameDropZone(props: {
  onFilesSelected: (files: FileList) => void
  progress: ImportProgress
  isImporting: boolean
}) {
  const [dragOver, setDragOver] = useAtom(dragOverAtom)
  const [rejected, setRejected] = useAtom(rejectedAtom)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      const { valid, rejected: bad } = validateFiles(e.dataTransfer)
      setRejected(bad)
      if (valid.length > 0) {
        const dt = new DataTransfer()
        valid.forEach((f) => dt.items.add(f))
        props.onFilesSelected(dt.files)
      }
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
        setRejected([])
        props.onFilesSelected(input.files)
      }
    }
    input.click()
  }, [props.onFilesSelected])

  const progressPct = props.progress.total > 0
    ? Math.round((props.progress.completed / props.progress.total) * 100)
    : 0

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80">
      <div
        className={`flex flex-col items-center gap-4 px-10 py-8 rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200 ${
          dragOver
            ? "border-ring ring-2 ring-ring/20 scale-[1.02]"
            : "border-border"
        } ${props.isImporting ? "cursor-default" : "cursor-pointer hover:border-muted-foreground"}`}
        onDrop={props.isImporting ? undefined : handleDrop}
        onDragOver={props.isImporting ? undefined : handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={props.isImporting ? undefined : handleClick}
      >
        {props.isImporting ? (
          <div className="flex flex-col items-center gap-3 w-64">
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-ring rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Importing {props.progress.completed} of {props.progress.total} frames
            </p>
            {props.progress.currentFile && (
              <p className="text-xs text-muted-foreground/70 truncate max-w-full">
                {props.progress.currentFile}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg
              className={`size-10 transition-transform duration-200 ${dragOver ? "scale-110 text-ring" : "text-muted-foreground/40"}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm text-foreground font-medium">
              {dragOver ? "Drop to import" : "Import frames"}
            </p>
            <p className="text-xs text-muted-foreground">
              Drop image files here or click to browse
            </p>
            <p className="text-xs text-muted-foreground/50">
              PNG, JPEG, WebP, GIF
            </p>
          </div>
        )}

        {rejected.length > 0 && !props.isImporting && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-destructive/10 text-destructive text-xs">
            <svg className="size-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
            </svg>
            <span>
              Skipped {rejected.length} non-image {rejected.length === 1 ? "file" : "files"}: {rejected.slice(0, 3).join(", ")}{rejected.length > 3 ? ` +${rejected.length - 3} more` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
