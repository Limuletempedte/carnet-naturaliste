# Purge des médias orphelins du bucket `photos`

Contexte (audit v2, constat C1) : jusqu'à la correction de l'edge function
`delete-account` (juin 2026), la suppression d'un compte ne supprimait **aucun**
média. Les photos/sons des comptes déjà supprimés sont donc restés dans le
bucket public, sans propriétaire. Procédure one-shot pour les retrouver et les
supprimer.

## 1. Identifier les orphelins (SQL Editor du dashboard Supabase)

```sql
-- Fichiers dont le dossier racine ne correspond plus à aucun utilisateur
select name, created_at,
       (storage.foldername(name))[1] as ancien_user_id
from storage.objects
where bucket_id = 'photos'
  and (storage.foldername(name))[1] not in (select id::text from auth.users)
order by name;
```

- Résultat vide → rien à faire, fermer ce ticket.
- Sinon, noter les `ancien_user_id` concernés.

## 2. Supprimer

**Option simple (peu de fichiers)** : dashboard Supabase → Storage → bucket
`photos` → ouvrir chaque dossier orphelin → tout sélectionner → Delete.
(Le dashboard passe par l'API Storage : suppression propre des objets.)

**Option SQL (beaucoup de fichiers)** : la suppression directe des lignes
`storage.objects` est possible mais ne nettoie pas toujours le stockage
sous-jacent selon la version de Supabase — préférer le dashboard ou un petit
script API avec la clé service_role (même logique `list` récursif + `remove`
que l'edge function corrigée).

## 3. Vérifier

Re-exécuter la requête de l'étape 1 : elle doit renvoyer 0 ligne.

> Rappel : tester aussi la correction de bout en bout — créer un compte de
> test avec 1 photo + 1 son, supprimer le compte depuis l'app, vérifier que
> le préfixe `<uid>/` a disparu du bucket.
