import { describe, expect, it } from 'vitest';
import { TaxonomicGroup, type Observation } from '../types';
import { ALLOWED_TAXONOMIC_GROUPS, MAX_BODY_BYTES, SUMMARY_LIMITS, validateSummaryInput } from '../supabase/functions/ai-text/logic';
import {
    MONTHLY_SUMMARY_LIMITS,
    buildMonthlySummaryPayload,
    buildSpeciesKeyResolver,
    cleanSpeciesName,
    computeMonthlySummaryStats,
    defaultSummaryMonth,
    formatMonthLabel,
    selectableMonths,
    summaryFingerprint,
} from '../utils/monthlySummaryStats';

let counter = 0;
const obs = (speciesName: string, latinName: string, date: string, extra: Partial<Observation> = {}): Observation => ({
    id: `obs-${++counter}`,
    speciesName,
    latinName,
    taxonomicGroup: TaxonomicGroup.BIRD,
    date,
    time: '09:00',
    count: 1,
    location: 'Lieu-dit secret',
    gps: { lat: 47.2, lon: -1.5 },
    municipality: 'Commune secrète',
    department: '44',
    country: 'France',
    altitude: null,
    comment: 'Commentaire privé',
    ...extra,
} as Observation);

const NOW = new Date(2026, 10, 13); // 13 novembre 2026

describe('clé d’espèce unique', () => {
    it('rapproche un nom courant sans latin du latin trouvé ailleurs', () => {
        const data = [
            obs('Mésange charbonnière', 'Parus major', '2026-03-08'),
            obs('mesange  charbonniere', '', '2026-10-11'),
        ];
        const resolver = buildSpeciesKeyResolver(data);
        expect(resolver.keyOf(data[0])).toBe(resolver.keyOf(data[1]));
        expect(resolver.nameOf(resolver.keyOf(data[0])!)).toBe('Mésange charbonnière');
    });

    it('distingue deux noms latins différents malgré le même nom courant', () => {
        const data = [obs('Pouillot', 'Phylloscopus collybita', '2026-04-01'), obs('Pouillot', 'Phylloscopus trochilus', '2026-04-02')];
        const resolver = buildSpeciesKeyResolver(data);
        expect(resolver.keyOf(data[0])).not.toBe(resolver.keyOf(data[1]));
    });

    it('ignore une observation sans aucun nom', () => {
        const resolver = buildSpeciesKeyResolver([obs('', '', '2026-04-01')]);
        expect(resolver.keyOf(obs('', '', '2026-04-01'))).toBeNull();
    });
});

describe('computeMonthlySummaryStats', () => {
    const data = [
        obs('Mésange charbonnière', 'Parus major', '2026-03-08', { count: 2 }),
        obs('Mésange charbonnière', 'Parus major', '2026-10-03', { count: 3 }),
        obs('Rougegorge familier', 'Erithacus rubecula', '2026-10-03', { count: 2 }),
        obs('Mésange charbonnière', '', '2026-10-11', { count: 2 }),
        obs('Amanite tue-mouches', 'Amanita muscaria', '2026-10-18', { taxonomicGroup: TaxonomicGroup.MUSHROOM }),
    ];

    it('calcule les totaux, les groupes, les espèces et les nouvelles', () => {
        const stats = computeMonthlySummaryStats(data, '2026-10', NOW);
        expect(stats.provisional).toBe(false);
        expect(stats.totals).toEqual({ observations: 4, species: 3, activeDays: 3 });
        expect(stats.groups).toEqual([
            { group: 'Oiseaux', observations: 3, species: 2 },
            { group: 'Champignons', observations: 1, species: 1 },
        ]);
        expect(stats.species[0]).toEqual({ name: 'Mésange charbonnière', count: 5 });
        // La mésange était déjà dans le carnet en mars : pas nouvelle en octobre.
        expect(stats.newSpecies).toEqual(['Amanite tue-mouches', 'Rougegorge familier']);
    });

    it('marque le mois en cours comme provisoire', () => {
        expect(computeMonthlySummaryStats(data, '2026-11', NOW).provisional).toBe(true);
    });

    it('donne des chiffres nuls pour un mois sans observation', () => {
        const stats = computeMonthlySummaryStats(data, '2026-07', NOW);
        expect(stats.totals).toEqual({ observations: 0, species: 0, activeDays: 0 });
        expect(stats.groups).toEqual([]);
        expect(stats.species).toEqual([]);
        expect(stats.newSpecies).toEqual([]);
    });

    it('ne compare à l’an passé que si le carnet couvre ce mois en entier', () => {
        expect(computeMonthlySummaryStats(data, '2026-10', NOW).previousYear).toBeNull();
        const older = [...data, obs('Pinson des arbres', 'Fringilla coelebs', '2025-09-01')];
        expect(computeMonthlySummaryStats(older, '2026-10', NOW).previousYear).toEqual({ observations: 0, species: 0, activeDays: 0 });
        const fromFirstDay = [...data, obs('Pinson des arbres', 'Fringilla coelebs', '2025-10-01', { count: 4 })];
        expect(computeMonthlySummaryStats(fromFirstDay, '2026-10', NOW).previousYear).toEqual({ observations: 1, species: 1, activeDays: 1 });
    });

    it('ne compare pas un carnet commencé en cours de mois l’an passé', () => {
        // Première observation le 30 octobre 2025 : octobre 2025 est incomplet.
        const lateStart = [...data, obs('Pinson des arbres', 'Fringilla coelebs', '2025-10-30')];
        expect(computeMonthlySummaryStats(lateStart, '2026-10', NOW).previousYear).toBeNull();
    });

    it('ne compare pas le mois en cours à un mois entier de l’an passé', () => {
        const withLastYear = [...data, obs('Pinson des arbres', 'Fringilla coelebs', '2025-09-01'), obs('Pinson des arbres', 'Fringilla coelebs', '2025-11-20')];
        const current = computeMonthlySummaryStats(withLastYear, '2026-11', NOW);
        expect(current.provisional).toBe(true);
        expect(current.previousYear).toBeNull();
    });

    it('distingue par le nom latin deux espèces qui partagent un nom courant', () => {
        const pouillots = [
            obs('Pouillot', 'Phylloscopus collybita', '2026-10-02', { count: 3 }),
            obs('Pouillot', 'Phylloscopus trochilus', '2026-10-05'),
        ];
        const stats = computeMonthlySummaryStats(pouillots, '2026-10', NOW);
        expect(stats.species.map(item => item.name)).toEqual(['Pouillot (Phylloscopus collybita)', 'Pouillot (Phylloscopus trochilus)']);
        expect(new Set(stats.newSpecies).size).toBe(2);
        expect(validateSummaryInput(buildMonthlySummaryPayload(stats)).ok).toBe(true);
    });

    it('choisit le nom affiché sans dépendre de l’ordre des observations', () => {
        const a = obs('Rouge-gorge familier', 'Erithacus rubecula', '2026-10-03');
        const b = obs('Rougegorge familier', 'Erithacus rubecula', '2026-10-12');
        const first = computeMonthlySummaryStats([a, b], '2026-10', NOW).species[0].name;
        const second = computeMonthlySummaryStats([b, a], '2026-10', NOW).species[0].name;
        expect(first).toBe(second);
    });

    it('range un groupe inconnu dans « Autre » et compte 1 un effectif invalide', () => {
        const odd = [obs('Bizarre', 'Bizarrus', '2026-10-01', { taxonomicGroup: 'Inconnu' as TaxonomicGroup, count: Number.NaN })];
        const stats = computeMonthlySummaryStats(odd, '2026-10', NOW);
        expect(stats.groups).toEqual([{ group: 'Autre', observations: 1, species: 1 }]);
        expect(stats.species).toEqual([{ name: 'Bizarre', count: 1 }]);
    });
});

describe('buildMonthlySummaryPayload', () => {
    it('ne contient que les champs attendus par validateSummaryInput, et passe tel quel', () => {
        const data = [
            obs('Mésange charbonnière', 'Parus major', '2025-10-04'),
            obs('Rougegorge familier', 'Erithacus rubecula', '2026-10-03', { count: 2 }),
        ];
        const payload = buildMonthlySummaryPayload(computeMonthlySummaryStats(data, '2026-10', NOW));
        expect(Object.keys(payload).sort()).toEqual(['groups', 'month', 'newSpecies', 'newSpeciesMore', 'previousYear', 'provisional', 'topSpecies', 'totals']);
        const validation = validateSummaryInput(payload);
        expect(validation.ok).toBe(true);
        if (validation.ok) expect(validation.value).toEqual(payload);
        // Rien de privé : ni lieu, ni commune, ni GPS, ni commentaire, ni date précise.
        const sent = JSON.stringify(payload);
        for (const secret of ['Lieu-dit', 'Commune', '47.2', 'Commentaire', '2026-10-03']) expect(sent).not.toContain(secret);
    });

    it('plafonne à 15 espèces par effectif et 30 nouvelles, puis « + N autres »', () => {
        const data = Array.from({ length: 45 }, (_, i) => obs(`Espèce ${String(i).padStart(2, '0')}`, `Genus species${i}`, '2026-10-05', { count: i + 1 }));
        const payload = buildMonthlySummaryPayload(computeMonthlySummaryStats(data, '2026-10', NOW));
        expect(payload.topSpecies).toHaveLength(MONTHLY_SUMMARY_LIMITS.maxTopSpecies);
        expect(payload.topSpecies[0]).toEqual({ name: 'Espèce 44', count: 45 });
        expect(payload.newSpecies).toHaveLength(SUMMARY_LIMITS.maxNewSpecies);
        expect(payload.newSpeciesMore).toBe(15);
        expect(validateSummaryInput(payload).ok).toBe(true);
    });

    it('reste sous la taille du corps même avec des noms très longs', () => {
        // Numéro en tête (il survit à la coupe à 120) et caractères de 3 octets :
        // sans réduction, le corps dépasserait 15 Ko.
        const long = (i: number) => `${String(i).padStart(3, '0')}${'鳥'.repeat(130)}`;
        const data = Array.from({ length: 45 }, (_, i) => obs(long(i), `Genus species${i}`, '2026-10-05'));
        const stats = computeMonthlySummaryStats(data, '2026-10', NOW);
        expect(new Set(stats.newSpecies).size).toBe(45);
        const payload = buildMonthlySummaryPayload(stats);
        const bytes = new TextEncoder().encode(JSON.stringify({ feature: 'summary', payload })).length;
        expect(bytes).toBeLessThanOrEqual(MONTHLY_SUMMARY_LIMITS.maxPayloadBytes);
        expect(bytes).toBeLessThanOrEqual(MAX_BODY_BYTES);
        expect(payload.newSpecies.length).toBeLessThan(SUMMARY_LIMITS.maxNewSpecies);
        expect(payload.newSpeciesMore).toBeGreaterThan(15);
        expect(payload.newSpecies.length + payload.newSpeciesMore).toBe(45);
        expect(validateSummaryInput(payload).ok).toBe(true);
    });

    it('accepte un mois vide', () => {
        const payload = buildMonthlySummaryPayload(computeMonthlySummaryStats([], '2026-07', NOW));
        expect(validateSummaryInput(payload).ok).toBe(true);
    });
});

describe('cleanSpeciesName', () => {
    it('retire les caractères invisibles et borne à 120 caractères', () => {
        expect(cleanSpeciesName('Mé‮sange\u0007 bleue')).toBe('Mésange bleue');
        expect(cleanSpeciesName('a'.repeat(300))).toHaveLength(SUMMARY_LIMITS.maxSpeciesNameLength);
        // Compté en unités UTF-16, comme la fonction, sans couper un caractère.
        const astral = cleanSpeciesName('𝔄'.repeat(100));
        expect(astral.length).toBeLessThanOrEqual(SUMMARY_LIMITS.maxSpeciesNameLength);
        expect(astral).toBe('𝔄'.repeat(60));
    });
});

describe('groupes', () => {
    it('la liste de types.ts est celle acceptée par la fonction', () => {
        expect([...Object.values(TaxonomicGroup)].sort()).toEqual([...ALLOWED_TAXONOMIC_GROUPS].sort());
    });
});

describe('mois', () => {
    it('propose les 12 derniers mois, le dernier mois complet par défaut', () => {
        const months = selectableMonths(NOW);
        expect(months).toHaveLength(12);
        expect(months[0]).toBe('2026-11');
        expect(months[11]).toBe('2025-12');
        expect(defaultSummaryMonth(NOW)).toBe('2026-10');
        expect(defaultSummaryMonth(new Date(2026, 0, 5))).toBe('2025-12');
        expect(formatMonthLabel('2026-10')).toBe('octobre 2026');
    });
});

describe('summaryFingerprint', () => {
    it('ne change pas quand on saisit une observation un autre mois', () => {
        const october = [
            obs('Rouge-gorge familier', 'Erithacus rubecula', '2026-09-12'),
            obs('Rougegorge familier', 'Erithacus rubecula', '2026-10-03'),
        ];
        const before = summaryFingerprint(buildMonthlySummaryPayload(computeMonthlySummaryStats(october, '2026-10', NOW)));
        const withNovember = [obs('Rouge-gorge familier', 'Erithacus rubecula', '2026-11-13'), ...october];
        const after = summaryFingerprint(buildMonthlySummaryPayload(computeMonthlySummaryStats(withNovember, '2026-10', NOW)));
        expect(after).toBe(before);
        // L'ordre du tableau ne compte pas non plus.
        const reversed = summaryFingerprint(buildMonthlySummaryPayload(computeMonthlySummaryStats([...withNovember].reverse(), '2026-10', NOW)));
        expect(reversed).toBe(before);
    });

    it('change quand les chiffres changent, pas avec la seule mention provisoire', () => {
        const data = [obs('Rougegorge familier', 'Erithacus rubecula', '2026-10-03')];
        const a = buildMonthlySummaryPayload(computeMonthlySummaryStats(data, '2026-10', NOW));
        const b = buildMonthlySummaryPayload(computeMonthlySummaryStats([...data, obs('Héron cendré', 'Ardea cinerea', '2026-10-04')], '2026-10', NOW));
        expect(summaryFingerprint(a)).not.toBe(summaryFingerprint(b));
        expect(summaryFingerprint({ ...a, provisional: true })).toBe(summaryFingerprint(a));
    });
});
