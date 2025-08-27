import { TimelinePanel } from "@/components/timeline-panel";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { createFileRoute, redirect } from "@tanstack/react-router";
import { editorMachine } from "@/lib/editor.machine";
import { useSelector } from "@xstate/react";
import { useRef, useEffect } from "react";
import { createActor, type ActorRefFromLogic } from "xstate";
import type { frameFetcherMachine } from "@/lib/frame-fetcher.machine";
import { Button } from "@/components/ui/button";
import { PenToolIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
            className="flex items-center justify-center relative"
          >
            <Toolbar />
            <div
              ref={containerRef}
              id="nur-canvas"
              className="w-full h-full overflow-hidden"
            />
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

const Toolbar = () => {
  const editorActorRef = Route.useRouteContext().editorActor;
  const isPentoolActive = useSelector(editorActorRef, (snapshot) =>
    snapshot.matches({ active: { mode: "editing" } })
  );

  return (
    <div className="absolute top-2 left-2 flex gap-2 bg-card p-1 z-10 rounded-sm">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => editorActorRef.send({ type: "NEW_SHAPE" })}
            className={
              isPentoolActive ? "bg-accent text-accent-foreground" : ""
            }
          >
            <PenToolIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Pen Tool (P)</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
