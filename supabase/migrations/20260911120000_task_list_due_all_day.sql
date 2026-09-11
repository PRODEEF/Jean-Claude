-- ═══════════════════════════════════════════════════════════════════════════
-- L'échéance d'une todoliste dit elle-même si elle vise un jour ou un créneau
--
-- La convention « minuit pile = dans la journée » était redérivée de `due_at`
-- à six endroits : `hasWallTime` côté serveur, et cinq lectures d'heure locale
-- côté application (`momentOf`, `timeOf`, `dueLabel`, `timeLabel`,
-- `layoutDayLists`). Or les deux côtés ne lisent pas la même horloge — le
-- serveur date dans le fuseau du profil, l'application dans celui de
-- l'appareil. Hors d'Europe/Paris, « samedi, sans heure » redevenait donc
-- « samedi à 2h du matin » à la traversée, et le créneau posé dans l'agenda
-- pour cette liste naissait à heure fixe au lieu de tenir la journée.
--
-- L'intention est désormais enregistrée au lieu d'être devinée. Nullable et
-- non `not null default true` : une liste sans échéance n'a rien à dire de son
-- moment, et la contrainte rend cette solidarité vérifiable.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.task_lists add column due_all_day boolean;

-- Reprise à l'identique de ce que le serveur déduisait : l'heure murale de
-- `due_at` dans le fuseau du profil, minuit valant « dans la journée ».
update public.task_lists as l
   set due_all_day = ((l.due_at at time zone coalesce(p.timezone, 'Europe/Paris'))::time = time '00:00')
  from public.profiles as p
 where p.id = l.user_id and l.due_at is not null;

-- Repli pour une liste dont le profil aurait disparu : le fuseau par défaut du
-- schéma partagé, celui que le serveur retenait déjà dans ce cas.
update public.task_lists
   set due_all_day = ((due_at at time zone 'Europe/Paris')::time = time '00:00')
 where due_at is not null and due_all_day is null;

alter table public.task_lists
  add constraint task_lists_due_all_day_pairing
  check ((due_at is null) = (due_all_day is null));
