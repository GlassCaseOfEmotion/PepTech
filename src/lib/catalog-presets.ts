export type BusinessType = 'peptides' | 'nootropics' | 'sarms' | 'general'

export type PresetProtocol = {
  vial_strength: string       // e.g. '5mg/vial'
  reconstitution_ml: number   // e.g. 2.00
  draw_volume_ml: number      // e.g. 0.100
  frequency: string           // matches product_protocols.frequency enum
  timing?: string             // e.g. 'nightly', 'morning fasted'
  cycle_length_weeks: number
  notes?: string
  // Display-only (not stored in DB) — computed from vial_strength + draw_volume
  dose_display: string        // e.g. '250mcg', '2mg'
}

export type PresetProduct = {
  name: string
  sku: string
  product_family: string
  unit_price: number
  description: string | null
  protocol?: PresetProtocol
}

const PEPTIDES: PresetProduct[] = [
  // ── GLP-1 ── weight management / metabolic
  {
    name: 'Semaglutide 10mg', sku: 'SEMA-10', product_family: 'GLP-1', unit_price: 0,
    description: 'GLP-1 receptor agonist that suppresses appetite and slows gastric emptying; widely researched for metabolic health and weight management.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.05, frequency: 'weekly', timing: 'morning', cycle_length_weeks: 12, dose_display: '0.25mg' },
  },
  {
    name: 'Tirzepatide 30mg', sku: 'TIRZ-30', product_family: 'GLP-1', unit_price: 0,
    description: 'Dual GIP/GLP-1 receptor agonist with superior weight-loss outcomes in trials; reduces appetite and improves insulin sensitivity.',
    protocol: { vial_strength: '30mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.017, frequency: 'weekly', timing: 'morning', cycle_length_weeks: 12, dose_display: '2.5mg' },
  },
  {
    name: 'Retatrutide 10mg', sku: 'RETA-10', product_family: 'GLP-1', unit_price: 0,
    description: 'Triple GIP/GLP-1/glucagon receptor agonist showing exceptional fat-loss results in Phase 2 trials; next-generation metabolic peptide.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.1, frequency: 'weekly', timing: 'morning', cycle_length_weeks: 12, dose_display: '0.5mg' },
  },

  // ── HEALING ── recovery & repair
  {
    name: 'BPC-157 5mg', sku: 'BPC-157', product_family: 'HEALING', unit_price: 0,
    description: 'Body Protection Compound-157; accelerates soft tissue, tendon, and gut healing via angiogenesis and growth factor upregulation.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.1, frequency: 'once_daily', timing: 'morning', cycle_length_weeks: 10, dose_display: '250mcg' },
  },
  {
    name: 'TB-500 5mg', sku: 'TB-500', product_family: 'HEALING', unit_price: 0,
    description: 'Synthetic analog of Thymosin Beta-4; promotes tissue repair, reduces inflammation, and supports muscle and connective tissue recovery.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.8, frequency: '3x_weekly', timing: 'morning', cycle_length_weeks: 8, dose_display: '2mg', notes: 'Loading phase 4–6 weeks; reduce to weekly for maintenance.' },
  },
  {
    name: 'Thymosin Alpha-1 5mg', sku: 'TA1-5', product_family: 'HEALING', unit_price: 0,
    description: '28-amino-acid thymic peptide that modulates T-cell maturation and innate immune response; researched for immune dysfunction and oncology support.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.64, frequency: '3x_weekly', timing: 'morning', cycle_length_weeks: 6, dose_display: '1.6mg' },
  },
  {
    name: 'LL-37 5mg', sku: 'LL-37', product_family: 'HEALING', unit_price: 0,
    description: 'Human cathelicidin-derived antimicrobial peptide with broad-spectrum antibacterial, antiviral, and immunomodulatory activity; promotes wound healing.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.04, frequency: 'once_daily', timing: 'morning', cycle_length_weeks: 6, dose_display: '100mcg' },
  },

  // ── GH ── growth hormone secretagogues
  {
    name: 'CJC-1295 No DAC 5mg', sku: 'CJC-NODAC', product_family: 'GH', unit_price: 0,
    description: 'Modified GHRH analog (Mod GRF 1-29) without DAC; short-duration GH pulse, typically paired with a GHRP for synergistic GH secretion.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.04, frequency: 'once_daily', timing: 'nightly', cycle_length_weeks: 12, dose_display: '100mcg', notes: 'Stack with Ipamorelin or GHRP-2 for synergistic effect.' },
  },
  {
    name: 'CJC-1295 w/ DAC 2mg', sku: 'CJC-DAC', product_family: 'GH', unit_price: 0,
    description: 'Long-acting GHRH analog with Drug Affinity Complex extending half-life to ~8 days; provides sustained GH elevation with once-weekly dosing.',
    protocol: { vial_strength: '2mg/vial', reconstitution_ml: 2, draw_volume_ml: 1.0, frequency: 'weekly', timing: 'nightly', cycle_length_weeks: 12, dose_display: '1mg' },
  },
  {
    name: 'Ipamorelin 5mg', sku: 'IPA-5', product_family: 'GH', unit_price: 0,
    description: 'Selective GHRP that stimulates pulsatile GH release with minimal effect on cortisol or prolactin; used for body composition and recovery.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.04, frequency: 'once_daily', timing: 'nightly', cycle_length_weeks: 12, dose_display: '100mcg' },
  },
  {
    name: 'Sermorelin 5mg', sku: 'SERM-5', product_family: 'GH', unit_price: 0,
    description: 'Synthetic analog of endogenous GHRH (first 29 amino acids); stimulates pituitary to release natural GH pulses; used for anti-aging and hormone optimization.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.08, frequency: '5_on_2_off', timing: 'nightly', cycle_length_weeks: 12, dose_display: '200mcg' },
  },
  {
    name: 'GHRP-2 5mg', sku: 'GHRP2-5', product_family: 'GH', unit_price: 0,
    description: 'Second-generation growth hormone releasing peptide; stimulates strong GH pulses with moderate increases in cortisol and prolactin.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.04, frequency: 'once_daily', timing: 'nightly', cycle_length_weeks: 12, dose_display: '100mcg' },
  },
  {
    name: 'GHRP-6 5mg', sku: 'GHRP6-5', product_family: 'GH', unit_price: 0,
    description: 'First-generation hexapeptide GHRP; stimulates GH release and significantly increases appetite via ghrelin receptor activation; popular for bulking.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.04, frequency: 'once_daily', timing: 'nightly', cycle_length_weeks: 12, dose_display: '100mcg' },
  },
  {
    name: 'AOD-9604 5mg', sku: 'AOD-5', product_family: 'GH', unit_price: 0,
    description: 'C-terminal fragment of human growth hormone (hGH 176–191) that mimics GH\'s lipolytic effects without affecting IGF-1 or blood glucose.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.12, frequency: 'once_daily', timing: 'morning fasted', cycle_length_weeks: 10, dose_display: '300mcg' },
  },

  // ── COSMETIC ── skin, tanning & anti-aging
  {
    name: 'GHK-Cu 50mg', sku: 'GHK-CU', product_family: 'COSMETIC', unit_price: 0,
    description: 'Naturally occurring copper-binding tripeptide with potent anti-aging, wound healing, and anti-inflammatory properties; stimulates collagen synthesis.',
    protocol: { vial_strength: '50mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.04, frequency: '3x_weekly', timing: 'evening', cycle_length_weeks: 8, dose_display: '1mg' },
  },
  {
    name: 'Epithalon 10mg', sku: 'EPITH-10', product_family: 'COSMETIC', unit_price: 0,
    description: 'Synthetic tetrapeptide that activates telomerase to lengthen telomeres; researched for longevity, sleep improvement, and circadian rhythm restoration.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 1.0, frequency: 'once_daily', timing: 'evening', cycle_length_weeks: 2, dose_display: '5mg', notes: 'Run as a 10–20 day intensive cycle; repeat 2–3x per year.' },
  },
  {
    name: 'PT-141 10mg', sku: 'PT141-10', product_family: 'COSMETIC', unit_price: 0,
    description: 'Melanocortin receptor agonist (MC3R/MC4R) researched for sexual dysfunction in both males and females; acts centrally on hypothalamic pathways.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.2, frequency: '3x_weekly', timing: '45–60 min before activity', cycle_length_weeks: 4, dose_display: '1mg', notes: 'On-demand use only; allow 48h between doses.' },
  },
  {
    name: 'Melanotan II 10mg', sku: 'MT2-10', product_family: 'COSMETIC', unit_price: 0,
    description: 'Cyclic melanocortin analog that stimulates melanogenesis (tanning) and has pro-erectile effects; requires UV exposure for full pigmentation.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.05, frequency: 'once_daily', timing: 'evening', cycle_length_weeks: 6, dose_display: '250mcg', notes: 'Loading 3 weeks daily, then maintenance 2–3x weekly.' },
  },

  // ── NEURO ── cognitive & neuroprotective
  {
    name: 'Selank 10mg', sku: 'SELANK-10', product_family: 'NEURO', unit_price: 0,
    description: 'Synthetic heptapeptide anxiolytic derived from tuftsin; modulates GABAergic and serotonergic systems to reduce anxiety and improve cognitive performance.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.06, frequency: 'once_daily', timing: 'morning', cycle_length_weeks: 4, dose_display: '300mcg' },
  },
  {
    name: 'Semax 10mg', sku: 'SEMAX-10', product_family: 'NEURO', unit_price: 0,
    description: 'Synthetic ACTH(4-7)PGP analog that upregulates BDNF and NGF; studied for cognitive enhancement, neuroprotection, and CNS injury recovery.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.1, frequency: '5_on_2_off', timing: 'morning', cycle_length_weeks: 8, dose_display: '500mcg' },
  },
  {
    name: 'Dihexa 5mg', sku: 'DIHEXA-5', product_family: 'NEURO', unit_price: 0,
    description: 'Hepatocyte growth factor (HGF) potentiator derived from angiotensin IV; promotes synaptogenesis and neurotrophic signaling; studied for cognitive decline.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.8, frequency: '5_on_2_off', timing: 'morning', cycle_length_weeks: 8, dose_display: '2mg' },
  },
  {
    name: 'DSIP 5mg', sku: 'DSIP-5', product_family: 'NEURO', unit_price: 0,
    description: 'Delta Sleep-Inducing Peptide; endogenous nonapeptide that promotes slow-wave sleep, modulates stress responses, and normalizes cortisol rhythms.',
    protocol: { vial_strength: '5mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.04, frequency: '5_on_2_off', timing: 'evening', cycle_length_weeks: 4, dose_display: '100mcg' },
  },

  // ── MITO ── mitochondrial, longevity & endocrine
  {
    name: 'SS-31 10mg', sku: 'SS31-10', product_family: 'MITO', unit_price: 0,
    description: 'Mitochondria-targeted tetrapeptide (Elamipretide) that binds cardiolipin on the inner mitochondrial membrane, improving electron transport chain efficiency.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 1.0, frequency: 'once_daily', timing: 'morning', cycle_length_weeks: 10, dose_display: '5mg' },
  },
  {
    name: 'Humanin 10mg', sku: 'HMN-10', product_family: 'MITO', unit_price: 0,
    description: 'Mitochondrial-derived peptide (MDP) that exerts cytoprotective and anti-apoptotic effects; researched for neuroprotection, metabolic health, and longevity.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.1, frequency: 'weekly', timing: 'morning', cycle_length_weeks: 6, dose_display: '500mcg' },
  },
  {
    name: 'Kisspeptin-10 10mg', sku: 'KISS-10', product_family: 'MITO', unit_price: 0,
    description: 'Decapeptide that stimulates pulsatile GnRH release, triggering LH and FSH secretion; researched for HPG axis restoration and fertility support.',
    protocol: { vial_strength: '10mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.02, frequency: 'eod', timing: 'morning', cycle_length_weeks: 4, dose_display: '100mcg', notes: 'Avoid continuous daily use to prevent receptor desensitization.' },
  },
  {
    name: 'Gonadorelin 2mg', sku: 'GONA-2', product_family: 'MITO', unit_price: 0,
    description: 'Synthetic GnRH that stimulates pituitary LH and FSH release; used in TRT-adjunct protocols to maintain testicular function and fertility.',
    protocol: { vial_strength: '2mg/vial', reconstitution_ml: 2, draw_volume_ml: 0.1, frequency: '3x_weekly', timing: 'morning', cycle_length_weeks: 12, dose_display: '100mcg' },
  },
]

const NOOTROPICS: PresetProduct[] = [
  { name: "Lion's Mane Extract",  sku: 'NOO-LME',     product_family: 'Nootropics', unit_price: 0, description: null },
  { name: 'Aniracetam 750mg',     sku: 'NOO-ANI750',  product_family: 'Nootropics', unit_price: 0, description: null },
  { name: 'NAD+ 500mg',           sku: 'NOO-NAD500',  product_family: 'Nootropics', unit_price: 0, description: null },
  { name: 'Alpha GPC 300mg',      sku: 'NOO-AGPC300', product_family: 'Nootropics', unit_price: 0, description: null },
  { name: 'Modafinil 200mg',      sku: 'NOO-MOD200',  product_family: 'Nootropics', unit_price: 0, description: null },
  { name: 'Tongkat Ali Extract',  sku: 'NOO-TKA',     product_family: 'Nootropics', unit_price: 0, description: null },
  { name: 'Semax',                sku: 'NOO-SEMAX',   product_family: 'Nootropics', unit_price: 0, description: null },
  { name: 'Selank',               sku: 'NOO-SELANK',  product_family: 'Nootropics', unit_price: 0, description: null },
]

const SARMS: PresetProduct[] = [
  { name: 'Ostarine (MK-2866)',    sku: 'SARM-OST',    product_family: 'SARMs', unit_price: 0, description: null },
  { name: 'RAD-140 (Testolone)',   sku: 'SARM-RAD140', product_family: 'SARMs', unit_price: 0, description: null },
  { name: 'LGD-4033 (Ligandrol)',  sku: 'SARM-LGD',    product_family: 'SARMs', unit_price: 0, description: null },
  { name: 'Cardarine (GW-501516)', sku: 'SARM-GW',     product_family: 'SARMs', unit_price: 0, description: null },
  { name: 'Andarine (S4)',         sku: 'SARM-S4',     product_family: 'SARMs', unit_price: 0, description: null },
  { name: 'YK-11',                 sku: 'SARM-YK11',   product_family: 'SARMs', unit_price: 0, description: null },
  { name: 'MK-677 (Ibutamoren)',   sku: 'SARM-MK677',  product_family: 'SARMs', unit_price: 0, description: null },
]

const GENERAL: PresetProduct[] = [
  { name: 'Vitamin D3+K2',        sku: 'SUP-D3K2',   product_family: 'Supplements', unit_price: 0, description: null },
  { name: 'Omega-3 EPA/DHA',      sku: 'SUP-OMEG',   product_family: 'Supplements', unit_price: 0, description: null },
  { name: 'Magnesium Glycinate',  sku: 'SUP-MAG',    product_family: 'Supplements', unit_price: 0, description: null },
  { name: 'Zinc Picolinate',      sku: 'SUP-ZINC',   product_family: 'Supplements', unit_price: 0, description: null },
  { name: 'B-Complex',            sku: 'SUP-BCMPLX', product_family: 'Supplements', unit_price: 0, description: null },
  { name: 'Ashwagandha KSM-66',   sku: 'SUP-KSM66',  product_family: 'Supplements', unit_price: 0, description: null },
  { name: 'CoQ10',                sku: 'SUP-COQ10',  product_family: 'Supplements', unit_price: 0, description: null },
  { name: 'Berberine',            sku: 'SUP-BER',    product_family: 'Supplements', unit_price: 0, description: null },
]

export const CATALOG_PRESETS: Record<BusinessType, PresetProduct[]> = {
  peptides:   PEPTIDES,
  nootropics: NOOTROPICS,
  sarms:      SARMS,
  general:    GENERAL,
}
