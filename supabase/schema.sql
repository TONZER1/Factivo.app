-- Factivo : tables et règles d'accès.
-- À coller une seule fois dans Supabase : SQL Editor → New query → Run.
-- Chaque artisan ne voit et ne modifie que ses propres données.
-- Les documents (devis, factures, notes de crédit) ne peuvent pas être supprimés :
-- une facture se corrige par une note de crédit.

create table if not exists public.profils (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists clients_user_idx on public.clients(user_id);
create index if not exists documents_user_idx on public.documents(user_id);

alter table public.profils   enable row level security;
alter table public.clients   enable row level security;
alter table public.documents enable row level security;

drop policy if exists "profil: lire le sien" on public.profils;
drop policy if exists "profil: créer le sien" on public.profils;
drop policy if exists "profil: modifier le sien" on public.profils;
create policy "profil: lire le sien"     on public.profils for select using (user_id = auth.uid());
create policy "profil: créer le sien"    on public.profils for insert with check (user_id = auth.uid());
create policy "profil: modifier le sien" on public.profils for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "clients: lire les siens" on public.clients;
drop policy if exists "clients: créer les siens" on public.clients;
drop policy if exists "clients: modifier les siens" on public.clients;
create policy "clients: lire les siens"     on public.clients for select using (user_id = auth.uid());
create policy "clients: créer les siens"    on public.clients for insert with check (user_id = auth.uid());
create policy "clients: modifier les siens" on public.clients for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "documents: lire les siens" on public.documents;
drop policy if exists "documents: créer les siens" on public.documents;
drop policy if exists "documents: modifier les siens" on public.documents;
create policy "documents: lire les siens"     on public.documents for select using (user_id = auth.uid());
create policy "documents: créer les siens"    on public.documents for insert with check (user_id = auth.uid());
create policy "documents: modifier les siens" on public.documents for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Aucune règle "delete" : personne ne peut supprimer un document depuis l'appli.
