-- ═══════════════════════════════════════════════════════════════════════════
-- Boîte mail reliée à Jean-Claude
--
-- Une seule boîte par personne pour l'instant (demande de Yann, 19 novembre :
-- « une seule boîte d'abord »), d'où `unique (user_id)`. Le mot de passe est
-- chiffré par l'API avant d'arriver ici (AES-256-GCM, clé `MAIL_ENCRYPTION_KEY`
-- gardée côté serveur) : la base ne contient jamais le mot de passe en clair,
-- et aucune réponse de l'API ne le renvoie.
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.mail_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  address             text        not null check (char_length(address) <= 200),
  host                text        not null check (char_length(host) <= 200),
  password_encrypted  text        not null,
  created_at          timestamptz not null default now(),

  constraint mail_accounts_one_per_user unique (user_id)
);

alter table public.mail_accounts enable row level security;

do $do$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'mail_accounts'
       and policyname = 'mail_accounts_owner'
  ) then
    create policy mail_accounts_owner on public.mail_accounts
      for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end;
$do$;
