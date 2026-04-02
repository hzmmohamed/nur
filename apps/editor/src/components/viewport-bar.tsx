import { Button } from "@/components/ui/button"

interface ViewportBarProps {
  zoom: number
  onZoomChange: (zoom: number) => void
}

const ZOOM_PRESETS = [0.5, 1, 2] as const

export function ViewportBar({ zoom, onZoomChange }: ViewportBarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-background/80 backdrop-blur-sm border-t border-border text-xs text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-1.5 text-xs"
        onClick={() => onZoomChange(1)}
        aria-label="Fit to frame"
      >
        Fit
      </Button>

      {ZOOM_PRESETS.map((preset) => (
        <Button
          key={preset}
          variant={Math.abs(zoom - preset) < 0.05 ? "secondary" : "ghost"}
          size="sm"
          className="h-5 px-1.5 text-xs"
          onClick={() => onZoomChange(preset)}
        >
          {preset * 100}%
        </Button>
      ))}

      <div className="flex-1" />

      <span>{Math.round(zoom * 100)}%</span>
    </div>
  )
}
