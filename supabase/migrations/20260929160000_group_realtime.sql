-- ═══════════════════════════════════════════════════════════════════════════
-- Temps réel des discussions de groupe — lot 3 de docs/COLLABORATION.md
--
-- L'app s'abonne à Supabase Realtime pour deux choses, en lecture seulement :
--   • les nouveaux messages d'un groupe (`postgres_changes` sur `messages`) —
--     Realtime applique la RLS de l'abonné : un non-membre ne reçoit rien ;
--   • l'indicateur « en train d'écrire », sur un canal `broadcast` privé par
--     groupe (`group:<id>`) — rien n'est écrit en base.
-- Toute écriture en base reste l'affaire de l'API (invariant 3, exception
-- consignée dans docs/ARCHITECTURE.md).
--
-- Les deux blocs ne s'appliquent que si Supabase fournit la publication et le
-- schéma `realtime` : sur un Postgres nu (migration UE par `pg_dump`, §8), la
-- migration passe sans effet au lieu d'échouer.
-- ═══════════════════════════════════════════════════════════════════════════

do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     )
  then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$do$;

-- Canal privé d'un groupe : seuls ses membres y écoutent et y émettent. Le
-- sujet est validé avant la conversion en uuid — un sujet malformé serait
-- sinon une erreur de cast au lieu d'un simple refus. `case` et non `and` :
-- Postgres ne garantit pas l'ordre d'évaluation d'un `and`.
do $do$
begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$
      create policy group_channel_members on realtime.messages
        for all to authenticated
        using (
          case
            when realtime.topic() ~ '^group:[0-9a-f-]{36}$'
              then public.is_conversation_member(substr(realtime.topic(), 7)::uuid)
            else false
          end
        )
        with check (
          case
            when realtime.topic() ~ '^group:[0-9a-f-]{36}$'
              then public.is_conversation_member(substr(realtime.topic(), 7)::uuid)
            else false
          end
        )
    $policy$;
  end if;
end;
$do$;
