import type { ReactNode } from "react"
import { Result } from "@effect-atom/atom"
import { useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { CanvasBar } from "./canvas-bar"
import { ViewportBar } from "./viewport-bar"
import { isEditModeAtom } from "../lib/layer-atoms"
import { zoomAtom, setZoomAtom } from "../lib/viewport-atoms"
import { LayersPanel } from "./panels/layers-panel"
import { PropertiesPanel } from "./panels/properties-panel"

interface EditorLayoutProps {
  header: ReactNode
  canvas: ReactNode
  timeline: ReactNode
}

export function EditorLayout({ header, canvas, timeline }: EditorLayoutProps) {
  const isEditMode = useAtomValue(isEditModeAtom)
  const zoomResult = useAtomValue(zoomAtom)
  const zoom = Result.isSuccess(zoomResult) ? zoomResult.value : 1
  const setZoom = useAtomSet(setZoomAtom)

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
                  {/* Canvas bar — slides down in Edit mode */}
                  <div
                    className={`transition-all duration-150 ease-out overflow-hidden ${
                      isEditMode ? "max-h-10" : "max-h-0"
                    }`}
                  >
                    <CanvasBar />
                  </div>

                  {/* Canvas content */}
                  <div className="flex-1 min-h-0">
                    {canvas}
                  </div>

                  {/* Viewport bar */}
                  <ViewportBar zoom={zoom} onZoomChange={setZoom} />
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
                <div className="flex flex-col h-full bg-background">
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
          defaultSize="30%"
          minSize="15%"
          maxSize="50%"
          collapsible
          collapsedSize="0%"
        >
          {timeline}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
