import prettier from 'eslint-plugin-prettier';
import jest from 'eslint-plugin-jest';

export default [
  {
    files: ['**/*.js'],
    plugins: {
      prettier: prettier,
      jest: jest
    },
    ignores: ['node_modules/', 'dist/'],
    rules: {}
  }
];
