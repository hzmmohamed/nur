import type { ReactNode } from "react"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { CanvasLeftPanel } from "./canvas-left-panel"
import { CanvasMinimap } from "./canvas-minimap"
import { CanvasRulers } from "./canvas-rulers"
import { CanvasStatusBar } from "./canvas-status-bar"
import { panelsDisabledAtom } from "../lib/panel-atoms"
import { PropertiesPanel } from "./panels/properties-panel"

interface EditorLayoutProps {
  header: ReactNode
  canvas: ReactNode
  timeline: ReactNode
}

export function EditorLayout({ header, canvas, timeline }: EditorLayoutProps) {
  const panelsDisabled = useAtomValue(panelsDisabledAtom)

  return (
    <div className="h-screen flex flex-col">
      {header}

      <ResizablePanelGroup orientation="vertical" className="flex-1">
        {/* Main area: left panel + canvas + right panel */}
        <ResizablePanel defaultSize="70%" minSize="30%">
          <div className="flex h-full">
            <ResizablePanelGroup orientation="horizontal" className="flex-1">
              {/* Left Panel — contextual info + actions */}
              <ResizablePanel
                defaultSize="20%"
                minSize="15%"
                maxSize="35%"
                collapsible
                collapsedSize="0%"
              >
                <CanvasLeftPanel />
              </ResizablePanel>

              <ResizableHandle />

              {/* Canvas (center) */}
              <ResizablePanel defaultSize="60%" minSize="30%">
                <div className="relative flex flex-col h-full overflow-hidden">
                  <div className="flex-1 min-h-0 relative">
                    {canvas}
                    <CanvasRulers />
                    <CanvasMinimap />
                  </div>
                  <CanvasStatusBar />
                </div>
              </ResizablePanel>

              <ResizableHandle />

              {/* Right Panel — properties (future: material/lighting) */}
              <ResizablePanel
                defaultSize="20%"
                minSize="15%"
                maxSize="35%"
                collapsible
                collapsedSize="0%"
              >
                <div className="relative flex flex-col h-full bg-background">
                  {panelsDisabled && <div className="absolute inset-0 z-20 bg-background/60 pointer-events-auto" />}
                  <PropertiesPanel />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Timeline (full width) */}
        <ResizablePanel
          defaultSize="30%"
          minSize="15%"
          maxSize="50%"
          collapsible
          collapsedSize="0%"
        >
          <div className="relative h-full">
            {panelsDisabled && <div className="absolute inset-0 z-20 bg-background/60 pointer-events-auto" />}
            {timeline}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
