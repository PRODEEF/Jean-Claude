-- Le nom de l'espace doit rester lisible après un refus : l'historique des
-- invitations l'affiche encore. La lecture de la ligne `workspaces` n'ouvre
-- ni les membres ni les discussions, qui restent réservés aux membres.

drop policy workspaces_member_read on public.workspaces;

create policy workspaces_member_read on public.workspaces for select
  using (
    public.is_workspace_member(id)
    or exists (
      select 1
      from public.workspace_invitations
      where workspace_id = public.workspaces.id
        and email = lower((select auth.jwt()) ->> 'email')
    )
  );
