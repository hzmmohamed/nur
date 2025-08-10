import { ThemeProvider } from "@/components/theme-provider";

import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import "../index.css";
import "@fontsource/albert-sans";
import { Header } from "@/components/header";

export const Route = createRootRoute({
  component: () => (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="h-dvh w-full flex flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      <TanStackRouterDevtools />
    </ThemeProvider>
  ),
});
