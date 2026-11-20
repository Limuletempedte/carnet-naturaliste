import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        // Les sessions Claude créent leurs copies de travail dans
        // .claude/worktrees/<nom>/ : chacune contient tout le projet. Sans cette
        // exclusion, `npm run check` lancé dans le dossier principal exécute aussi
        // leurs tests. Motif ancré à la racine (pas `**/.claude/**`) : lancé depuis
        // une copie de travail, le chemin complet contient lui-même `.claude/`.
        exclude: [...configDefaults.exclude, '.claude/**'],
        // Les tests de formulaire (jsdom + userEvent) dépassent parfois 5 s quand
        // la machine est chargée (deux suites lancées en même temps, par exemple).
        // Un délai plus large évite ces faux échecs sans masquer un vrai blocage.
        testTimeout: 20_000,
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
