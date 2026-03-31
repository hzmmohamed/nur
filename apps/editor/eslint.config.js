import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "react",
            importNames: ["useEffect", "useState"],
            message: "Use effect-atom instead. See CLAUDE.md → effect-atom docs.",
          },
        ],
      }],
    },
  },
)
