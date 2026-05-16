export type MockThread = {
  id: string
  name: string
  handle: string
  channel: 'wa' | 'tg' | 'em'
  snippet: string
  minsAgo: number
  unread: number
  status: string
  tags: string[]
  trust: number
  ltv: number
  lastOrder: string
  pinned?: boolean
}

export type MockPayment = {
  id: string
  who: string
  amt: number
  asset: string
  state: 'confirming' | 'pending' | 'confirmed'
  conf: number
  need: number
  txAge: string
}

export type MockProduct = {
  sku: string
  name: string
  stock: number
  lot: string
  price: number
  trend: number
}

export type MockReorder = {
  who: string
  product: string
  dueIn: string
  cycle: string
  conf: number
}

export type MockRevenueDay = { d: string; v: number }

export const MOCK_THREADS: MockThread[] = [
  { id: 't01', name: 'K. (gymrat_84)', handle: '+1 ••• 4421', channel: 'wa', snippet: 'yo 2 vials reta, same addy as last time. paid usdt', minsAgo: 3, unread: 2, status: 'needs_reply', tags: ['repeat', 'vip'], trust: 92, ltv: 2840, lastOrder: '11d', pinned: true },
  { id: 't02', name: 'marcus_r', handle: '@marcus_r', channel: 'tg', snippet: 'got the package fam. dosed 0.5mg this AM, no sides yet', minsAgo: 14, unread: 0, status: 'in_progress', tags: ['repeat'], trust: 78, ltv: 1120, lastOrder: '3d' },
  { id: 't03', name: 'Dani V.', handle: 'dani.v@proton.me', channel: 'em', snippet: "wire didn't go through, can i pay BTC instead?", minsAgo: 22, unread: 1, status: 'needs_reply', tags: ['payment'], trust: 64, ltv: 480, lastOrder: '—' },
  { id: 't04', name: 'swolepriest', handle: '@swolepriest', channel: 'tg', snippet: 'bro you got tirz back in stock yet? been waiting 2 wks', minsAgo: 41, unread: 3, status: 'needs_reply', tags: ['waitlist', 'repeat'], trust: 88, ltv: 3200, lastOrder: '22d' },
  { id: 't05', name: 'J. (first time)', handle: '+44 ••• 7732', channel: 'wa', snippet: 'hi, friend referred me. how does payment work? new to this', minsAgo: 58, unread: 1, status: 'new', tags: ['new', 'referred'], trust: 30, ltv: 0, lastOrder: '—' },
  { id: 't06', name: 'T.B.', handle: '@thebeast_22', channel: 'tg', snippet: 'screenshots of tracking attached. usps says delivered ✅', minsAgo: 92, unread: 0, status: 'delivered', tags: ['shipping'], trust: 95, ltv: 4400, lastOrder: '8d' },
  { id: 't07', name: 'rxqueen', handle: '@rxqueen', channel: 'tg', snippet: 'running low on ghk, queue me up for next batch pls', minsAgo: 130, unread: 0, status: 'snoozed', tags: ['reorder'], trust: 81, ltv: 1640, lastOrder: '29d' },
]

export const MOCK_PAYMENTS: MockPayment[] = [
  { id: 'p1', who: 'K. (gymrat_84)', amt: 330, asset: 'USDT', state: 'confirming', conf: 2, need: 3, txAge: '4m' },
  { id: 'p2', who: 'Dani V.', amt: 480, asset: 'BTC', state: 'pending', conf: 0, need: 2, txAge: '—' },
  { id: 'p3', who: 'anon_2k', amt: 165, asset: 'XMR', state: 'confirmed', conf: 12, need: 10, txAge: '1h' },
  { id: 'p4', who: 'T.B.', amt: 720, asset: 'USDT', state: 'confirmed', conf: 24, need: 3, txAge: '3h' },
  { id: 'p5', who: 'swolepriest', amt: 220, asset: 'BTC', state: 'confirming', conf: 1, need: 2, txAge: '11m' },
]

export const MOCK_PRODUCTS: MockProduct[] = [
  { sku: 'BPC-157', name: 'BPC-157 5mg', stock: 142, lot: 'L24-118', price: 38, trend: 12 },
  { sku: 'TB-500', name: 'TB-500 10mg', stock: 88, lot: 'L24-122', price: 72, trend: 4 },
  { sku: 'RETA-10', name: 'Retatrutide 10mg', stock: 24, lot: 'L24-131', price: 165, trend: 38 },
  { sku: 'TIRZ-30', name: 'Tirzepatide 30mg', stock: 9, lot: 'L24-127', price: 220, trend: 22 },
  { sku: 'GHK-CU', name: 'GHK-Cu 50mg', stock: 61, lot: 'L24-104', price: 55, trend: -2 },
  { sku: 'MOTS-C', name: 'MOTS-c 10mg', stock: 0, lot: '—', price: 95, trend: 0 },
  { sku: 'SEMA-10', name: 'Semaglutide 10mg', stock: 47, lot: 'L24-129', price: 130, trend: 9 },
  { sku: 'CJC-DAC', name: 'CJC-1295 w/ DAC', stock: 33, lot: 'L24-115', price: 48, trend: -1 },
]

export const MOCK_REORDERS: MockReorder[] = [
  { who: 'marcus_r', product: 'BPC-157 5mg', dueIn: 'now', cycle: 'wk 8/8', conf: 0.94 },
  { who: 'T.B.', product: 'Tirz 30mg', dueIn: '2 days', cycle: 'wk 4/12', conf: 0.86 },
  { who: 'rxqueen', product: 'GHK-Cu 50mg', dueIn: '4 days', cycle: 'wk 6/8', conf: 0.78 },
  { who: 'K. (gymrat)', product: 'Reta 10mg', dueIn: '6 days', cycle: 'wk 2/16', conf: 0.71 },
  { who: '@hyp3rion', product: 'Sema 10mg', dueIn: '9 days', cycle: 'wk 7/12', conf: 0.62 },
]

export const MOCK_REVENUE_7D: MockRevenueDay[] = [
  { d: 'Mon', v: 1240 }, { d: 'Tue', v: 980 }, { d: 'Wed', v: 1820 },
  { d: 'Thu', v: 1410 }, { d: 'Fri', v: 2240 }, { d: 'Sat', v: 2680 },
  { d: 'Sun', v: 1960 },
]

export type MockMessage = {
  id: string
  from: 'me' | 'them'
  at: string
  text?: string
  kind?: 'text' | 'wallet' | 'tx'
  optimistic?: boolean
}

export const MOCK_MESSAGES: Record<string, MockMessage[]> = {
  t01: [
    { id: 'm1', from: 'them', at: 'Apr 18 · 14:22', text: 'yo bro, what\'s the haps. need to re-up reta finally' },
    { id: 'm2', from: 'me',   at: 'Apr 18 · 14:24', text: 'ayy welcome back. how many vials u thinkin?' },
    { id: 'm3', from: 'them', at: 'Apr 18 · 14:25', text: '2 of the 10mg. same as last time. quality was insane btw' },
    { id: 'm4', from: 'me',   at: 'Apr 18 · 14:26', text: 'appreciate that 🙏 fresh batch lot L24-131, COA already up.\n2 vials = $330. usdt trc20?' },
    { id: 'm5', from: 'them', at: 'Apr 18 · 14:27', text: 'yeah usdt works. drop the addy' },
    { id: 'm6', from: 'me',   at: 'Apr 18 · 14:28', kind: 'wallet' },
    { id: 'm7', from: 'them', at: 'Today · 11:38',  text: 'yo 2 vials reta, same addy as last time. paid usdt' },
    { id: 'm8', from: 'them', at: 'Today · 11:39',  kind: 'tx' },
  ],
  t02: [
    { id: 'm1', from: 'them', at: 'Today · 09:10', text: 'got the package fam. dosed 0.5mg this AM, no sides yet' },
    { id: 'm2', from: 'me',   at: 'Today · 09:15', text: 'perfect. that\'s the sweet spot for first dose. log it and lmk after week 1' },
  ],
  t03: [
    { id: 'm1', from: 'them', at: 'Today · 10:40', text: 'wire didn\'t go through, can i pay BTC instead?' },
    { id: 'm2', from: 'me',   at: 'Today · 10:42', text: 'yep BTC works. sending addr now' },
  ],
  t04: [
    { id: 'm1', from: 'them', at: 'Today · 12:20', text: 'bro you got tirz back in stock yet? been waiting 2 wks' },
    { id: 'm2', from: 'me',   at: 'Today · 12:22', text: 'landing thurs, i\'ll put u at the top of the list' },
    { id: 'm3', from: 'them', at: 'Today · 12:23', text: 'bet, same qty as last time' },
  ],
}

export const MOCK_QUICK_REPLIES = [
  { id: 'addr',     label: 'send wallet addr',  text: 'USDT (TRC20): T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a\nBTC: bc1q...x4t9\nXMR addr on req. lmk when sent + tx hash 🙏' },
  { id: 'tracking', label: 'tracking uploaded', text: 'label printed, hits USPS today. tracking 9405 5036 9930 0000 7821 — i\'ll ping when scanned' },
  { id: 'oos',      label: 'out of stock — eta', text: 'tirz is dry til thurs. supplier confirmed restock 4/30. want me to queue u up?' },
  { id: 'first',    label: 'first-time how-to', text: 'first time? quick rundown:\n• payment: USDT/BTC/XMR\n• ship: USPS priority, 2-3d, discreet pkg\n• comms: keep it on tg/sig only\nany Qs holler' },
  { id: 'dosing',   label: 'dosing protocol',   text: 'standard protocol, not medical advice. typical research dose is 0.25mg sub-q daily, titrate up over 4 wks. cycle 8-12 wks.' },
  { id: 'discount', label: 'repeat-buyer 10%',  text: 'ur in the repeat tier, 10% off auto-applied. appreciate the loyalty fr' },
  { id: 'coa',      label: 'drop COA',           text: 'COA pdf incoming. lot L24-131, third-party HPLC at Janoshik. 99.2% purity' },
]
