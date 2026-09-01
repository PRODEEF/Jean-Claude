-- ═══════════════════════════════════════════════════════════════════════════
-- Dossiers — porter la profondeur maximale de 2 à 5 niveaux
--
-- Le schéma initial bornait l'arborescence à 2 niveaux (§3 Phase A). La borne
-- passe à 5. Écart assumé par rapport au cahier des charges, consigné dans
-- `docs/SUIVI-BACKLOG.md`.
--
-- Deux niveaux interdisaient toute boucle, faute de place pour en former une.
-- À 5, un `update` de `parent_id` peut ranger un dossier sous l'un de ses
-- propres descendants : la remontée d'ancêtres tournerait alors indéfiniment.
-- Le nouveau trigger vérifie donc les deux choses — la profondeur et
-- l'acyclicité — parce que l'une ne garantit plus l'autre.
--
-- La valeur 5 est répétée dans `packages/domain/src/folder/folder.schema.ts`
-- (`MAX_FOLDER_DEPTH`). Duplication assumée : une fonction SQL ne peut pas
-- lire une constante TypeScript, et la base doit tenir quel que soit le chemin
-- d'écriture. Les deux se modifient ensemble.
-- ═══════════════════════════════════════════════════════════════════════════

drop trigger if exists folders_depth_guard on public.folders;

create or replace function public.enforce_folder_depth()
returns trigger
language plpgsql
as $fn$
declare
  ancestors integer;
  loops     boolean;
begin
  if new.parent_id is null then
    return new;
  end if;

  -- Remontée bornée à 5 pas : au-delà, la réponse est acquise quelle que soit
  -- la suite de la chaîne. La borne fait aussi office de filet contre une
  -- boucle préexistante, qui rendrait la remontée infinie.
  with recursive chain(id, parent_id, depth) as (
    select f.id, f.parent_id, 1
      from public.folders f
     where f.id = new.parent_id
    union all
    select f.id, f.parent_id, c.depth + 1
      from public.folders f
      join chain c on f.id = c.parent_id
     where c.depth < 5
  )
  select coalesce(max(depth), 0), coalesce(bool_or(id = new.id), false)
    into ancestors, loops
    from chain;

  if loops then
    raise exception
      'Un dossier ne peut pas être rangé sous lui-même ni sous l''un de ses sous-dossiers.';
  end if;

  -- `ancestors` compte les dossiers au-dessus du nouveau parent, lui compris.
  -- Le dossier écrit occupe le niveau suivant : il ne doit donc pas trouver
  -- déjà 5 dossiers au-dessus de lui.
  if ancestors >= 5 then
    raise exception 'Profondeur maximale atteinte : arborescence limitée à 5 niveaux.';
  end if;

  return new;
end;
$fn$;

create trigger folders_depth_guard
  before insert or update of parent_id on public.folders
  for each row execute function public.enforce_folder_depth();

-- Ce trigger ne voit que la ligne écrite. Déplacer un dossier qui porte
-- lui-même des sous-dossiers peut donc pousser ses descendants au-delà de la
-- borne sans qu'aucune de leurs lignes ne soit touchée. `FolderService.update`
-- vérifie ce cas — la hauteur de la branche déplacée — avant d'écrire.
