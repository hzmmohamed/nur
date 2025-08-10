import { ThemeProvider } from "@/components/theme-provider";
import { Canvas } from "@/components/canvas";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TimelinePanel } from "@/components/timeline-panel";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { framesAtom } from "@/lib/shared-state";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const frames = useAtomValue(framesAtom);
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="h-full w-full bg-muted text-foreground text-sm">
        <ResizablePanelGroup direction="horizontal" className="h-full w-full">
          <ResizablePanel defaultSize={80}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={75}>
                <div className="flex h-full px-16 py-12">
                  <Canvas />
                </div>
              </ResizablePanel>
              {frames.length > 0 ? (
                <>
                  <ResizableHandle withHandle />
                  <TimelinePanel />
                </>
              ) : null}
            </ResizablePanelGroup>
          </ResizablePanel>
          {frames.length > 0 ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={20}>
                <div className="flex h-full items-center justify-center p-6 bg-card">
                  <span className="font-semibold">Tools Sidebar</span>
                </div>
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
    </ThemeProvider>
  );
}
