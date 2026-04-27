// inbox-data.jsx — message threads & quick replies for the Inbox view

const PT_MESSAGES = {
  t01: [
    { id: "m1", from: "them", at: "Apr 18 · 14:22", text: "yo bro, what's the haps. need to re-up reta finally" },
    { id: "m2", from: "me",   at: "Apr 18 · 14:24", text: "ayy welcome back. how many vials u thinkin?" },
    { id: "m3", from: "them", at: "Apr 18 · 14:25", text: "2 of the 10mg. same as last time. quality was insane btw" },
    { id: "m4", from: "me",   at: "Apr 18 · 14:26", text: "appreciate that 🙏 fresh batch lot L24-131, COA already up.\n2 vials = $330. usdt trc20?" },
    { id: "m5", from: "them", at: "Apr 18 · 14:27", text: "yeah usdt works. drop the addy" },
    { id: "m6", from: "me",   at: "Apr 18 · 14:28", text: "T9X...kQ4f", kind: "wallet" },
    { id: "m7", from: "them", at: "Today · 11:38", text: "yo 2 vials reta, same addy as last time. paid usdt" },
    { id: "m8", from: "them", at: "Today · 11:39", text: "0xb...e21 — sent ✅", kind: "tx" },
  ],
};

const PT_QUICK_REPLIES = [
  { id: "addr",     label: "send wallet addr",   tags: ["payment"] },
  { id: "tracking", label: "tracking uploaded",  tags: ["shipping"] },
  { id: "oos",      label: "out of stock — eta", tags: ["stock"] },
  { id: "first",    label: "first-time how-to",  tags: ["new"] },
  { id: "dosing",   label: "dosing protocol",    tags: ["info"] },
  { id: "discount", label: "repeat-buyer 10%",   tags: ["repeat"] },
  { id: "coa",      label: "drop COA",           tags: ["info"] },
  { id: "snooze",   label: "snooze 1d",          tags: [] },
];

const PT_QUICK_TEXT = {
  addr: "USDT (TRC20): T9XbnH4kQ4fM2pLrGv8WqRcXm6tPxJjN8a\nBTC: bc1q...x4t9\nXMR addr on req. lmk when sent + tx hash 🙏",
  tracking: "label printed, hits USPS today. tracking 9405 5036 9930 0000 7821 — i'll ping when scanned",
  oos: "tirz is dry til thurs. supplier confirmed restock 4/30. want me to queue u up?",
  first: "first time? quick rundown:\n• payment: USDT/BTC/XMR\n• ship: USPS priority, 2-3d, discreet pkg\n• comms: keep it on tg/sig only\nany Qs holler",
  dosing: "standard protocol, not medical advice. typical research dose is 0.25mg sub-q daily, titrate up over 4 wks. cycle 8-12 wks. log sides + take pics for ur records.",
  discount: "ur in the repeat tier, 10% off auto-applied. appreciate the loyalty fr",
  coa: "COA pdf incoming. lot L24-131, third-party HPLC at Janoshik. 99.2% purity",
  snooze: "",
};

Object.assign(window, { PT_MESSAGES, PT_QUICK_REPLIES, PT_QUICK_TEXT });
