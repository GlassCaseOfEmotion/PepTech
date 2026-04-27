create table public.tenant_channels (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  channel_type   text        not null
                   check (channel_type in ('whatsapp','telegram','email')),
  identifier     text        not null,
  credentials    jsonb,
  webhook_secret text,
  is_active      bool        not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, channel_type)
);

create trigger tenant_channels_updated_at
  before update on public.tenant_channels
  for each row execute function public.set_updated_at();

create table public.conversations (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null references public.tenants(id) on delete cascade,
  customer_id          uuid        not null references public.customers(id) on delete cascade,
  channel_type         text        not null
                         check (channel_type in ('whatsapp','telegram','email')),
  channel_identifier   text        not null,
  status               text        not null default 'new'
                         check (status in ('new','needs_reply','in_progress','resolved','snoozed')),
  unread_count         int         not null default 0,
  last_message_at      timestamptz,
  last_message_snippet text,
  assigned_to          uuid        references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  conversation_id uuid        not null references public.conversations(id) on delete cascade,
  direction       text        not null check (direction in ('inbound','outbound')),
  content         text        not null,
  sent_at         timestamptz not null default now(),
  status          text        not null default 'sent'
                    check (status in ('sending','sent','delivered','read','failed')),
  external_id     text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create unique index messages_external_id_unique
  on public.messages (tenant_id, external_id)
  where external_id is not null;

create table public.notes (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  customer_id uuid        not null references public.customers(id) on delete cascade,
  content     text        not null,
  created_by  uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.quick_replies (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  label      text        not null,
  content    text        not null,
  sort_order int         not null default 0,
  created_at timestamptz not null default now()
);
