const { defineConfig } = require("@lemon/linting/define.config");

module.exports = defineConfig("@lemon/linting/backend.config", [
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            "coverage/**",
            "**/*.astro",
            ".astro/**"
        ]
    }
]);
