import type { ReactNode } from "react"
import { useAtomValue } from "@effect-atom/atom-react/Hooks"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { CanvasBar } from "./canvas-bar"
import { CanvasMinimap } from "./canvas-minimap"
import { CanvasStatusBar } from "./canvas-status-bar"
import { panelsDisabledAtom } from "../lib/panel-atoms"
import { LayersPanel } from "./panels/layers-panel"
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
        {/* Main area: canvas + inspector */}
        <ResizablePanel defaultSize="70%" minSize="30%">
          <div className="flex h-full">
            <ResizablePanelGroup orientation="horizontal" className="flex-1">
              {/* Canvas area */}
              <ResizablePanel defaultSize="70%" minSize="30%">
                <div className="relative flex flex-col h-full overflow-hidden">
                  <CanvasBar />

                  {/* Canvas content */}
                  <div className="flex-1 min-h-0 relative">
                    {canvas}
                    <CanvasMinimap />
                  </div>

                  {/* Status bar */}
                  <CanvasStatusBar />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Inspector (right sidebar) */}
              <ResizablePanel
                defaultSize="30%"
                minSize="20%"
                maxSize="45%"
                collapsible
                collapsedSize="0%"
              >
                <div className="relative flex flex-col h-full bg-background">
                  {panelsDisabled && <div className="absolute inset-0 z-20 bg-background/60 pointer-events-auto" />}
                  <div className="flex-1 overflow-y-auto scrollbar-thin">
                    <LayersPanel />
                  </div>
                  <div className="flex-1 overflow-y-auto scrollbar-thin border-t border-border">
                    <PropertiesPanel />
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Timeline */}
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
