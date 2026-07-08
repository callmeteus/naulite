const { defineConfig } = require("@lemon/linting/define.config");
const tsParser = require(require("@lemon/linting/ts-parser-path"));

module.exports = defineConfig("@lemon/linting/vue.config", [
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: tsParser
        }
    },
    {
        rules: {
            "vue/no-multiple-template-root": "off",
            "vue/no-v-model-argument": "off",
            "vue/no-reserved-props": "off"
        }
    },
    {
        ignores: ["dist/**", "node_modules/**", "coverage/**"]
    }
]);
