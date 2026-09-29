-- Same private BOS membership boundary as the existing revenue/expense/balance evidence.
create table public.bos_domain_snapshots (
 id uuid primary key default gen_random_uuid(),
 company text not null check (company = 'P&T'),
 month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 card_id text not null check (card_id ~ '^[a-zA-Z][a-zA-Z0-9]{0,47}$'),
 title text not null, source_code text not null, kind text not null,
 basis text not null, value_numeric numeric, value_status text not null, decision_use text not null,
 production_accepted boolean not null default false check (production_accepted = false),
 freshness_status text not null, data_as_of date not null, source_read_at timestamptz not null,
 operational_unknown_rows integer not null check (operational_unknown_rows >= 0),
 valuation_unknown_rows integer not null check (valuation_unknown_rows >= 0),
 content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
 summary jsonb not null check (jsonb_typeof(summary) = 'object'),
 rows jsonb not null check (jsonb_typeof(rows) = 'array'),
 imported_at timestamptz not null default now(), retired_at timestamptz,
 unique(company,month,card_id,content_hash),
 check (jsonb_array_length(rows) = (summary->>'rows')::integer)
);
create index bos_domain_latest_idx on public.bos_domain_snapshots(company,month,card_id,source_read_at desc,imported_at desc);
alter table public.bos_domain_snapshots enable row level security;
revoke all on public.bos_domain_snapshots from public,anon,authenticated;
grant select on public.bos_domain_snapshots to authenticated;
create policy bos_domain_authorized_read on public.bos_domain_snapshots for select to authenticated using (
 coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false
 and exists(select 1 from public.bos_access a where a.user_id=(select auth.uid()) and a.active=true)
);
create view public.bos_domain_cards with (security_invoker=true) as
 select distinct on (company,month,card_id)
 id as domain_snapshot_id,id::text as generation,company,month,card_id,title,source_code,kind,basis,
 value_numeric,value_status,decision_use,production_accepted,freshness_status,data_as_of,source_read_at,
 operational_unknown_rows,valuation_unknown_rows,content_hash,summary
 from public.bos_domain_snapshots where retired_at is null
 order by company,month,card_id,source_read_at desc,imported_at desc,id desc;
revoke all on public.bos_domain_cards from public,anon,authenticated;
grant select on public.bos_domain_cards to authenticated;
