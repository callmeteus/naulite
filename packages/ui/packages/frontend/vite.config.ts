import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [tailwindcss(), vue()],
    resolve: {
        alias: {
            "@naulite/sdk": path.resolve(rootDir, "../../../sdk/src/index.ts"),
            "@naulite/shared": path.resolve(rootDir, "../../../nodejs/shared/src/index.ts")
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
