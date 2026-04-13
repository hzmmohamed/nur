import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "src/components/ui/**",
      "src/routeTree.gen.ts",
      // Generic tree library — uses standard React hooks internally
      "src/components/tree-node.tsx",
      "src/components/tree-view.tsx",
      "src/components/tree-drop-indicator.tsx",
      "src/hooks/use-tree-dnd.ts",
      "src/hooks/use-tree-lazy.ts",
      "src/hooks/use-tree-state.ts",
      "src/hooks/use-tree-keyboard.ts",
      "src/lib/tree-context.ts",
      "src/lib/tree-types.ts",
      "src/lib/tree-utils.ts",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "react",
            importNames: ["useEffect", "useState", "useMemo"],
            message: "Use effect-atom instead. See CLAUDE.md → effect-atom docs.",
          },
        ],
      }],
      "no-restricted-syntax": ["error", {
        selector: "NewExpression[callee.name='Map']",
        message: "Use MutableHashMap from effect/MutableHashMap or Cache from effect/Cache instead of native Map.",
      }],
    },
  },
)
