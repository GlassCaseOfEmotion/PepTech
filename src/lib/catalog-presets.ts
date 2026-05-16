export type BusinessType = 'peptides' | 'nootropics' | 'sarms' | 'general'

export type PresetProduct = {
  name: string
  sku: string
  product_family: string
  unit_price: number
  description: string | null
}

const PEPTIDES: PresetProduct[] = [
  // GLP-1 — weight management / metabolic
  { name: 'Semaglutide 10mg',   sku: 'SEMA-10',   product_family: 'GLP-1',   unit_price: 0, description: null },
  { name: 'Tirzepatide 30mg',   sku: 'TIRZ-30',   product_family: 'GLP-1',   unit_price: 0, description: null },
  { name: 'Retatrutide 10mg',   sku: 'RETA-10',   product_family: 'GLP-1',   unit_price: 0, description: null },
  // HEALING — recovery & repair
  { name: 'BPC-157 5mg',        sku: 'BPC-157',   product_family: 'HEALING', unit_price: 0, description: null },
  { name: 'TB-500 10mg',        sku: 'TB-500',    product_family: 'HEALING', unit_price: 0, description: null },
  { name: 'Thymosin Alpha-1',   sku: 'TA1-5',     product_family: 'HEALING', unit_price: 0, description: null },
  // GH — growth hormone secretagogues
  { name: 'CJC-1295 w/ DAC',    sku: 'CJC-DAC',   product_family: 'GH',      unit_price: 0, description: null },
  { name: 'Ipamorelin 5mg',     sku: 'IPA-5',     product_family: 'GH',      unit_price: 0, description: null },
  { name: 'GHRP-6 5mg',         sku: 'GHRP6-5',   product_family: 'GH',      unit_price: 0, description: null },
  // COSMETIC — skin & anti-aging
  { name: 'GHK-Cu 500mcg',      sku: 'GHK-CU',    product_family: 'COSMETIC', unit_price: 0, description: null },
  { name: 'Epithalon 10mg',     sku: 'EPITH-10',  product_family: 'COSMETIC', unit_price: 0, description: null },
  { name: 'PT-141 10mg',        sku: 'PT141-10',  product_family: 'COSMETIC', unit_price: 0, description: null },
  // MITO — mitochondrial & longevity
  { name: 'MOTS-c 10mg',        sku: 'MOTS-C',    product_family: 'MITO',    unit_price: 0, description: null },
  { name: 'Humanin 1mg',        sku: 'HMN-1',     product_family: 'MITO',    unit_price: 0, description: null },
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
