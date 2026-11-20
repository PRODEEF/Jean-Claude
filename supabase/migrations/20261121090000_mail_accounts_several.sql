-- ═══════════════════════════════════════════════════════════════════════════
-- Plusieurs boîtes mail par personne
--
-- Demande de Yann, 20 novembre : OVH aujourd'hui, Infomaniak à venir. La
-- contrainte « une boîte par personne » (`unique (user_id)`) est retirée ; une
-- même adresse ne peut en revanche être reliée qu'une fois par personne.
--
-- Idempotent. Aucune donnée existante n'est touchée : la boîte déjà reliée
-- reste telle quelle.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.mail_accounts
  drop constraint if exists mail_accounts_one_per_user;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'mail_accounts_user_address_unique'
       and conrelid = 'public.mail_accounts'::regclass
  ) then
    alter table public.mail_accounts
      add constraint mail_accounts_user_address_unique unique (user_id, address);
  end if;
end;
$do$;
