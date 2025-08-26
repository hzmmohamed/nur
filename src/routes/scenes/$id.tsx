import { Canvas } from "@/components/canvas";
import { TimelinePanel } from "@/components/timeline-panel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { createActor, type ActorRefFromLogic } from "xstate";

import { createFileRoute, redirect } from "@tanstack/react-router";
import { editorMachine } from "@/lib/editor.machine";
import type { frameFetcherMachine } from "@/lib/frame-fetcher.machine";
// import type { timelineMachine } from "@/lib/timeline-machine";

export const Route = createFileRoute("/scenes/$id")({
  component: RouteComponent,
  context: ({ params }) => {
    // TODO: Pass scene id and cache size
    const editorActor = createActor(editorMachine, {
      input: {
        sceneId: params.id,
      },
    });
    editorActor.start();
    return {
      frameFetcher: editorActor.system.get(
        "frame-fetcher"
      ) as ActorRefFromLogic<typeof frameFetcherMachine>,
      // timelineActor: editorActor.system.get("timeline") as ActorRefFromLogic<
      //   typeof timelineMachine
      // >,
    };
  },
  loader: async ({ params, context: { store } }) => {
    const name = store.getCell("scenes", params.id, "name");
    if (!name) throw redirect({ to: "/" });
    return { crumb: name };
  },
});

function RouteComponent() {
  return (
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
  );
}
