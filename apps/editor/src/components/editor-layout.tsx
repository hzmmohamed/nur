import type { ReactNode } from "react"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { ToolRail } from "./tool-rail"
import { ScopeBar } from "./scope-bar"
import { LayersPanel } from "./panels/layers-panel"
import { PropertiesPanel } from "./panels/properties-panel"

interface EditorLayoutProps {
  header: ReactNode
  canvas: ReactNode
  timeline: ReactNode
}

export function EditorLayout({ header, canvas, timeline }: EditorLayoutProps) {
  return (
    <div className="h-screen flex flex-col">
      {header}
      <ScopeBar />

      <ResizablePanelGroup orientation="vertical" className="flex-1">
        {/* Main area: tool rail + canvas + sidebar */}
        <ResizablePanel defaultSize="85%" minSize="40%">
          <div className="flex h-full">
            <ToolRail />

            <ResizablePanelGroup orientation="horizontal" className="flex-1">
              {/* Canvas */}
              <ResizablePanel defaultSize="75%" minSize="30%">
                {canvas}
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Right sidebar */}
              <ResizablePanel
                defaultSize="25%"
                minSize="15%"
                maxSize="40%"
                collapsible
                collapsedSize="0%"
              >
                <div className="flex flex-col h-full border-l border-border bg-background">
                  <div className="flex-1 overflow-y-auto">
                    <LayersPanel />
                  </div>
                  <div className="flex-1 overflow-y-auto border-t border-border">
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
          defaultSize="15%"
          minSize="8%"
          maxSize="40%"
          collapsible
          collapsedSize="0%"
        >
          {timeline}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
