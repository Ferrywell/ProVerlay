import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

export default [
  { ignores: ['pkg/**', 'node_modules/**'] },
  ...(await generateEslintConfig({})),
  {
    // The module is an ES module package ("type": "module").
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { sourceType: 'module', ecmaVersion: 'latest' },
  },
]
