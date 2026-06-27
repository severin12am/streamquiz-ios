-- Migration v5 — server-side create quota (anti reinstall exploit)
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent guards).
--
-- Tracks quiz creation counts per RevenueCat app user ID (or device fallback).
-- Only the Next.js API (service role) reads/writes this table — not mobile clients.

create table if not exists public.creator_quota (
  quota_key text primary key,
  free_used integer not null default 0 check (free_used >= 0),
  monthly_used integer not null default 0 check (monthly_used >= 0),
  month_key text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists creator_quota_updated_at_idx
  on public.creator_quota (updated_at desc);

alter table public.creator_quota enable row level security;
-- No policies → anon/authenticated cannot access; service role bypasses RLS.

comment on table public.creator_quota is
  'Create-quiz usage counters keyed by RevenueCat app user ID (authoritative server-side quota).';
