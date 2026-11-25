import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'desktop/dist/**', '.wrangler/**', 'vendor/**', '.claude/**', '.codex/**', '**/*.local/**'] }, // agent worktrees nest under .claude/ and .codex/; *.local folders are private (.gitignore)
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['redirect/**/*.js', 'public/push-sw.js', 'public/app-startup.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.mjs', 'desktop/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['desktop/**/*.cjs'], // Electron's sandboxed preload is CommonJS
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
)
