import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import { activeToolAtom, setActiveToolAtom } from "../lib/path-atoms"
import { Button } from "@/components/ui/button"

export function ToolRail() {
  const toolResult = useAtomValue(activeToolAtom)
  const activeTool = Result.isSuccess(toolResult) ? toolResult.value : "select"
  const setTool = useAtomSet(setActiveToolAtom)

  return (
    <div
      className="flex flex-col items-center gap-1 py-2 w-12 flex-shrink-0 border-r border-border bg-background"
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
    >
      <Button
        variant={activeTool === "select" ? "default" : "ghost"}
        size="icon"
        onClick={() => setTool("select")}
        title="Select (V)"
        aria-label="Select tool (V)"
        aria-pressed={activeTool === "select"}
      >
        <CursorIcon />
      </Button>
      <Button
        variant={activeTool === "pen" ? "default" : "ghost"}
        size="icon"
        onClick={() => setTool("pen")}
        title="Pen (P)"
        aria-label="Pen tool (P)"
        aria-pressed={activeTool === "pen"}
      >
        <PenIcon />
      </Button>
    </div>
  )
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
    </svg>
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
