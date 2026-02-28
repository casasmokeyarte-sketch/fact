-- ============================================================================
-- Product visibility + stock state support
-- Run this in Supabase SQL Editor once
-- ============================================================================

alter table if exists public.products
  add column if not exists is_visible boolean not null default true;

-- Optional: normalize old rows
update public.products
set is_visible = true
where is_visible is null;

-- Optional helpful index for storefront queries
create index if not exists idx_products_is_visible on public.products(is_visible);

