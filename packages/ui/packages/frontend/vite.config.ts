import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.resolve(rootDir, "../../../..");
const platformAssetsDir = path.resolve(platformRoot, "assets");

export default defineConfig({
    publicDir: platformAssetsDir,
    plugins: [tailwindcss(), vue()],
    resolve: {
        alias: {
            "~root": platformRoot,
            "@naulite/sdk": path.resolve(rootDir, "../../../sdk/src/index.ts"),
            "@naulite/shared": path.resolve(rootDir, "../../../nodejs/shared/src/index.ts")
        }
    },
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: process.env.ADMIN_API_URL ?? "http://localhost:3001",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, "")
            }
        }
    },
    build: {
        outDir: "dist",
        target: "es2022"
    }
});
