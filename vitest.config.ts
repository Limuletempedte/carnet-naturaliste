import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['components/**/*.{ts,tsx}', 'services/**/*.ts', 'utils/**/*.ts', 'hooks/**/*.ts'],
            exclude: [
                '**/*.d.ts',
                '**/*.test.{ts,tsx}',
                'node_modules/**',
                'dist/**',
            ],
            // Thresholds conservateurs, a relever progressivement.
            // Ancrage : couverture actuelle autour de ces valeurs au thème 10.
            thresholds: {
                lines: 45,
                functions: 60,
                branches: 55,
                statements: 45,
            },
        },
    },
});
