import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@platform/sdk": path.resolve(rootDir, "../../../sdk/src/index.ts"),
            "@platform/shared": path.resolve(rootDir, "../../../shared/src/index.ts")
        }
    },
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: process.env.ADMIN_API_URL ?? "http://localhost:3001",
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: "dist"
    }
});
