# Audit v3 — Carnet Naturaliste

Ce dossier contient le réaudit daté du 10 juillet 2026. Il couvre le dépôt, la production Vercel et le projet Supabase en lecture, sans correction applicative ni changement d'infrastructure.

Les preuves reproductibles sont rangées dans `evidence/`. Les données sensibles, identifiants d'utilisateurs et secrets sont exclus ou masqués.

## Synthèse (ajoutée le 2026-07-13)

L'audit a été interrompu avant son rapport final. Cette synthèse fige ce qui a
été effectivement produit, pour servir de référence au lot « ménage
dépendances & sécurité » qui lui fait suite.

### Gate projet et couverture

Voir [`evidence/baseline.md`](evidence/baseline.md) : `npm run check` vert
(TypeScript, ESLint, **446 tests**, build PWA), couverture globale **64,34 %**
avec une liste de composants critiques à 0 % (reprise possible dans un futur
lot tests E2E).

### Semgrep — résultat par scan

Règles utilisées : [`evidence/semgrep/rulesets.txt`](evidence/semgrep/rulesets.txt) ;
dépôts de règles tiers épinglés par commit dans
[`evidence/semgrep/third-party-commits.txt`](evidence/semgrep/third-party-commits.txt).
Sorties brutes JSON/SARIF dans [`evidence/semgrep/raw/`](evidence/semgrep/raw/).

| Scan | Fichiers scannés | Constats | Verdict |
|---|---:|---:|---|
| trailofbits/semgrep-rules | 142 | 0 | ✅ rien à signaler |
| apiiro/malicious-code-ruleset | 106 | 8 | ⚠️ 8 × `generic-one-liners`, tous **faux positifs** (voir ci-dessous) |
| elttam/semgrep-rules | — | — | ❌ échec technique (`PermissionError` sur un dossier temporaire Windows pendant le chargement des règles) |
| p/github-actions | 2 | 0 | ✅ rien à signaler |
| p/yaml | 0 | — | ❌ échec : le pack `p/yaml` du registry renvoyait HTTP 404 ce jour-là |
| Packs applicatifs du registry (p/security-audit, p/secrets, p/gitleaks, p/owasp-top-ten, p/cwe-top-25, p/sql-injection, p/typescript, p/javascript, p/react) | — | — | ⚠️ sorties non conservées (audit interrompu) |

**Les 8 constats apiiro** portent sur `App.tsx` (l. 717, 776),
`components/Auth/UserProfile.tsx` (l. 149), `components/GlassTabBar.tsx`
(l. 31) et `services/statsExportService.ts` (l. 252, 255, 272, 273). La règle
`generic-one-liners` est une heuristique de détection de code malveillant qui
signale les lignes très denses ; ici il s'agit de code applicatif légitime
(calculs compacts, exports). **Aucun problème de sécurité réel.**

### Conclusion

Aucun problème de sécurité applicatif détecté par les scans aboutis. Le risque
résiduel identifié au moment de l'audit se situe côté **dépendances** (alertes
Dependabot + `npm audit`), traité dans le lot « ménage dépendances &
sécurité » qui suit cet audit.

### Note d'hygiène du dossier

Lors du commit de ces preuves (2026-07-13), ont été exclus du dépôt : les
clones locaux des dépôts de règles (`evidence/semgrep/repos/`, ~3,7 Mo,
reproductibles via `third-party-commits.txt`), les logs d'exécution (chemins
machine locaux) et les fichiers de configuration/télémétrie de semgrep
(identifiants anonymes). Les fichiers `thirdparty-elttam.*` ne contiennent que
`<ERROR: missing output>` et sont conservés comme preuve de l'échec du scan.
