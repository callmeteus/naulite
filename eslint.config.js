import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                fetch: "readonly",
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                NodeJS: "readonly"
            }
        },
        rules: {
            "@typescript-eslint/no-namespace": "off"
        }
    },
    {
        ignores: ["**/dist/**", "**/node_modules/**", "packages/ui/packages/frontend/dist/**"]
    }
);