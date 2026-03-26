import { defineWorkspace } from "vitest/config"

export default defineWorkspace([
  "packages/core",
  "packages/pen-tool",
  "packages/object-store",
  "packages/renderer",
])
