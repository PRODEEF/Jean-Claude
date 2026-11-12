-- ═══════════════════════════════════════════════════════════════════════════
-- Fusion rendez-vous et todo — étape 2 : les occurrences d'une série
--
-- Une liste qui se répète (`task_lists.rrule`) n'a pas une ligne par date : les
-- occurrences sont calculées à la volée. Ce qui arrive à UNE date — cochée,
-- déplacée, supprimée — se range ici, sans toucher à la série. C'est ce qui
-- permet de demander à chaque fois « seulement cette date ou toute la série »
-- (décision de Yann, 12 novembre) : « cette date » écrit une ligne ici,
-- « toute la série » modifie la liste elle-même.
--
--   · `occurrence_at` : début de l'occurrence tel que la série le calcule ;
--     c'est la clé, elle ne change jamais même si l'occurrence est déplacée ;
--   · `done_at`       : cochée à cette date seulement ;
--   · `moved_to`      : déplacée, nouveau début de cette date seulement ;
--   · `cancelled`     : supprimée à cette date seulement.
--
-- Rien ne lit encore cette table et rien ne change à l'écran. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.task_list_occurrences (
  list_id       uuid        not null references public.task_lists (id) on delete cascade,
  user_id       uuid        not null references auth.users (id) on delete cascade,
  occurrence_at timestamptz not null,
  done_at       timestamptz,
  moved_to      timestamptz,
  cancelled     boolean     not null default false,
  created_at    timestamptz not null default now(),
  primary key (list_id, occurrence_at)
);

create index if not exists task_list_occurrences_user_idx
  on public.task_list_occurrences (user_id);

alter table public.task_list_occurrences enable row level security;

do $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'task_list_occurrences'
       and policyname = 'task_list_occurrences_owner_access'
  ) then
    create policy task_list_occurrences_owner_access
      on public.task_list_occurrences for all
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end;
$do$;
