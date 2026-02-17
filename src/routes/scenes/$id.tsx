// import { TimelinePanel } from "@/components/timeline-panel";
// import {
//   ResizablePanelGroup,
//   ResizablePanel,
//   ResizableHandle,
// } from "@/components/ui/resizable";

// import { createFileRoute, redirect } from "@tanstack/react-router";
// import { useSelector } from "@xstate/react";
// import { Button } from "@/components/ui/button";
// import { PenToolIcon } from "lucide-react";
// import {
//   Tooltip,
//   TooltipContent,
//   TooltipTrigger,
// } from "@/components/ui/tooltip";
// import UndoWidget from "@/components/undo-widget";
// import { useBezierSyncEngine } from "@/lib/sync-engine";
// import { BezierLayer } from "@/lib/complex-shapes";
// import { VideoEditingProject } from "@/lib/data-model/impl-yjs-v2";
// import LayersPanel from "@/components/layers-panel-5";
// import * as Y from "yjs";

// export const Route = createFileRoute("/scenes/$id")({
//   component: RouteComponent,
//   loader: async ({ params, context: { store } }) => {
//     const name = store.getCell("scenes", params.id, "name");
//     if (!name) throw redirect({ to: "/" });
//     return { crumb: name };
//   },
// });
// const layer = new BezierLayer();
// const project = new VideoEditingProject(
//   new Y.Doc(),
//   {},
//   { persistenceKey: "2a3b15fe-8f92-4c1b-942b-c798874bea8f" }
// );
// function RouteComponent() {
//   const syncEngine = useBezierSyncEngine({ layer, project });
//   return (
//     <ResizablePanelGroup direction="horizontal" className="h-full w-full">
//       <ResizablePanel defaultSize={80}>
//         <ResizablePanelGroup direction="vertical">
//           <ResizablePanel
//             defaultSize={75}
//             className="flex items-center justify-center relative"
//           >
//             {/* <Toolbar /> */}
//             <div
//               // ref={containerRef}
//               id="nur-canvas"
//               className="w-full h-full overflow-hidden bg-background"
//             />
//           </ResizablePanel>
//           <ResizableHandle withHandle />
//           <ResizablePanel defaultSize={25}>
//             {/* <TimelinePanel /> */}
//           </ResizablePanel>
//         </ResizablePanelGroup>
//       </ResizablePanel>
//       <ResizableHandle withHandle />
//       <ResizablePanel
//         defaultSize={20}
//         className="bg-background flex flex-col justify-end"
//       >
//         <LayersPanel syncEngine={syncEngine} className="h-full" />
//       </ResizablePanel>
//     </ResizablePanelGroup>
//   );
// }

// const Toolbar = () => {
//   // const editorActorRef = Route.useRouteContext().editorActor;
//   const projectRef = useSelector(
//     editorActorRef,
//     (state) => state.context.projectRef
//   );
//   const isPentoolActive = useSelector(editorActorRef, (snapshot) =>
//     snapshot.matches({ active: { selectedTool: "pen" } })
//   );

//   return (
//     <div className="absolute top-2 left-2 flex gap-4 bg-card p-1 z-10 rounded-sm">
//       <Tooltip>
//         <TooltipTrigger asChild>
//           <Button
//             variant="ghost"
//             size="icon"
//             onClick={() => editorActorRef.send({ type: "TOGGLE_PEN" })}
//             className={
//               isPentoolActive
//                 ? "bg-accent-foreground text-accent hover:bg-accent-foreground hover:text-accent"
//                 : ""
//             }
//           >
//             <PenToolIcon />
//           </Button>
//         </TooltipTrigger>
//         <TooltipContent>
//           <p>Pen Tool (P)</p>
//         </TooltipContent>
//       </Tooltip>
//       <UndoWidget project={projectRef} />
//     </div>
//   );
// };
