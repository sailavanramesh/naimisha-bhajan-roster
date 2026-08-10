import { FlatCompat } from '@eslint/eslintrc';

// eslint-config-next is still eslintrc-shaped, so it is bridged into flat
// config. `next lint` is deprecated and removed in Next 16; `npm run lint`
// calls the ESLint CLI directly instead.
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'prisma/migrations/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // CLAUDE.md: no `any`, and no @ts-expect-error without an explanation.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
    },
  },
  {
    // The seed talks to a spreadsheet whose cells are genuinely unknown at
    // compile time, so it reads them through `unknown` and narrows by hand.
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default config;
