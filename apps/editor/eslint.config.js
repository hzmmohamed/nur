import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["src/components/ui/**", "src/routeTree.gen.ts"],
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
