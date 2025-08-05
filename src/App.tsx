import { ThemeProvider } from "@/components/theme-provider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { MenuIcon, PauseIcon, PlayIcon, SquareStopIcon } from "lucide-react";
import { Timeline } from "./components/ui/timeline";

function App({}: React.PropsWithChildren) {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="h-dvh w-full bg-zinc-800 text-zinc-100 text-sm">
        <ResizablePanelGroup direction="horizontal" className="h-full w-full">
          <ResizablePanel defaultSize={80}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={75}>
                <div className="flex h-full px-16 py-12">
                  <canvas className="w-full h-full bg-zinc-100" />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={25}>
                <div id="timeline-header" className="flex h-full flex-col">
                  <div className=" bg-zinc-950 w-full h-fit flex flex-row justify-between items-center px-3 py-1">
                    <span className="text-md font-semibold">Timeline</span>
                    <div className="flex gap-1">
                      <PlayIcon className="fill-zinc-100 size-4" />
                      <PauseIcon className="fill-zinc-100 size-4" />
                      <SquareStopIcon className="fill-zinc-100 size-4" />
                    </div>
                    <div className="flex gap-1">
                      <MenuIcon className="size-4" />
                    </div>
                  </div>
                  <Timeline />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20}>
            <div className="flex h-[200px] items-center justify-center p-6">
              <span className="font-semibold">Tools Sidebar</span>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ThemeProvider>
  );
}

export default App;
