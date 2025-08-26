import { TimelinePanel } from "@/components/timeline-panel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { createFileRoute, redirect } from "@tanstack/react-router";
import { editorMachine } from "@/lib/editor.machine";
import { useActorRef } from "@xstate/react";
import { useRef, useEffect } from "react";
import { createActor, type ActorRefFromLogic } from "xstate";
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
      editorActor,
      frameFetcher: editorActor.system.get(
        "frame-fetcher"
      ) as ActorRefFromLogic<typeof frameFetcherMachine>,
      // timelineActor: editorActor.system.get("timeline") as ActorRefFromLogic<
      //   typeof timelineMachine
      // >,
    };
  },
  onLeave: ({ context }) => {
    context.editorActor.stop();
  },
  loader: async ({ params, context: { store } }) => {
    const name = store.getCell("scenes", params.id, "name");
    if (!name) throw redirect({ to: "/" });
    return { crumb: name };
  },
});

function RouteComponent() {
  const editorActorRef = Route.useRouteContext().editorActor;

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) {
      editorActorRef.send({
        type: "CONTAINER_MOUNTED",
        data: {
          containerId: containerRef.current.id,
        },
      });
    }
  }, [editorActorRef, containerRef.current]);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full">
      <ResizablePanel defaultSize={80}>
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel
            defaultSize={75}
            className="flex items-center justify-center"
          >
            <div className="w-full h-full relative">
              <div
                ref={containerRef}
                id="nur-canvas"
                className="w-full h-full overflow-hidden"
              >
                {/* We no longer need this div because the Konva Stage is initialized with a direct container reference */}
                {/* Display current scale and position for debugging/user feedback */}
              </div>
              {/* <div className="absolute top-4 left-4 bg-card text-card-foreground text-xs p-2 rounded-sm opacity-75">
                <p>Scale: {stageScale.toFixed(2)}</p>
                <p>X: {stageX.toFixed(2)}</p>
                <p>Y: {stageY.toFixed(2)}</p>
              </div> */}
            </div>
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
