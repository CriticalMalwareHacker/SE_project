import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ mode }) => {
  const projectEnv = loadEnv(mode, projectRoot, "");
  return {
    envDir: projectRoot,
    define: {
      // Neon Auth's branch URL is public client configuration; DATABASE_URL and
      // NEON_AUTH_JWKS_URL are intentionally not included in the browser bundle.
      "import.meta.env.VITE_NEON_AUTH_URL": JSON.stringify(projectEnv.NEON_AUTH_BASE_URL || process.env.NEON_AUTH_BASE_URL || ""),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:5000",
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
    },
  };
});
