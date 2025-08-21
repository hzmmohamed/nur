import { Canvas } from "@/components/canvas";
import { TimelinePanel } from "@/components/timeline-panel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/scenes/$id")({
  component: RouteComponent,

  loader: async ({ params, context: { store } }) => {
    const name = store.getCell("scenes", params.id, "name");
    if (!name) throw redirect({ to: "/" });
    return { crumb: name };
  },
});

export function ResizableDemo() {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="max-w-md rounded-lg border md:min-w-[450px]"
    >
      <ResizablePanel defaultSize={50}>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel
            defaultSize={75}
            className="flex items-center justify-center"
          >
            <Canvas />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={75}>
            <div className="flex h-full items-center justify-center p-6">
              <span className="font-semibold">Three</span>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizablePanel defaultSize={50}>
        <div className="flex h-[200px] items-center justify-center p-6">
          <span className="font-semibold">One</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
    </ResizablePanelGroup>
  );
}

function RouteComponent() {
  return (
    <>
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={80}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel
              defaultSize={75}
              className="flex items-center justify-center"
            >
              <Canvas />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <TimelinePanel />
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={20}>
          <div className="flex h-full items-center justify-center p-6 bg-card">
            <span className="font-semibold">Tools Sidebar</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}
