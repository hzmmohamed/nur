import { ThemeProvider } from "@/components/theme-provider";

import {
  createRootRoute,
  createRootRouteWithContext,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import * as UiReact from "tinybase/ui-react/with-schemas";
import { createStore } from "tinybase/with-schemas";

const tablesSchema = { pets: { species: { type: "string" } } } as const;
const valuesSchema = { employees: { type: "number" } } as const;

// Cast the whole module to be schema-based with WithSchemas:
const UiReactWithSchemas = UiReact as UiReact.WithSchemas<
  [typeof tablesSchema, typeof valuesSchema]
>;
// Deconstruct to access the hooks and components you need:
const { Provider } = UiReactWithSchemas;

const store = createStore()
  .setSchema(tablesSchema, valuesSchema)
  .setTables({ pets: { test: { species: "test" } } });

import "../index.css";
import "@fontsource/albert-sans";
import { Header } from "@/components/header";
import { scan } from "react-scan";
import { myStore } from "@/lib/store";
import { Inspector } from "tinybase/ui-react-inspector";
import { Toaster } from "@/components/ui/sonner";

scan({
  enabled: true,
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
  store: typeof myStore;
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
