alter table public.clients
  add column if not exists referrer_document text default '',
  add column if not exists referrer_name text default '',
  add column if not exists referral_reward_granted boolean default false,
  add column if not exists referral_credits_available integer default 0,
  add column if not exists referral_points integer default 0,
  add column if not exists successful_referral_count integer default 0;

update public.clients
set
  referrer_document = coalesce(referrer_document, ''),
  referrer_name = coalesce(referrer_name, ''),
  referral_reward_granted = coalesce(referral_reward_granted, false),
  referral_credits_available = coalesce(referral_credits_available, 0),
  referral_points = coalesce(referral_points, 0),
  successful_referral_count = coalesce(successful_referral_count, 0);
