import { describe, expect, it } from 'vitest';
import { SEARCH_CATEGORIES, SEARCH_CATEGORY_KEYS } from '../supabase/functions/ai-text/logic';
import { TaxonomicGroup } from '../types';
import { TAXON_CATEGORIES, TAXON_CATEGORIES_VERSION, TAXON_CATEGORY_KEYS } from '../utils/taxonCategories';

describe('dictionnaire des catégories de la recherche', () => {
    it('est versionné et compte une vingtaine de catégories', () => {
        expect(Number.isInteger(TAXON_CATEGORIES_VERSION)).toBe(true);
        expect(TAXON_CATEGORIES.length).toBeGreaterThanOrEqual(18);
        expect(TAXON_CATEGORIES.length).toBeLessThanOrEqual(30);
    });

    it('clés et libellés recopiés à l’identique dans la fonction ai-text', () => {
        expect(SEARCH_CATEGORIES).toEqual(TAXON_CATEGORIES.map(({ key, label }) => ({ key, label })));
        expect(SEARCH_CATEGORY_KEYS).toEqual(TAXON_CATEGORY_KEYS);
    });

    it('clés uniques, stables, en minuscules ASCII', () => {
        expect(new Set(TAXON_CATEGORY_KEYS).size).toBe(TAXON_CATEGORY_KEYS.length);
        for (const key of TAXON_CATEGORY_KEYS) expect(key).toMatch(/^[a-z]+(?:_[a-z]+)*$/);
    });

    it('chaque catégorie a un libellé, un groupe de l’application, des synonymes et des genres', () => {
        const groups = Object.values(TaxonomicGroup) as string[];
        const labels = new Set<string>();
        for (const category of TAXON_CATEGORIES) {
            expect(category.label.trim(), category.key).toBe(category.label);
            expect(category.label.length, category.key).toBeGreaterThan(2);
            expect(labels.has(category.label), category.label).toBe(false);
            labels.add(category.label);
            expect(groups, category.key).toContain(category.group);
            expect(category.group, category.key).not.toBe(TaxonomicGroup.OTHER);
            expect(category.synonyms.length, category.key).toBeGreaterThan(0);
            expect(category.genera.length, category.key).toBeGreaterThan(0);
        }
    });

    it('genres au bon format (un mot, majuscule initiale), sans doublon dans le dictionnaire', () => {
        const seen = new Map<string, string>();
        for (const category of TAXON_CATEGORIES) {
            for (const genus of category.genera) {
                expect(genus, category.key).toMatch(/^[A-Z][a-z]+$/);
                // Un genre dans deux catégories rendrait le filtre ambigu.
                expect(seen.get(genus), `${genus} : ${category.key}`).toBeUndefined();
                seen.set(genus, category.key);
            }
        }
    });

    it('synonymes en minuscules, sans doublon dans une catégorie ; seuls les rapaces en partagent', () => {
        const owners = new Map<string, string[]>();
        for (const category of TAXON_CATEGORIES) {
            expect(new Set(category.synonyms).size, category.key).toBe(category.synonyms.length);
            for (const synonym of category.synonyms) {
                expect(synonym, category.key).toBe(synonym.toLocaleLowerCase('fr').trim());
                owners.set(synonym, [...(owners.get(synonym) ?? []), category.key]);
            }
        }
        const shared = [...owners].filter(([, keys]) => keys.length > 1);
        expect(Object.fromEntries(shared)).toEqual({
            rapaces: ['rapaces_diurnes', 'rapaces_nocturnes'],
            'oiseaux de proie': ['rapaces_diurnes', 'rapaces_nocturnes'],
        });
    });

    it('ne recopie pas un groupe de l’application (le groupe est le bon filtre)', () => {
        const groupNames = (Object.values(TaxonomicGroup) as string[]).map(name => name.toLocaleLowerCase('fr'));
        for (const category of TAXON_CATEGORIES) {
            expect(groupNames, category.key).not.toContain(category.label.toLocaleLowerCase('fr'));
            for (const synonym of category.synonyms) expect(groupNames, synonym).not.toContain(synonym);
        }
        for (const duplicate of ['chauves-souris', 'orchidées', 'libellules', 'papillons de jour', 'amphibiens']) {
            expect(TAXON_CATEGORIES.some(category => (category.synonyms as readonly string[]).includes(duplicate)), duplicate).toBe(false);
        }
    });

    it('quelques genres attendus sont bien rangés', () => {
        const categoryOf = (genus: string) => TAXON_CATEGORIES.find(category => (category.genera as readonly string[]).includes(genus))?.key;
        expect(categoryOf('Buteo')).toBe('rapaces_diurnes');
        expect(categoryOf('Falco')).toBe('rapaces_diurnes');
        expect(categoryOf('Strix')).toBe('rapaces_nocturnes');
        expect(categoryOf('Anas')).toBe('canards');
        expect(categoryOf('Cygnus')).toBe('oies_cygnes');
        expect(categoryOf('Calidris')).toBe('limicoles');
        expect(categoryOf('Ardea')).toBe('ardeides');
        expect(categoryOf('Vipera')).toBe('serpents');
        // Ni la prêle ni l'orvet : pas des fougères, pas un serpent.
        expect(categoryOf('Equisetum')).toBeUndefined();
        expect(categoryOf('Anguis')).toBeUndefined();
    });
});
