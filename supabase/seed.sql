-- ============================================================
-- Peptech Seed Data
-- Run in: Supabase Dashboard → SQL Editor
-- Runs as postgres (service role) — RLS is bypassed
--
-- Before running: confirm your auth.users UUID below matches
-- what's in Supabase Auth → Users for alanambrose1@gmail.com
-- ============================================================

DO $$
DECLARE
  -- ── Identity ────────────────────────────────────────────
  v_tenant_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_user_id    uuid := '838e0ef5-3065-405b-ade1-d18a96c54fda';  -- ← your auth.users id

  -- ── Customers ───────────────────────────────────────────
  v_c1  uuid := 'c1000000-0000-0000-0000-000000000000';  -- K. (gymrat_84)
  v_c2  uuid := 'c2000000-0000-0000-0000-000000000000';  -- swolepriest
  v_c3  uuid := 'c3000000-0000-0000-0000-000000000000';  -- Dani V.
  v_c4  uuid := 'c4000000-0000-0000-0000-000000000000';  -- J. (first time)
  v_c5  uuid := 'c5000000-0000-0000-0000-000000000000';  -- T.B.
  v_c6  uuid := 'c6000000-0000-0000-0000-000000000000';  -- rxqueen
  v_c7  uuid := 'c7000000-0000-0000-0000-000000000000';  -- marcus_r
  v_c8  uuid := 'c8000000-0000-0000-0000-000000000000';  -- anon_2k
  v_c9  uuid := 'c9000000-0000-0000-0000-000000000000';  -- cole_d

  -- ── Conversations ────────────────────────────────────────
  v_v1  uuid := 'v1000000-0000-0000-0000-000000000000';  -- gymrat_84  (wa, active)
  v_v2  uuid := 'v2000000-0000-0000-0000-000000000000';  -- swolepriest (tg, active)
  v_v3  uuid := 'v3000000-0000-0000-0000-000000000000';  -- Dani V.    (tg, active)
  v_v4  uuid := 'v4000000-0000-0000-0000-000000000000';  -- J.          (wa, new)
  v_v5  uuid := 'v5000000-0000-0000-0000-000000000000';  -- T.B.        (wa, in_progress)
  v_v6  uuid := 'v6000000-0000-0000-0000-000000000000';  -- rxqueen     (tg, needs_reply)
  v_v7  uuid := 'v7000000-0000-0000-0000-000000000000';  -- marcus_r    (tg, in_progress)
  v_v8  uuid := 'v8000000-0000-0000-0000-000000000000';  -- anon_2k     (wa, resolved)
  v_v9  uuid := 'v9000000-0000-0000-0000-000000000000';  -- cole_d      (email, snoozed)
  v_v10 uuid := 'v0000000-0000-0000-0000-000000000010';  -- gymrat_84   (wa, older resolved)

BEGIN

-- ════════════════════════════════════════════════════════════
-- 1. TENANT
-- ════════════════════════════════════════════════════════════
INSERT INTO public.tenants (id, name, slug, plan)
VALUES (v_tenant_id, 'Pep Tech', 'peptech', 'pro')
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 2. USER  (link your auth account to the tenant)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.users (id, tenant_id, role, display_name, email)
VALUES (v_user_id, v_tenant_id, 'owner', 'Alan', 'alanambrose1@gmail.com')
ON CONFLICT (id) DO UPDATE
  SET tenant_id    = EXCLUDED.tenant_id,
      display_name = EXCLUDED.display_name,
      role         = EXCLUDED.role;

-- ════════════════════════════════════════════════════════════
-- 3. TENANT CHANNELS  (mark WA + TG as active)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.tenant_channels (tenant_id, channel_type, identifier, is_active)
VALUES
  (v_tenant_id, 'whatsapp', '+15550000001', true),
  (v_tenant_id, 'telegram', '@peptechbot',  true)
ON CONFLICT (tenant_id, channel_type) DO UPDATE
  SET is_active = true;

-- ════════════════════════════════════════════════════════════
-- 4. CUSTOMERS
-- ════════════════════════════════════════════════════════════
INSERT INTO public.customers (id, tenant_id, display_name, trust_score, ltv, notes)
VALUES
  (v_c1, v_tenant_id, 'K. (gymrat_84)',  92, 2840.00, 'Prefers tues/thurs ship. Uses signal if WA goes down — handle @gymrat84'),
  (v_c2, v_tenant_id, 'swolepriest',     88, 1240.00, 'Stacks tirz + reta. Always pays USDT TRC20. Bulk buyer potential.'),
  (v_c3, v_tenant_id, 'Dani V.',         64,  480.00, 'Payment issues twice. Prefers BTC. Verify before shipping.'),
  (v_c4, v_tenant_id, 'J. (first time)', 30,    0.00, 'Referred by gymrat_84. First order pending. Needs onboarding.'),
  (v_c5, v_tenant_id, 'T.B.',            95, 3200.00, 'VIP. Never misses payment. Ships to same address every time.'),
  (v_c6, v_tenant_id, 'rxqueen',         81, 1680.00, 'Reorders GHK-Cu every 6 weeks like clockwork. Telegram only.'),
  (v_c7, v_tenant_id, 'marcus_r',        78,  920.00, 'Dosed 0.5mg last cycle. Happy with results. Likely to reorder.'),
  (v_c8, v_tenant_id, 'anon_2k',         45,  165.00, 'One-off purchase. Confirmed delivery 12+ confs XMR. No follow-up.'),
  (v_c9, v_tenant_id, 'cole_d',          72,  640.00, 'Email only. Slow to respond but always pays. Repeat x3.')
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 5. CUSTOMER CHANNELS
-- ════════════════════════════════════════════════════════════
INSERT INTO public.customer_channels (tenant_id, customer_id, channel_type, identifier, display_handle, is_primary)
VALUES
  (v_tenant_id, v_c1, 'whatsapp', '+14421234567',   '+1 ••• 4421',      true),
  (v_tenant_id, v_c2, 'telegram', '@swolepriest',   '@swolepriest',     true),
  (v_tenant_id, v_c3, 'telegram', '@danivee',       '@danivee',         true),
  (v_tenant_id, v_c4, 'whatsapp', '+17895551234',   '+1 ••• 1234',      true),
  (v_tenant_id, v_c5, 'whatsapp', '+16175559876',   '+1 ••• 9876',      true),
  (v_tenant_id, v_c6, 'telegram', '@rxqueen',       '@rxqueen',         true),
  (v_tenant_id, v_c7, 'telegram', '@marcus_r',      '@marcus_r',        true),
  (v_tenant_id, v_c8, 'whatsapp', '+12025558342',   '+1 ••• 8342',      true),
  (v_tenant_id, v_c9, 'email',    'cole@proton.me', 'cole@proton.me',   true)
ON CONFLICT (tenant_id, channel_type, identifier) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 6. CUSTOMER TAGS
-- ════════════════════════════════════════════════════════════
INSERT INTO public.customer_tags (tenant_id, customer_id, tag)
VALUES
  (v_tenant_id, v_c1, 'vip'),
  (v_tenant_id, v_c1, 'repeat'),
  (v_tenant_id, v_c2, 'waitlist'),
  (v_tenant_id, v_c2, 'repeat'),
  (v_tenant_id, v_c3, 'payment'),
  (v_tenant_id, v_c4, 'new'),
  (v_tenant_id, v_c5, 'vip'),
  (v_tenant_id, v_c5, 'shipping'),
  (v_tenant_id, v_c6, 'reorder'),
  (v_tenant_id, v_c6, 'repeat'),
  (v_tenant_id, v_c7, 'repeat'),
  (v_tenant_id, v_c9, 'repeat')
ON CONFLICT (customer_id, tag) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 7. CONVERSATIONS
-- ════════════════════════════════════════════════════════════
INSERT INTO public.conversations
  (id, tenant_id, customer_id, channel_type, channel_identifier, status, unread_count, last_message_at, last_message_snippet, assigned_to)
VALUES
  (v_v1,  v_tenant_id, v_c1, 'whatsapp', '+14421234567', 'needs_reply', 2,
    now() - interval '3 minutes',
    'yo 2 vials reta, same addy as last time. paid usdt',
    v_user_id),
  (v_v2,  v_tenant_id, v_c2, 'telegram', '@swolepriest', 'needs_reply', 3,
    now() - interval '41 minutes',
    'bro you got tirz back in stock yet? been waiting 2 wks',
    v_user_id),
  (v_v3,  v_tenant_id, v_c3, 'telegram', '@danivee',     'needs_reply', 1,
    now() - interval '22 minutes',
    'wire didn''t go through, can i pay BTC instead?',
    v_user_id),
  (v_v4,  v_tenant_id, v_c4, 'whatsapp', '+17895551234', 'new',         1,
    now() - interval '58 minutes',
    'hi, friend referred me. how does payment work?',
    NULL),
  (v_v5,  v_tenant_id, v_c5, 'whatsapp', '+16175559876', 'in_progress', 0,
    now() - interval '1 hour 12 minutes',
    'screenshots of tracking attached. usps says delivered',
    v_user_id),
  (v_v6,  v_tenant_id, v_c6, 'telegram', '@rxqueen',     'needs_reply', 1,
    now() - interval '2 hours',
    'running low on ghk, queue me up for next batch',
    v_user_id),
  (v_v7,  v_tenant_id, v_c7, 'telegram', '@marcus_r',    'in_progress', 0,
    now() - interval '14 minutes',
    'got the package fam. dosed 0.5mg this AM',
    v_user_id),
  (v_v8,  v_tenant_id, v_c8, 'whatsapp', '+12025558342', 'resolved',    0,
    now() - interval '3 days',
    'confirmed received. thanks',
    v_user_id),
  (v_v9,  v_tenant_id, v_c9, 'email',    'cole@proton.me','snoozed',    0,
    now() - interval '5 days',
    'will reorder next month, just remind me',
    v_user_id),
  (v_v10, v_tenant_id, v_c1, 'whatsapp', '+14421234567', 'resolved',    0,
    now() - interval '14 days',
    'delivered, all good 🤙',
    v_user_id)
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- 8. MESSAGES
-- ════════════════════════════════════════════════════════════

-- ── Conv v1: gymrat_84 — current order ──────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v1, 'inbound',
    'yo what''s the reta situation, still got 10mg vials?',
    now() - interval '2 days 4 hours', 'read'),
  (v_tenant_id, v_v1, 'outbound',
    'yeah we''re stocked. 10mg at $165/vial. same kit as before?',
    now() - interval '2 days 3 hours 50 minutes', 'read'),
  (v_tenant_id, v_v1, 'inbound',
    'yeah usdt works. drop the addy',
    now() - interval '2 days 3 hours 45 minutes', 'read'),
  (v_tenant_id, v_v1, 'outbound',
    'USDT TRC20: T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a — send $330 for 2 vials',
    now() - interval '2 days 3 hours 40 minutes', 'read'),
  (v_tenant_id, v_v1, 'inbound',
    'sent. txid 0xb39...e21',
    now() - interval '2 days 3 hours 30 minutes', 'read'),
  (v_tenant_id, v_v1, 'outbound',
    '2/3 confirmations, will ship once confirmed. lot L24-131, same ship addy as #A-2188?',
    now() - interval '2 days 3 hours 20 minutes', 'read'),
  (v_tenant_id, v_v1, 'inbound',
    'yo 2 vials reta, same addy as last time. paid usdt',
    now() - interval '3 minutes', 'delivered');

-- ── Conv v2: swolepriest — tirz waitlist ─────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v2, 'inbound',
    'any tirz 5mg back in stock? been on the list 2 weeks',
    now() - interval '14 days', 'read'),
  (v_tenant_id, v_v2, 'outbound',
    'still waiting on the batch, supplier pushed it back a week. you''re #3 on the list',
    now() - interval '14 days' + interval '30 minutes', 'read'),
  (v_tenant_id, v_v2, 'inbound',
    'ok cool. what about reta 10mg in the meantime?',
    now() - interval '7 days', 'read'),
  (v_tenant_id, v_v2, 'outbound',
    'reta 10mg is in stock. $165/vial. want 2?',
    now() - interval '7 days' + interval '15 minutes', 'read'),
  (v_tenant_id, v_v2, 'inbound',
    'nah i''ll wait for the tirz. just lmk when it''s in',
    now() - interval '7 days' + interval '45 minutes', 'read'),
  (v_tenant_id, v_v2, 'inbound',
    'bro you got tirz back in stock yet? been waiting 2 wks',
    now() - interval '41 minutes', 'delivered');

-- ── Conv v3: Dani V. — payment issue ─────────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v3, 'inbound',
    'hey i want to order BPC-5mg x3. how much?',
    now() - interval '2 hours 30 minutes', 'read'),
  (v_tenant_id, v_v3, 'outbound',
    'BPC 5mg x3 = $114. USDT TRC20 or BTC accepted',
    now() - interval '2 hours 15 minutes', 'read'),
  (v_tenant_id, v_v3, 'inbound',
    'tried to wire but bank blocked it. wire didn''t go through, can i pay BTC instead?',
    now() - interval '22 minutes', 'delivered');

-- ── Conv v4: J. — first time ─────────────────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v4, 'inbound',
    'hi, friend referred me. how does payment work? and what do you have for fat loss?',
    now() - interval '58 minutes', 'delivered');

-- ── Conv v5: T.B. — shipping issue ───────────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v5, 'inbound',
    'order shipped yet? been 4 days',
    now() - interval '3 days', 'read'),
  (v_tenant_id, v_v5, 'outbound',
    'shipped yesterday, USPS tracking: 9400111899223821234567',
    now() - interval '2 days 22 hours', 'read'),
  (v_tenant_id, v_v5, 'inbound',
    'tracking says delivered but nothing at the door',
    now() - interval '1 day 2 hours', 'read'),
  (v_tenant_id, v_v5, 'outbound',
    'sorry to hear that. give it 24h, sometimes usps scans early. check with neighbor?',
    now() - interval '1 day 1 hour', 'read'),
  (v_tenant_id, v_v5, 'inbound',
    'screenshots of tracking attached. usps says delivered but my neighbor said nothing came',
    now() - interval '1 hour 12 minutes', 'read');

-- ── Conv v6: rxqueen — reorder ───────────────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v6, 'inbound',
    'hey, need another round of GHK-Cu 50mg. same as last time',
    now() - interval '6 weeks', 'read'),
  (v_tenant_id, v_v6, 'outbound',
    'on it. $140 for 50mg. USDT TRC20 same address?',
    now() - interval '6 weeks' + interval '20 minutes', 'read'),
  (v_tenant_id, v_v6, 'inbound',
    'sent',
    now() - interval '6 weeks' + interval '1 hour', 'read'),
  (v_tenant_id, v_v6, 'inbound',
    'running low on ghk, queue me up for next batch',
    now() - interval '2 hours', 'delivered');

-- ── Conv v7: marcus_r — received ─────────────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v7, 'inbound',
    'yo order came in. packaging looks good',
    now() - interval '30 minutes', 'read'),
  (v_tenant_id, v_v7, 'outbound',
    'great! enjoy. lmk how the cycle goes',
    now() - interval '20 minutes', 'read'),
  (v_tenant_id, v_v7, 'inbound',
    'got the package fam. dosed 0.5mg this AM feeling good already lol',
    now() - interval '14 minutes', 'delivered');

-- ── Conv v8: anon_2k — resolved ───────────────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v8, 'inbound',
    'order?',
    now() - interval '4 days', 'read'),
  (v_tenant_id, v_v8, 'outbound',
    'what are you looking for?',
    now() - interval '4 days' + interval '10 minutes', 'read'),
  (v_tenant_id, v_v8, 'inbound',
    'reta 10mg x1. xmr',
    now() - interval '4 days' + interval '20 minutes', 'read'),
  (v_tenant_id, v_v8, 'outbound',
    '$165. XMR address: 48eHZ...9xK (send full amount)',
    now() - interval '4 days' + interval '25 minutes', 'read'),
  (v_tenant_id, v_v8, 'inbound',
    'sent',
    now() - interval '3 days 22 hours', 'read'),
  (v_tenant_id, v_v8, 'outbound',
    '12 confirmations, shipping now',
    now() - interval '3 days 20 hours', 'read'),
  (v_tenant_id, v_v8, 'inbound',
    'confirmed received. thanks',
    now() - interval '3 days', 'read');

-- ── Conv v9: cole_d — snoozed ────────────────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v9, 'inbound',
    'hey, looking to reorder the BPC stack. tight on cash this week though',
    now() - interval '6 days', 'read'),
  (v_tenant_id, v_v9, 'outbound',
    'no rush, let me know when ready. same address?',
    now() - interval '5 days 22 hours', 'read'),
  (v_tenant_id, v_v9, 'inbound',
    'will reorder next month, just remind me',
    now() - interval '5 days', 'read');

-- ── Conv v10: gymrat_84 — older resolved ─────────────────────
INSERT INTO public.messages (tenant_id, conversation_id, direction, content, sent_at, status)
VALUES
  (v_tenant_id, v_v10, 'inbound',
    '2 vials BPC 5mg please, same as last time',
    now() - interval '16 days', 'read'),
  (v_tenant_id, v_v10, 'outbound',
    '$114. USDT TRC20: T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a',
    now() - interval '16 days' + interval '5 minutes', 'read'),
  (v_tenant_id, v_v10, 'inbound',
    'paid',
    now() - interval '15 days 23 hours', 'read'),
  (v_tenant_id, v_v10, 'outbound',
    'confirmed, shipped. tracking: 9400111899223809876543',
    now() - interval '15 days', 'read'),
  (v_tenant_id, v_v10, 'inbound',
    'delivered, all good 🤙',
    now() - interval '14 days', 'read');

-- ════════════════════════════════════════════════════════════
-- 9. NOTES
-- ════════════════════════════════════════════════════════════
INSERT INTO public.notes (tenant_id, customer_id, content, created_by, created_at)
VALUES
  (v_tenant_id, v_c1, 'Prefers tues/thurs ship. Uses signal if WA goes down — handle @gymrat84',
    v_user_id, now() - interval '3 weeks'),
  (v_tenant_id, v_c1, 'Asked about tirz/reta stack. Sent dosing protocol v2.',
    v_user_id, now() - interval '2 months'),
  (v_tenant_id, v_c2, 'Waiting on tirz 5mg batch. #3 on waitlist. Offered reta, declined.',
    v_user_id, now() - interval '7 days'),
  (v_tenant_id, v_c3, 'Wire attempt failed — bank issue. Flagged for payment verification before next ship.',
    v_user_id, now() - interval '1 day'),
  (v_tenant_id, v_c5, 'VIP. Ships same address every time. Never disputes. Tip: send tracking same day.',
    v_user_id, now() - interval '1 month'),
  (v_tenant_id, v_c5, 'USPS delivery dispute — investigating. Likely neighborhood porch pirate situation.',
    v_user_id, now() - interval '1 day'),
  (v_tenant_id, v_c6, 'Reorders GHK-Cu every ~6 weeks. Set a reminder.',
    v_user_id, now() - interval '6 weeks'),
  (v_tenant_id, v_c9, 'Email-only, responds slowly. Ping reminder first week of each month.',
    v_user_id, now() - interval '2 months');

-- ════════════════════════════════════════════════════════════
-- 10. QUICK REPLIES
-- ════════════════════════════════════════════════════════════
INSERT INTO public.quick_replies (tenant_id, label, content, sort_order)
VALUES
  (v_tenant_id, 'send wallet addr',
    'USDT TRC20: T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a',
    1),
  (v_tenant_id, 'tracking uploaded',
    'Your tracking number has been uploaded. You''ll receive a USPS notification shortly. Typical transit is 2–3 business days.',
    2),
  (v_tenant_id, 'out of stock — eta?',
    'That compound is currently out of stock. We''re expecting the next batch within 7–10 days — want me to add you to the waitlist?',
    3),
  (v_tenant_id, 'first-time how-to',
    'Welcome! Here''s how it works: (1) tell me what you need + qty, (2) I''ll send a total + wallet address, (3) send payment, (4) we ship within 24h of confirmation. Any questions?',
    4),
  (v_tenant_id, 'dosing protocol',
    'Standard protocol: start at 0.25mg 2x/week for weeks 1–2, then 0.5mg 2x/week. Inject subq, rotate sites. Fast for 2h before. Lmk how it goes.',
    5),
  (v_tenant_id, 'discount: repeat 10%',
    'As a returning customer you get 10% off your next order. Just mention this when you''re ready to order.',
    6),
  (v_tenant_id, 'reorder reminder',
    'Hey, just checking in — running low yet? Happy to queue up your usual order.',
    7)
ON CONFLICT DO NOTHING;

END $$;

-- ════════════════════════════════════════════════════════════
-- Verify
-- ════════════════════════════════════════════════════════════
SELECT 'tenants'        AS tbl, count(*) FROM public.tenants        WHERE id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'users',          count(*) FROM public.users           WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'tenant_channels',count(*) FROM public.tenant_channels WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'customers',      count(*) FROM public.customers       WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'conversations',  count(*) FROM public.conversations   WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'messages',       count(*) FROM public.messages        WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'notes',          count(*) FROM public.notes           WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'quick_replies',  count(*) FROM public.quick_replies   WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
