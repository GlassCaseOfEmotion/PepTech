// data.jsx — mock state + helpers for Peptech dashboard

const PT_PRODUCTS = [
  { sku: "BPC-157",   name: "BPC-157 5mg",       stock: 142, lot: "L24-118", price: 38, trend: +12 },
  { sku: "TB-500",    name: "TB-500 10mg",       stock: 88,  lot: "L24-122", price: 72, trend: +4  },
  { sku: "RETA-10",   name: "Retatrutide 10mg",  stock: 24,  lot: "L24-131", price: 165, trend: +38 },
  { sku: "TIRZ-30",   name: "Tirzepatide 30mg",  stock: 9,   lot: "L24-127", price: 220, trend: +22 },
  { sku: "GHK-CU",    name: "GHK-Cu 50mg",       stock: 61,  lot: "L24-104", price: 55, trend: -2  },
  { sku: "MOTS-C",    name: "MOTS-c 10mg",       stock: 0,   lot: "—",       price: 95, trend: 0   },
  { sku: "SEMA-10",   name: "Semaglutide 10mg",  stock: 47,  lot: "L24-129", price: 130, trend: +9  },
  { sku: "CJC-DAC",   name: "CJC-1295 w/ DAC",   stock: 33,  lot: "L24-115", price: 48, trend: -1  },
];

const PT_THREADS = [
  {
    id: "t01", name: "K. (gymrat_84)", handle: "+1 ••• 4421", channel: "wa",
    snippet: "yo 2 vials reta, same addy as last time. paid usdt",
    minsAgo: 3, unread: 2, status: "needs_reply",
    tags: ["repeat", "vip"], trust: 92, ltv: 2840, lastOrder: "11d",
    pinned: true,
  },
  {
    id: "t02", name: "marcus_r", handle: "@marcus_r", channel: "tg",
    snippet: "got the package fam. dosed 0.5mg this AM, no sides yet",
    minsAgo: 14, unread: 0, status: "in_progress",
    tags: ["repeat"], trust: 78, ltv: 1120, lastOrder: "3d",
  },
  {
    id: "t03", name: "Dani V.", handle: "dani.v@proton.me", channel: "em",
    snippet: "wire didn't go through, can i pay BTC instead?",
    minsAgo: 22, unread: 1, status: "needs_reply",
    tags: ["payment"], trust: 64, ltv: 480, lastOrder: "—",
  },
  {
    id: "t04", name: "swolepriest", handle: "@swolepriest", channel: "tg",
    snippet: "bro you got tirz back in stock yet? been waiting 2 wks",
    minsAgo: 41, unread: 3, status: "needs_reply",
    tags: ["waitlist", "repeat"], trust: 88, ltv: 3200, lastOrder: "22d",
  },
  {
    id: "t05", name: "J. (first time)", handle: "+44 ••• 7732", channel: "wa",
    snippet: "hi, friend referred me. how does payment work? new to this",
    minsAgo: 58, unread: 1, status: "new",
    tags: ["new", "referred"], trust: 30, ltv: 0, lastOrder: "—",
  },
  {
    id: "t06", name: "T.B.", handle: "@thebeast_22", channel: "tg",
    snippet: "screenshots of tracking attached. usps says delivered ✅",
    minsAgo: 92, unread: 0, status: "delivered",
    tags: ["shipping"], trust: 95, ltv: 4400, lastOrder: "8d",
  },
  {
    id: "t07", name: "rxqueen", handle: "@rxqueen", channel: "tg",
    snippet: "running low on ghk, queue me up for next batch pls",
    minsAgo: 130, unread: 0, status: "snoozed",
    tags: ["reorder"], trust: 81, ltv: 1640, lastOrder: "29d",
  },
];

const PT_PAYMENTS = [
  { id: "p1", who: "K. (gymrat_84)",   amt: 330, asset: "USDT", state: "confirming",  conf: 2,  need: 3, txAge: "4m"  },
  { id: "p2", who: "Dani V.",          amt: 480, asset: "BTC",  state: "pending",     conf: 0,  need: 2, txAge: "—"   },
  { id: "p3", who: "anon_2k",          amt: 165, asset: "XMR",  state: "confirmed",   conf: 12, need: 10,txAge: "1h"  },
  { id: "p4", who: "T.B.",             amt: 720, asset: "USDT", state: "confirmed",   conf: 24, need: 3, txAge: "3h"  },
  { id: "p5", who: "swolepriest",      amt: 220, asset: "BTC",  state: "confirming",  conf: 1,  need: 2, txAge: "11m" },
];

const PT_REORDERS = [
  { who: "marcus_r",     product: "BPC-157 5mg",     dueIn: "now",     cycle: "wk 8/8",   conf: 0.94 },
  { who: "T.B.",         product: "Tirz 30mg",       dueIn: "2 days",  cycle: "wk 4/12",  conf: 0.86 },
  { who: "rxqueen",      product: "GHK-Cu 50mg",     dueIn: "4 days",  cycle: "wk 6/8",   conf: 0.78 },
  { who: "K. (gymrat)",  product: "Reta 10mg",       dueIn: "6 days",  cycle: "wk 2/16",  conf: 0.71 },
  { who: "@hyp3rion",    product: "Sema 10mg",       dueIn: "9 days",  cycle: "wk 7/12",  conf: 0.62 },
];

const PT_SHIPMENTS = [
  { id: "9405-..-7821", to: "K.",        carrier: "USPS",  status: "in_transit",  step: 3, of: 4, eta: "tomorrow" },
  { id: "1Z-..-A41",    to: "marcus_r",  carrier: "UPS",   status: "delivered",   step: 4, of: 4, eta: "today"    },
  { id: "9405-..-3320", to: "Dani V.",   carrier: "USPS",  status: "label_made",  step: 1, of: 4, eta: "—"        },
  { id: "EX-..-99",     to: "swolepriest", carrier: "DHL", status: "customs",    step: 2, of: 4, eta: "Apr 30"    },
];

const PT_REVENUE_7D = [
  { d: "Mon", v: 1240 }, { d: "Tue", v: 980  }, { d: "Wed", v: 1820 },
  { d: "Thu", v: 1410 }, { d: "Fri", v: 2240 }, { d: "Sat", v: 2680 },
  { d: "Sun", v: 1960 },
];

// hue -> oklch accent
const PT_ACCENTS = {
  acid:    { name: "Acid",    h: 130 },  // muted lime
  cobalt:  { name: "Cobalt",  h: 248 },
  ember:   { name: "Ember",   h: 32  },
  violet:  { name: "Violet",  h: 296 },
};

Object.assign(window, {
  PT_PRODUCTS, PT_THREADS, PT_PAYMENTS, PT_REORDERS,
  PT_SHIPMENTS, PT_REVENUE_7D, PT_ACCENTS,
});
