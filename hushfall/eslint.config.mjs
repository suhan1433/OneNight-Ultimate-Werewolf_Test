import tseslint from 'typescript-eslint';
export default tseslint.config({
  ignores: ['src/core/sim/angles.ts'],
  files: ['src/core/sim/**/*.ts'],
  languageOptions: { parser: tseslint.parser },
  rules: {
    'no-restricted-syntax': ['error',
      { selector: 'CallExpression[callee.object.name="Math"][callee.property.name="random"]', message: 'Use the simulation RNG.' },
      { selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]', message: 'Use ticks for simulation time.' },
      { selector: 'CallExpression[callee.object.name="Math"][callee.property.name=/^(cos|sin)$/]', message: 'Use the angle lookup table.' },
    ],
  },
});
