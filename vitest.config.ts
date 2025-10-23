import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov'],
      include: ['shared/privacy/**', 'homeostat/**'],
      all: true,
      lines: 90,
      functions: 90,
      statements: 90,
      branches: 85,
      perFile: true
    }
  }
});
