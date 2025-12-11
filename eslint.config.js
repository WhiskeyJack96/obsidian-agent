import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		plugins: {
			obsidianmd: obsidianmd,
		},
		rules: {
			// Obsidian-specific rules from the bot feedback
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/commands/no-default-hotkeys": "error",
			"obsidianmd/ui/sentence-case": ["warn", {
				acronyms: ["ACP", "MCP", "ID"],
			}],
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/no-sample-code": "warn",
			// TypeScript ESLint rules
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/require-await": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": "error",
			// Console rules
			"no-console": ["error", { allow: ["warn", "error", "debug"] }],
		},
	},
	{
		ignores: [
			"node_modules/**",
			"main.js",
			"*.config.js",
			"*.config.mjs",
			"version-bump.mjs",
			"__mocks__/**",
			"**/*.test.ts",
			"**/*.spec.ts",
			"tests/**",
		],
	}
);

