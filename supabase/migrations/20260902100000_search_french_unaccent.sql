-- ═══════════════════════════════════════════════════════════════════════════
-- Recherche plein texte insensible aux accents (A.6)
--
-- La configuration `french` livrée par Postgres lemmatise mais ne retire pas
-- les accents : « sante » ne trouve pas « santé ». En français, c'est la
-- moitié des recherches qui échouent — l'utilisateur tape rarement les accents
-- dans un champ de recherche.
--
-- `unaccent` ne peut pas être appelé directement dans une expression d'index :
-- la fonction n'est pas marquée IMMUTABLE. On passe donc par une configuration
-- de recherche qui l'enchaîne au lemmatiseur ; `to_tsvector(regconfig, text)`
-- reste alors immuable, donc indexable.
--
-- La configuration est créée dans `public` : c'est le seul schéma que PostgREST
-- a dans son search_path, sans quoi les requêtes de l'API ne la résoudraient pas.
-- ═══════════════════════════════════════════════════════════════════════════

create text search configuration public.french_unaccent (copy = french);

alter text search configuration public.french_unaccent
  alter mapping for hword, hword_part, word
  with unaccent, french_stem;

-- Les index posés par la migration initiale portent sur `french` : ils ne
-- peuvent plus servir la nouvelle configuration et sont remplacés.
drop index if exists public.messages_content_fts_idx;
drop index if exists public.conversations_title_fts_idx;

create index messages_content_fts_idx
  on public.messages using gin (to_tsvector('public.french_unaccent', content));

create index conversations_title_fts_idx
  on public.conversations using gin (to_tsvector('public.french_unaccent', title));
