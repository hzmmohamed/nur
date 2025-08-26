import { createMachine } from "xstate";
import { frameFetcherMachine } from "./frame-fetcher.machine";
import { timelineMachine } from "./timeline-machine";

export const editorMachine = createMachine({
  types: {
    input: {} as { sceneId: string },
    context: {} as { fps: number; sceneId: string },
  },
  context: ({ input: { sceneId } }) => ({
    fps: 24,
    sceneId,
  }),
  initial: "active",
  states: {
    active: {
      invoke: [
        {
          src: frameFetcherMachine,
          id: "frame-fetcher",
          systemId: "frame-fetcher",
          input: ({ context: { sceneId } }) => ({
            sceneId,
          }),
        },
        { src: timelineMachine, id: "timeline", systemId: "timeline" },
      ],
    },
  },
});

// type Context = {
//   timelineActor: AnyActorRef;
//   frameFetcherActor: AnyActorRef;
// };

// export const editorMachine = createMachine({
//   types: {
//     input: {} as {
//       sceneId: string;
//     },
//     context: {} as Context,
//   },
//   context: ({ input: { sceneId }, spawn }) => ({
//     fps: 24,
//     timelineActor: spawn(timelineMachine, { systemId: "timeline" }),
//     frameFetcherActor: spawn(frameFetcherMachine, {
//       systemId: "frameFetcher",
//       input: {
//         sceneId,
//       },
//     }),
//   }),
//   states: {
//     active: {
//       invoke: {
//         src: fromCallback<{ type: "any" }, Context>(({ input, sendBack }) => {
//           input.frameFetcherActor.subscribe({
//             next(snapshot) {
//               console.log(snapshot);
//             },
//             error(err) {
//               sendBack({ type: "FATAL_ERROR" });
//             },
//             complete() {
//               // ...
//             },
//           });
//         }),
//         input: ({ context }) => ({ context }),
//       },
//     },
//   },
// });
