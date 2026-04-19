# Documentation des regions d'hebergement de l'infrastructure

**Date de mise a jour** : 2026-04-11

---

## Vue d'ensemble

L'application Carnet Naturaliste s'appuie sur des services cloud pour l'authentification,
le stockage des donnees et la distribution du frontend. Ce document recense les regions
d'hebergement et les implications RGPD.

---

## 1. Supabase (Backend)

| Composant | Detail |
|---|---|
| Service | Supabase (supabase.com) |
| Sous-traitant | Supabase Inc., San Francisco, CA, USA |
| Infrastructure | Amazon Web Services (AWS) |
| Region | `us-east-1` (Virginie du Nord, USA) |
| Donnees hebergees | Base PostgreSQL (observations, auth users), Storage (photos) |
| Transfert hors UE | **Oui** |
| Garanties | Standard Contractual Clauses (SCCs), SOC 2 Type II, chiffrement at-rest (AES-256), chiffrement in-transit (TLS 1.2+) |
| DPA | Disponible sur demande via le dashboard Supabase |

> **Note** : Supabase propose des regions EU (eu-west-1, eu-central-1). La migration
> vers une region EU est recommandee avant la mise en production commerciale pour
> simplifier la conformite RGPD.

## 2. Vercel (Frontend + Edge Functions)

| Composant | Detail |
|---|---|
| Service | Vercel (vercel.com) |
| Sous-traitant | Vercel Inc., San Francisco, CA, USA |
| Infrastructure | Edge network global (AWS + Cloudflare) |
| Region principale | Pas de region unique — CDN distribue globalement |
| Donnees hebergees | Code frontend (bundles JS/CSS), assets statiques, configuration (vercel.json, headers CSP) |
| Edge Functions | Region configurable (par defaut : `iad1` = us-east-1) |
| Transfert hors UE | **Oui** (CDN global, edge functions US) |
| Garanties | SOC 2 Type II, chiffrement in-transit (TLS 1.3), DPA disponible |

## 3. Supabase Edge Functions (delete-account)

| Composant | Detail |
|---|---|
| Service | Supabase Edge Functions (Deno Deploy) |
| Region | Meme region que le projet Supabase (`us-east-1`) |
| Donnees traitees | JWT token (verification), user ID (suppression) |
| Donnees persistees | Aucune — traitement ephemere |

---

## Recapitulatif des transferts hors UE

| Service | Region | Donnees | Garantie RGPD |
|---|---|---|---|
| Supabase (BDD) | us-east-1 | Observations, auth, photos | SCCs + chiffrement |
| Supabase Edge Fn | us-east-1 | JWT (ephemere) | SCCs |
| Vercel (CDN) | Global | Code frontend (public) | SOC 2 + DPA |
| iNaturalist | US | Termes de recherche (non personnel) | N/A |
| GBIF | EU/Global | Termes de recherche (non personnel) | N/A |
| Nominatim | EU/Global | Coordonnees GPS + IP | ODbL |
| Open-Meteo | EU | Coordonnees GPS | CC BY 4.0 |

---

## Recommandations

1. **Migrer Supabase vers une region EU** (ex: `eu-central-1`) avant le lancement commercial
2. **Configurer Vercel Edge Functions en region EU** (`cdg1` = Paris)
3. Documenter les SCCs dans le registre des sous-traitants (RGPD Art. 28)
4. Mettre a jour la politique de confidentialite avec les regions exactes apres migration
