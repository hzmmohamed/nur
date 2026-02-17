import { ThemeProvider } from "@/components/theme-provider";

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import "../index.css";
// @ts-ignore
import "@fontsource/albert-sans";
import { Header } from "@/components/header";
import { scan } from "react-scan";
import { scenesStore } from "@/lib/scenes.store";
import { Inspector } from "tinybase/ui-react-inspector";
import { Toaster } from "@/components/ui/sonner";

scan({
  enabled: false,
});

const InnerApp = () => {
  return (
    <div className="h-dvh w-full flex flex-col bg-muted text-foreground text-sm">
      <Header />
      <main className="flex-1 overflow-y-scroll overflow-x-hidden scrollbar-thin scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar-thumb-[#d2d2d244] scrollbar-track-[#00000000]">
        <Outlet />
        <Toaster />
      </main>
    </div>
  );
};

interface MyRouterContext {
  store: typeof scenesStore;
}
export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <InnerApp />
        <Inspector />
        <TanStackRouterDevtools position="bottom-right" />
      </ThemeProvider>
    );
  },
});
