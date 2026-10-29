// PatMail 扩展的 ESLint Flat Config。
// 分层策略见 docs/ci/quality-gates.md：
//   1. 浏览器源码（src/**.ts）走真实类型检查（projectService），拦浮空 Promise 与不安全 any；
//   2. Node 工具脚本（scripts/、tests/e2e/）只用无类型信息的 Node 规则，避免把 JS 脚本塞进 tsconfig；
//   3. Vue 单文件组件走 vue3 推荐规则 + TS 语法解析（类型层由 vue-tsc 兜底）；
//   4. 测试代码按 Vitest 习惯放宽部分规则，但不关闭任何整目录检查。
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import prettierConfig from 'eslint-config-prettier'

const unusedVars = ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'delivery/**',
      'test-results/**',
      'coverage/**',
      '**/__pycache__/**',
      'src/assets/**',
    ],
  },

  // ---- Node.js 工具脚本（无类型信息） ----
  {
    files: ['tests/e2e/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': unusedVars,
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-await': 'error',
      'require-await': 'error',
      'no-async-promise-executor': 'error',
    },
  },

  // ---- TypeScript 浏览器源码（真实类型检查） ----
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.worker, chrome: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': unusedVars,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/require-await': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-async-promise-executor': 'error',
      // TypeScript 自身负责未定义符号检查。
      'no-undef': 'off',
    },
  },

  // ---- TypeScript 测试与共享测试设施 ----
  {
    files: ['tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.browser, chrome: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': unusedVars,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // 测试里常见 async 用例不 await 的假实现，交给上一条 no-misused-promises 覆盖。
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-async-promise-executor': 'error',
      'no-undef': 'off',
    },
  },

  // ---- Vue 3 单文件组件 ----
  {
    files: ['**/*.vue'],
    extends: [...pluginVue.configs['flat/recommended']],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
      globals: { ...globals.browser, chrome: 'readonly' },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      'vue/quote-props': 'off',
      'vue/prop-name-casing': 'error',
      'vue/no-unused-components': 'error',
      'vue/require-v-for-key': 'error',
      'vue/no-use-v-if-with-v-for': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },

  // 格式相关规则交给 Prettier，避免互相打架。
  prettierConfig,
)
