# Documentation des regions d'hebergement de l'infrastructure

**Date de mise a jour** : 2026-09-30

---

## Vue d'ensemble

L'application Carnet Naturaliste s'appuie sur des services cloud pour l'authentification,
le stockage des donnees et la distribution du frontend. Ce document recense les regions
d'hebergement et les implications RGPD.

**Synthese : les donnees personnelles (compte, observations, photos, sons) sont hebergees
dans l'Union europeenne (Supabase, region `eu-central-1` / Francfort). Cela ne couvre pas les traitements tiers : Turnstile traite des signaux techniques
sur une infrastructure mondiale ; les sauvegardes techniques sont décrites dans le registre.**

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

## 4. Cloudflare Turnstile (anti-robots)

Le widget est chargé sur les formulaires d'authentification. Cloudflare reçoit notamment
l'IP et des signaux du navigateur et de connexion. Son infrastructure est mondiale :
aucune garantie de traitement exclusivement dans l'UE n'est présentée ici.
Le widget ne reçoit pas les observations ni les mots de passe de l'application.
Voir la [politique Turnstile](https://www.cloudflare.com/turnstile-privacy-policy/) et
le traitement 8 du [registre](registre-traitements.md). La durée de validité du jeton
(5 minutes) ne constitue pas une durée de conservation garantie des données Cloudflare.

## Recapitulatif

| Service | Region | Donnees | Transfert hors UE |
|---|---|---|---|
| Cloudflare Turnstile | Mondial | IP et signaux techniques anti-robots | Possible |
| Supabase (BDD + Storage) | eu-central-1 (UE) | Observations, auth, photos, sons | Non |
| Supabase Edge Fn | eu-central-1 (UE) | JWT (ephemere) | Non |
| Vercel (CDN) | Global | Frontend public (aucune donnee perso) | Sans objet |
| iNaturalist | US | Termes de recherche (non personnel) | Lecture seule, pas de donnee perso |
| GBIF | UE/Global | Termes de recherche (non personnel) | Lecture seule, pas de donnee perso |
| Nominatim | UE/Global | Coordonnees GPS + IP | Geocodage inverse (interet legitime) |
| Open-Meteo | UE | Coordonnees GPS | Non |

---

## Notes

- Les donnees personnelles sont hebergees dans l'UE (Supabase `eu-central-1`) : les traitements Cloudflare et les sauvegardes techniques
  suivent les conditions distinctes décrites dans le registre.
- Les appels iNaturalist / GBIF / Nominatim sont en lecture seule (autocomplete, geocodage)
  et ne transmettent pas les observations de l'utilisateur.
- A reverifier si la region Supabase ou l'hebergeur frontend venait a changer.
