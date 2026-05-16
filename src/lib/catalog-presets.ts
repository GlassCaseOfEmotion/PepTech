export type BusinessType = 'peptides' | 'nootropics' | 'sarms' | 'general'

export type PresetProduct = {
  name: string
  sku: string
  product_family: string
  unit_price: number
  description: string | null
}

const PEPTIDES: PresetProduct[] = [
  { name: 'BPC-157',                  sku: 'PEP-BPC157',  product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'TB-500',                   sku: 'PEP-TB500',   product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'Ipamorelin',               sku: 'PEP-IPA',     product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'CJC-1295 No DAC',          sku: 'PEP-CJC1295', product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'Semaglutide',              sku: 'PEP-SEMA',    product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'Sermorelin',               sku: 'PEP-SERM',    product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'GHRP-6',                   sku: 'PEP-GHRP6',   product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'Hexarelin',                sku: 'PEP-HEX',     product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'PT-141 (Bremelanotide)',   sku: 'PEP-PT141',   product_family: 'Peptides', unit_price: 0, description: null },
  { name: 'Tirzepatide',              sku: 'PEP-TIRZ',    product_family: 'Peptides', unit_price: 0, description: null },
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
