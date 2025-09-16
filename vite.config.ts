import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { comlink } from "vite-plugin-comlink";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all environment variables from .env files
  const env = loadEnv(mode, process.cwd(), "");

  // Patch process.env with loaded variables
  // This makes variables from .env files available to packages that read process.env
  Object.assign(process.env, env);

  return {
    define: {
      // Or, if the package expects process.env to be an object, you can define it like this:
      "process.env": JSON.stringify(process.env),
    },
    optimizeDeps: {
      exclude: ["y-indexeddb"],
    },
    plugins: [
      comlink(),
      tailwindcss(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
    ],
    worker: {
      plugins: () => [comlink()],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
