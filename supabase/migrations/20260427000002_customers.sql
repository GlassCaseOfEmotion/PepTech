create table public.customers (
  id           uuid          primary key default gen_random_uuid(),
  tenant_id    uuid          not null references public.tenants(id) on delete cascade,
  display_name text          not null,
  trust_score  int           not null default 50
                 check (trust_score between 0 and 100),
  ltv          numeric(10,2) not null default 0,
  notes        text,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now()
);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create table public.customer_channels (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  customer_id    uuid        not null references public.customers(id) on delete cascade,
  channel_type   text        not null
                   check (channel_type in ('whatsapp','telegram','email')),
  identifier     text        not null,
  display_handle text        not null,
  is_primary     bool        not null default false,
  created_at     timestamptz not null default now(),
  unique (tenant_id, channel_type, identifier)
);

create table public.customer_tags (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  customer_id uuid        not null references public.customers(id) on delete cascade,
  tag         text        not null,
  created_at  timestamptz not null default now(),
  unique (customer_id, tag)
);
