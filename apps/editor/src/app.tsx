import { RouterProvider, createRouter } from "@tanstack/react-router"
import { RegistryContext } from "@effect-atom/atom-react/RegistryContext"
import { appRegistry } from "./lib/atom-registry"
import { routeTree } from "./routeTree.gen"

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return (
    <RegistryContext.Provider value={appRegistry}>
      <RouterProvider router={router} />
    </RegistryContext.Provider>
  )
}
