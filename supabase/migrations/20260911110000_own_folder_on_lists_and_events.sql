-- ═══════════════════════════════════════════════════════════════════════════
-- Une todoliste et un rendez-vous ne se rangent que dans un dossier à soi
--
-- `conversation_folders` vérifie déjà la possession des deux côtés, « ce qui
-- interdit aussi de rattacher sa conversation au dossier d'un autre
-- utilisateur » (migration initiale). `task_lists` et `calendar_events`
-- portent pourtant un `folder_id` renseigné directement par le client
-- (`createTaskListSchema`, `createCalendarEventSchema`) sans que rien ne le
-- vérifie : leur policy ne regarde que `user_id`, et la contrainte de clé
-- étrangère, elle, s'applique hors RLS. Un appel forgé pouvait donc ranger sa
-- propre liste dans le dossier d'un tiers.
--
-- Le contenu du dossier reste hors de portée — la RLS de `folders` n'a pas
-- bougé — mais la donnée devenait incohérente, et l'existence d'un
-- identifiant de dossier, éprouvable.
--
-- Vérification en `with check` seulement, jamais en `using` : une ligne déjà
-- écrite avec un dossier étranger deviendrait invisible à son propre
-- propriétaire, donc impossible à corriger. Elle est plutôt détachée ci-dessous.
-- ═══════════════════════════════════════════════════════════════════════════

update public.task_lists as l
   set folder_id = null
  from public.folders as f
 where f.id = l.folder_id and f.user_id <> l.user_id;

update public.calendar_events as e
   set folder_id = null
  from public.folders as f
 where f.id = e.folder_id and f.user_id <> e.user_id;

drop policy "task_lists_owner_access" on public.task_lists;

create policy "task_lists_owner_access"
  on public.task_lists for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      folder_id is null
      or exists (
        select 1 from public.folders f
         where f.id = folder_id and f.user_id = (select auth.uid())
      )
    )
  );

drop policy "calendar_events_owner_access" on public.calendar_events;

create policy "calendar_events_owner_access"
  on public.calendar_events for all
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      folder_id is null
      or exists (
        select 1 from public.folders f
         where f.id = folder_id and f.user_id = (select auth.uid())
      )
    )
  );
