-- =====================================================================
-- StayNdiscover — Migration 5 : inscriptions à la newsletter (page d'accueil)
-- Un visiteur peut s'inscrire sans compte ; seul l'admin lit la liste.
-- =====================================================================
create table public.newsletter_subscribers (
  email       text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  lang        text not null default 'fr' check (lang in ('fr','en','es')),
  created_at  timestamptz not null default now()
);
alter table public.newsletter_subscribers enable row level security;
create policy newsletter_insert on public.newsletter_subscribers for insert with check (true);
create policy newsletter_admin  on public.newsletter_subscribers for select using (public.is_admin());
create policy newsletter_admin_del on public.newsletter_subscribers for delete using (public.is_admin());
grant insert on public.newsletter_subscribers to anon, authenticated;
grant select, delete on public.newsletter_subscribers to authenticated;
