# Limites Methodologiques - Audit v5.2

## Nature de l'audit

Cet audit a ete realise par **analyse statique du code source** par un LLM (Claude). Il ne constitue pas un audit de securite professionnel, un test de penetration, un audit d'accessibilite par des utilisateurs handicapes, ni un test de performance reel.

## Ce qui a ete fait

| Methode | Description | Couverture |
|---------|-------------|------------|
| **Lecture du code source** | Lecture de tous les fichiers .tsx, .ts, .css, .json, .sql du projet | ~100% des fichiers source |
| **Analyse des configurations** | tsconfig.json, vite.config.ts, tailwind.config.js, vercel.json, package.json, eslint.config.js | 100% |
| **Recherche par patterns** | grep/ripgrep pour les anti-patterns (any, console.log, TODO, hardcoded, etc.) | Exhaustif sur les patterns recherches |
| **Analyse des dependances** | Versions, licences, statut de maintenance des packages npm | 100% des deps runtime |
| **Comparaison concurrentielle** | Positionnement mental vs iNaturalist, Faune-France, eBird/Merlin | Basee sur les connaissances de l'auditeur |
| **Verification croisee** | Comparaison avec un audit precedent (Codex) pour confirmer/infirmer des constats | Partielle |

## Ce qui n'a PAS ete fait

| Methode absente | Impact | Constats potentiellement affectes |
|-----------------|--------|----------------------------------|
| **Tests sur appareils reels** (iPhone, Android, tablettes) | Les problemes iOS (meta tags, cache 7j, safe-area) sont bases sur la connaissance des limitations, pas sur des tests. | CO-02, CO-07, CO-11, CO-21 |
| **Test Lighthouse** | Les scores de performance, accessibilite, PWA ne sont pas mesures reellement. | PE-*, AC-*, CO-* |
| **Test de penetration** | Les vulnerabilites XSS, injection, CSRF sont evaluees par lecture du code, pas par exploitation. | SE-01 a SE-20 |
| **Test avec lecteur d'ecran** (NVDA, VoiceOver, JAWS) | L'accessibilite est evaluee par lecture du HTML/ARIA, pas par experience utilisateur reelle. | AC-01 a AC-30 |
| **Test utilisateur** | L'UX est evaluee par analyse de l'interface, pas par observation d'utilisateurs reels. | UX-01 a UX-37 |
| **Profiling memoire / CPU** | Les problemes de performance sont deduits de la structure du code, pas mesures. | PE-01 a PE-29 |
| **Audit RGPD par un DPO/juriste** | Les constats vie privee sont bases sur la connaissance generale du RGPD, pas sur un avis juridique. | VP-01 a VP-23 (theme 7) |
| **Analyse des logs serveur** | Pas d'acces aux logs Supabase/Vercel en production. | SR-*, SI-* |
| **Tests de charge** | Pas de test avec 10K+ observations simultanees. | PE-01, PE-02, PE-22 |
| **Verification des CVEs** | Les CVEs de `xlsx` sont connues par reputation, pas par scan `npm audit` en temps reel. | SE-13, QT-17 |

## Niveaux de preuve utilises

| Niveau | Definition | Fiabilite | Nombre |
|--------|-----------|-----------|--------|
| **STATIQUE** | Constat base sur la lecture directe du code source. Le probleme est visible dans le code. | Haute (>90%) | ~304 |
| **SEMI-DYN** | Constat base sur l'execution de commandes (npm, grep) ou l'analyse de la configuration build. | Haute (>85%) | ~5 |
| **INFERENCE** | Constat deduit du comportement probable du code sans execution. Hypothese raisonnable mais non confirmee. | Moyenne (60-80%) | ~48 |
| **DYNAMIQUE** | Constat base sur un test reel execute. | Tres haute (>95%) | 0 |
| **NON-VERIF** | Constat non verifiable par l'auditeur (ex: configuration serveur Supabase, etat de la base de production). | Variable | 0 |

## Biais et limites connus

1. **Biais de severite conservateur** : en cas de doute, le constat est classe avec la severite superieure. Il est possible que certains constats HAUTE soient en realite MOYENNE apres verification dynamique.

2. **Faux positifs possibles** : certains constats bases sur l'INFERENCE pourraient etre invalides si le comportement runtime differe de ce que le code suggere. Exemples :
   - SI-01 (collision Date.now()) : en pratique, la probabilite de collision est faible dans un usage normal (mais non nulle)
   - PE-13 (80 requetes startup) : le nombre reel depend du nombre d'observations et du cache

3. **Faux negatifs possibles** : l'analyse statique ne peut pas detecter :
   - Les bugs de concurrence rares
   - Les problemes d'encodage specifiques a certaines locales
   - Les vulnerabilites zero-day dans les dependances
   - Les problemes de performance specifiques a certains appareils

4. **Scope limite au code client** : l'audit ne couvre pas :
   - La configuration Supabase cote serveur (triggers, fonctions, policies non visibles)
   - La configuration Vercel reelle (headers, redirects, firewall)
   - Les donnees en base de production
   - Les backups Supabase automatiques

5. **Comparaison concurrentielle subjective** : le positionnement vs iNaturalist, Faune-France et eBird est base sur les connaissances generales de l'auditeur, pas sur une analyse de marche formelle.

6. **Constats juridiques non-qualifies** : les constats RGPD/CNIL (theme 7) sont bases sur une comprehension generale de la reglementation. Un avis juridique professionnel est indispensable avant la commercialisation.

## Recommandations pour un audit complementaire

| Type d'audit | Objectif | Priorite |
|--------------|----------|----------|
| **Audit RGPD par un DPO** | Valider les constats VP-01 a VP-23 et rediger les documents legaux | P0 (bloquant) |
| **Test de penetration** | Confirmer/infirmer SE-01 a SE-20, tester les policies RLS en profondeur | P1 |
| **Audit d'accessibilite RGAA** | Tester avec lecteurs d'ecran, valider la conformite WCAG 2.2 AA | P1 |
| **Test de charge** | Valider les seuils de performance avec 1K, 5K, 10K observations | P2 |
| **Test utilisateur** | Observer 5-10 naturalistes utiliser l'app pour la premiere fois | P2 |
| **npm audit** | Scanner les CVEs reelles des dependances | P1 (automatisable) |
