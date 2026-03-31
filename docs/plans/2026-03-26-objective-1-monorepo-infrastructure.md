# Objective 1: Monorepo Infrastructure + Shared Config

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold the monorepo package structure, shared TypeScript config, Vitest workspace, Panda CSS + Park UI design system, and validate that `turbo build` and `turbo test` pass across all packages.

**Architecture:** The monorepo uses pnpm workspaces + Turborepo. Packages are built with TypeScript (ESM, noEmit for app packages, declaration emit for library packages). Panda CSS is configured in the design-system package and consumed by the editor app. All effect-* dependencies are installed from npm.

**Tech Stack:** pnpm 10, Turborepo, TypeScript 5.8, Vitest 3, Panda CSS, Park UI, Ark UI, React 19, Vite 7

---

### Task 1: Clean up root package.json and create tsconfig.base.json

**Files:**
- Modify: `package.json`
- Create: `tsconfig.base.json`

**Step 1: Update root package.json**

Replace the root `package.json` with proper workspace scripts:

```json
{
  "name": "nur",
  "private": true,
  "packageManager": "pnpm@10.23.0",
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.8.12",
    "typescript": "~5.8.3"
  }
}
```

**Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "erasableSyntaxOnly": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

**Step 3: Run pnpm install to pick up root typescript**

Run: `pnpm install`
Expected: lockfile updated, no errors.

**Step 4: Commit**

```bash
git add package.json tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: add tsconfig.base.json and root workspace scripts"
```

---

### Task 2: Update turbo.json with typecheck and test tasks

**Files:**
- Modify: `turbo.json`

**Step 1: Update turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

**Step 2: Commit**

```bash
git add turbo.json
git commit -m "chore: add typecheck and test tasks to turbo.json"
```

---

### Task 3: Scaffold @nur/core package

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`

**Step 1: Create packages/core/package.json**

```json
{
  "name": "@nur/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "effect": "^3.19.18",
    "effect-yjs": "^0.1.0",
    "@effect-atom/atom": "^0.5.1",
    "yjs": "^13.6.27",
    "y-indexeddb": "^9.0.12"
  },
  "devDependencies": {
    "typescript": "~5.8.3",
    "vitest": "^3.2.4",
    "@effect/vitest": "^0.25.1"
  }
}
```

Note: We use source `.ts` exports directly — the editor app bundles with Vite so no pre-compilation is needed for internal packages. This keeps the setup simple and avoids a build step for library packages during development.

**Step 2: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Create packages/core/src/index.ts**

```ts
export {}
```

**Step 4: Run pnpm install from root**

Run: `pnpm install`
Expected: `@nur/core` appears in workspace.

**Step 5: Verify typecheck**

Run: `pnpm --filter @nur/core typecheck`
Expected: passes with no errors.

**Step 6: Commit**

```bash
git add packages/core/
git commit -m "chore: scaffold @nur/core package"
```

---

### Task 4: Scaffold @nur/pen-tool package

**Files:**
- Create: `packages/pen-tool/package.json`
- Create: `packages/pen-tool/tsconfig.json`
- Create: `packages/pen-tool/src/index.ts`

**Step 1: Create packages/pen-tool/package.json**

```json
{
  "name": "@nur/pen-tool",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "effect": "^3.19.18",
    "effect-yjs": "^0.1.0",
    "effect-machine": "^0.7.0",
    "@effect-atom/atom": "^0.5.1",
    "yjs": "^13.6.27",
    "konva": "^9.3.22"
  },
  "devDependencies": {
    "typescript": "~5.8.3",
    "vitest": "^3.2.4",
    "@effect/vitest": "^0.25.1"
  }
}
```

**Step 2: Create packages/pen-tool/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Create packages/pen-tool/src/index.ts**

```ts
export {}
```

**Step 4: Run pnpm install from root**

Run: `pnpm install`

**Step 5: Verify typecheck**

Run: `pnpm --filter @nur/pen-tool typecheck`
Expected: passes.

**Step 6: Commit**

```bash
git add packages/pen-tool/
git commit -m "chore: scaffold @nur/pen-tool package"
```

---

### Task 5: Scaffold @nur/object-store package

**Files:**
- Create: `packages/object-store/package.json`
- Create: `packages/object-store/tsconfig.json`
- Create: `packages/object-store/src/index.ts`

**Step 1: Create packages/object-store/package.json**

```json
{
  "name": "@nur/object-store",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "effect": "^3.19.18",
    "idb": "^8.0.3"
  },
  "devDependencies": {
    "typescript": "~5.8.3",
    "vitest": "^3.2.4",
    "@effect/vitest": "^0.25.1"
  }
}
```

**Step 2: Create packages/object-store/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

**Step 3: Create packages/object-store/src/index.ts**

```ts
export {}
```

**Step 4: Run pnpm install from root**

Run: `pnpm install`

**Step 5: Verify typecheck**

Run: `pnpm --filter @nur/object-store typecheck`
Expected: passes.

**Step 6: Commit**

```bash
git add packages/object-store/
git commit -m "chore: scaffold @nur/object-store package"
```

---

### Task 6: Scaffold @nur/renderer package

**Files:**
- Create: `packages/renderer/package.json`
- Create: `packages/renderer/tsconfig.json`
- Create: `packages/renderer/src/index.ts`

**Step 1: Create packages/renderer/package.json**

```json
{
  "name": "@nur/renderer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "effect": "^3.19.18",
    "@webgpu/types": "^0.1.60"
  },
  "devDependencies": {
    "typescript": "~5.8.3",
    "vitest": "^3.2.4"
  }
}
```

**Step 2: Create packages/renderer/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["@webgpu/types"]
  },
  "include": ["src"]
}
```

**Step 3: Create packages/renderer/src/index.ts**

```ts
export {}
```

**Step 4: Run pnpm install from root**

Run: `pnpm install`

**Step 5: Verify typecheck**

Run: `pnpm --filter @nur/renderer typecheck`
Expected: passes.

**Step 6: Commit**

```bash
git add packages/renderer/
git commit -m "chore: scaffold @nur/renderer package"
```

---

### Task 7: Scaffold @nur/design-system package with Panda CSS + Park UI

**Files:**
- Create: `packages/design-system/package.json`
- Create: `packages/design-system/tsconfig.json`
- Create: `packages/design-system/panda.config.ts`
- Create: `packages/design-system/src/index.ts`

**Step 1: Create packages/design-system/package.json**

```json
{
  "name": "@nur/design-system",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./styled-system/*": {
      "types": "./styled-system/*.d.ts",
      "default": "./styled-system/*.mjs"
    }
  },
  "scripts": {
    "prepare": "panda codegen",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ark-ui/react": "^5.0.0",
    "@park-ui/panda-preset": "^0.42.0",
    "lucide-react": "^0.536.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@pandacss/dev": "^0.52.0",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "typescript": "~5.8.3"
  }
}
```

**Step 2: Create packages/design-system/panda.config.ts**

```ts
import { defineConfig } from "@pandacss/dev"
import { createPreset } from "@park-ui/panda-preset"

export default defineConfig({
  preflight: true,
  presets: [
    "@pandacss/preset-base",
    createPreset({
      accentColor: "neutral",
      grayColor: "neutral",
      borderRadius: "md",
    }),
  ],
  include: ["./src/**/*.{ts,tsx}"],
  outdir: "styled-system",
  jsxFramework: "react",
  plugins: [
    {
      name: "Remove Panda Preset Colors",
      hooks: {
        "preset:resolved": ({ utils, preset, name }) =>
          name === "@pandacss/preset-panda"
            ? utils.omit(preset, ["theme.tokens.colors", "theme.semanticTokens.colors"])
            : preset,
      },
    },
  ],
})
```

**Step 3: Create packages/design-system/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "rootDir": ".",
    "outDir": "dist",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "styled-system"]
}
```

**Step 4: Create packages/design-system/src/index.ts**

```ts
export {}
```

**Step 5: Run pnpm install from root**

Run: `pnpm install`

**Step 6: Run panda codegen to generate the styled-system directory**

Run: `pnpm --filter @nur/design-system prepare`
Expected: `packages/design-system/styled-system/` directory created with generated CSS utilities.

**Step 7: Verify typecheck**

Run: `pnpm --filter @nur/design-system typecheck`
Expected: passes.

**Step 8: Commit**

```bash
git add packages/design-system/
git commit -m "chore: scaffold @nur/design-system with Panda CSS + Park UI"
```

---

### Task 8: Scaffold apps/editor with Vite + React + Panda CSS

**Files:**
- Create: `apps/editor/package.json`
- Create: `apps/editor/tsconfig.json`
- Create: `apps/editor/tsconfig.app.json`
- Create: `apps/editor/tsconfig.node.json`
- Create: `apps/editor/vite.config.ts`
- Create: `apps/editor/index.html`
- Create: `apps/editor/src/main.tsx`
- Create: `apps/editor/src/app.tsx`
- Create: `apps/editor/src/index.css`
- Create: `apps/editor/panda.config.ts`

**Step 1: Create apps/editor/package.json**

```json
{
  "name": "@nur/editor",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview",
    "prepare": "panda codegen"
  },
  "dependencies": {
    "@nur/core": "workspace:*",
    "@nur/pen-tool": "workspace:*",
    "@nur/design-system": "workspace:*",
    "@nur/object-store": "workspace:*",
    "@nur/renderer": "workspace:*",
    "@ark-ui/react": "^5.0.0",
    "@park-ui/panda-preset": "^0.42.0",
    "effect": "^3.19.18",
    "effect-yjs": "^0.1.0",
    "@effect-atom/atom": "^0.5.1",
    "konva": "^9.3.22",
    "lucide-react": "^0.536.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-konva": "^19.0.7",
    "react-resizable-panels": "^3.0.4",
    "yjs": "^13.6.27",
    "y-indexeddb": "^9.0.12"
  },
  "devDependencies": {
    "@pandacss/dev": "^0.52.0",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^4.6.0",
    "typescript": "~5.8.3",
    "vite": "^7.0.4"
  }
}
```

**Step 2: Create apps/editor/tsconfig.json**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**Step 3: Create apps/editor/tsconfig.app.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "noEmit": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "styled-system"]
}
```

**Step 4: Create apps/editor/tsconfig.node.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "noEmit": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "lib": ["ES2022"]
  },
  "include": ["vite.config.ts", "panda.config.ts"]
}
```

**Step 5: Create apps/editor/panda.config.ts**

The editor app has its own Panda config that re-exports the design system's preset and adds app-specific include paths:

```ts
import { defineConfig } from "@pandacss/dev"
import { createPreset } from "@park-ui/panda-preset"

export default defineConfig({
  preflight: true,
  presets: [
    "@pandacss/preset-base",
    createPreset({
      accentColor: "neutral",
      grayColor: "neutral",
      borderRadius: "md",
    }),
  ],
  include: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@nur/design-system/src/**/*.{ts,tsx}",
  ],
  outdir: "styled-system",
  jsxFramework: "react",
  plugins: [
    {
      name: "Remove Panda Preset Colors",
      hooks: {
        "preset:resolved": ({ utils, preset, name }) =>
          name === "@pandacss/preset-panda"
            ? utils.omit(preset, ["theme.tokens.colors", "theme.semanticTokens.colors"])
            : preset,
      },
    },
  ],
})
```

**Step 6: Create apps/editor/vite.config.ts**

```ts
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["y-indexeddb"],
  },
})
```

**Step 7: Create apps/editor/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NUR</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 8: Create apps/editor/src/index.css**

```css
@layer reset, base, tokens, recipes, utilities;
```

This is the Panda CSS layer order entry point. Panda injects into these layers.

**Step 9: Create apps/editor/src/main.tsx**

```tsx
import "./index.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

**Step 10: Create apps/editor/src/app.tsx**

```tsx
import { css } from "../../styled-system/css"

export function App() {
  return (
    <div className={css({ display: "flex", alignItems: "center", justifyContent: "center", minH: "screen" })}>
      <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>NUR</h1>
    </div>
  )
}
```

**Step 11: Run pnpm install from root**

Run: `pnpm install`

**Step 12: Run panda codegen for the editor**

Run: `pnpm --filter @nur/editor prepare`
Expected: `apps/editor/styled-system/` directory created.

**Step 13: Verify typecheck**

Run: `pnpm --filter @nur/editor typecheck`
Expected: passes.

**Step 14: Verify dev server starts**

Run: `pnpm --filter @nur/editor dev`
Expected: Vite dev server starts, page shows "NUR" centered.

**Step 15: Commit**

```bash
git add apps/editor/
git commit -m "chore: scaffold apps/editor with Vite + React + Panda CSS + Park UI"
```

---

### Task 9: Add Park UI components via CLI

**Step 1: Initialize Park UI in the design-system package**

Run from `packages/design-system/`:
```bash
cd packages/design-system && npx @park-ui/cli init
```

Follow prompts to set up. This may create/modify files in the package.

**Step 2: Add initial components needed for project management**

```bash
cd packages/design-system
npx @park-ui/cli add button
npx @park-ui/cli add dialog
npx @park-ui/cli add input
npx @park-ui/cli add icon-button
```

**Step 3: Export added components from design-system index**

Update `packages/design-system/src/index.ts` to re-export all added Park UI components.

**Step 4: Run panda codegen**

Run: `pnpm --filter @nur/design-system prepare`

**Step 5: Verify typecheck**

Run: `pnpm --filter @nur/design-system typecheck`
Expected: passes.

**Step 6: Commit**

```bash
git add packages/design-system/
git commit -m "chore: add initial Park UI components (button, dialog, input, icon-button)"
```

---

### Task 10: Configure Vitest workspace

**Files:**
- Create: `vitest.workspace.ts`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/pen-tool/vitest.config.ts`
- Create: `packages/object-store/vitest.config.ts`

**Step 1: Create vitest.workspace.ts at root**

```ts
import { defineWorkspace } from "vitest/config"

export default defineWorkspace([
  "packages/core",
  "packages/pen-tool",
  "packages/object-store",
  "packages/renderer",
])
```

**Step 2: Create packages/core/vitest.config.ts**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
  },
})
```

**Step 3: Create identical vitest.config.ts for pen-tool, object-store, renderer**

Same content as core's vitest.config.ts.

**Step 4: Write a trivial test in @nur/core to verify the pipeline**

Create `packages/core/src/index.test.ts`:

```ts
import { describe, it, expect } from "vitest"

describe("@nur/core", () => {
  it("package is loadable", () => {
    expect(true).toBe(true)
  })
})
```

**Step 5: Run tests**

Run: `pnpm test`
Expected: turbo runs vitest across all packages, 1 test passes in @nur/core, others have 0 tests (no failure).

**Step 6: Commit**

```bash
git add vitest.workspace.ts packages/*/vitest.config.ts packages/core/src/index.test.ts
git commit -m "chore: configure Vitest workspace with turbo test"
```

---

### Task 11: Add .gitignore entries for generated directories

**Files:**
- Modify: `.gitignore` (create if not exists at root)

**Step 1: Ensure .gitignore includes generated Panda CSS output and build artifacts**

Add these entries:

```
# Panda CSS generated
styled-system/

# Build output
dist/

# Turbo
.turbo/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore entries for panda styled-system, dist, turbo"
```

---

### Task 12: Verify full turbo pipeline

**Step 1: Run turbo build**

Run: `pnpm build`
Expected: All packages typecheck and build successfully.

**Step 2: Run turbo test**

Run: `pnpm test`
Expected: All tests pass (1 trivial test in @nur/core).

**Step 3: Run turbo typecheck**

Run: `pnpm typecheck`
Expected: All packages typecheck successfully.

**Step 4: Verify dev server**

Run: `pnpm --filter @nur/editor dev`
Expected: Editor app starts, shows "NUR" centered on the page.

If any of these fail, fix the issue before proceeding. This is the foundation everything else builds on.

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Root package.json scripts + tsconfig.base.json |
| 2 | Turbo task configuration |
| 3 | Scaffold @nur/core |
| 4 | Scaffold @nur/pen-tool |
| 5 | Scaffold @nur/object-store |
| 6 | Scaffold @nur/renderer |
| 7 | Scaffold @nur/design-system with Panda CSS + Park UI |
| 8 | Scaffold apps/editor with Vite + React + Panda CSS |
| 9 | Add Park UI components via CLI |
| 10 | Configure Vitest workspace |
| 11 | Gitignore for generated dirs |
| 12 | Verify full turbo pipeline end-to-end |
