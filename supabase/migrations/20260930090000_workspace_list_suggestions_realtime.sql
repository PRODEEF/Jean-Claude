-- ═══════════════════════════════════════════════════════════════════════════
-- Temps réel des listes proposées dans un groupe
--
-- Jean-Claude poste son message, puis enregistre la proposition de liste : la
-- carte naît quelques millisecondes après le message. L'app relisait les
-- propositions à l'arrivée du message, avant qu'elle existe, et la carte
-- n'apparaissait qu'au rechargement. L'app écoute désormais aussi les
-- nouvelles propositions (Realtime applique la RLS de l'abonné).
--
-- Sans effet sur un Postgres nu (migration UE par `pg_dump`, §8), comme la
-- migration du temps réel des messages.
-- ═══════════════════════════════════════════════════════════════════════════

do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'workspace_list_suggestions'
     )
  then
    alter publication supabase_realtime add table public.workspace_list_suggestions;
  end if;
end;
$do$;
