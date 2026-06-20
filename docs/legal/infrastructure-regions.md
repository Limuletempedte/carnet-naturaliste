# Documentation des regions d'hebergement de l'infrastructure

**Date de mise a jour** : 2026-06-20

---

## Vue d'ensemble

L'application Carnet Naturaliste s'appuie sur des services cloud pour l'authentification,
le stockage des donnees et la distribution du frontend. Ce document recense les regions
d'hebergement et les implications RGPD.

**Synthese : les donnees personnelles (compte, observations, photos, sons) sont hebergees
dans l'Union europeenne (Supabase, region `eu-central-1` / Francfort). Aucun transfert de
donnees personnelles hors UE pour le coeur de l'application.**

---

## 1. Supabase (Backend)

| Composant | Detail |
|---|---|
| Service | Supabase (supabase.com) |
| Sous-traitant | Supabase Inc. |
| Infrastructure | Amazon Web Services (AWS) |
| Region | `eu-central-1` (Francfort, Allemagne, UE) |
| Donnees hebergees | Base PostgreSQL (observations, auth users), Storage (photos, sons) |
| Transfert hors UE | **Non** — donnees hebergees dans l'UE |
| Garanties | SOC 2 Type II, chiffrement at-rest (AES-256), chiffrement in-transit (TLS 1.2+), DPA |

## 2. Vercel (Frontend)

| Composant | Detail |
|---|---|
| Service | Vercel (vercel.com) |
| Sous-traitant | Vercel Inc. |
| Infrastructure | Edge network global (CDN) |
| Region | Pas de region unique — CDN distribue globalement |
| Donnees hebergees | Uniquement le frontend public (bundles JS/CSS, assets statiques, configuration). **Aucune donnee personnelle.** |
| Transfert hors UE | Sans objet — aucune donnee personnelle sur Vercel (fichiers statiques publics uniquement) |
| Garanties | SOC 2 Type II, chiffrement in-transit (TLS 1.3), DPA |

> L'application est une SPA statique : tout le traitement des donnees personnelles est
> assure par Supabase (UE). Aucune fonction serveur Vercel ne traite de donnees personnelles.

## 3. Supabase Edge Functions (delete-account)

| Composant | Detail |
|---|---|
| Service | Supabase Edge Functions |
| Region | Meme region que le projet Supabase (`eu-central-1`, UE) |
| Donnees traitees | JWT token (verification), user ID (suppression) |
| Donnees persistees | Aucune — traitement ephemere |

---

## Recapitulatif

| Service | Region | Donnees | Transfert hors UE |
|---|---|---|---|
| Supabase (BDD + Storage) | eu-central-1 (UE) | Observations, auth, photos, sons | Non |
| Supabase Edge Fn | eu-central-1 (UE) | JWT (ephemere) | Non |
| Vercel (CDN) | Global | Frontend public (aucune donnee perso) | Sans objet |
| iNaturalist | US | Termes de recherche (non personnel) | Lecture seule, pas de donnee perso |
| GBIF | UE/Global | Termes de recherche (non personnel) | Lecture seule, pas de donnee perso |
| Nominatim | UE/Global | Coordonnees GPS + IP | Geocodage inverse (interet legitime) |
| Open-Meteo | UE | Coordonnees GPS | Non |

---

## Notes

- Les donnees personnelles sont hebergees dans l'UE (Supabase `eu-central-1`) : pas de
  transfert hors UE pour le coeur de l'application.
- Les appels iNaturalist / GBIF / Nominatim sont en lecture seule (autocomplete, geocodage)
  et ne transmettent pas les observations de l'utilisateur.
- A reverifier si la region Supabase ou l'hebergeur frontend venait a changer.
