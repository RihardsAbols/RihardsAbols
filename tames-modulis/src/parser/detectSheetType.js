import { SHEET_TYPE_PATTERNS } from './keywords.js';

const DESCRIPTION_HINT = /apraksts|description|nosaukum|name/i;
const UNIT_OR_QUANTITY_HINT = /mērvien|^unit$|daudzum|quantity/i;

// Klasificē vienu lapu kā 'master-summary' | 'object-summary' | 'detail' |
// 'unknown', pēc atslēgvārdiem pirmajās rindās — NEVIS pēc lapas nosaukuma,
// jo tas atšķiras starp projektiem (skat. TAMES_MODULE_SPEC.md §0/§6.3).
//
// `rows` — masīvs no masīviem (rindas x kolonnas), teksta virknes, parasti
// no `loadWorkbook(...).sheets[i].getRows(20-25)`.
export function detectSheetType(rows) {
  const flatText = rows.flat().join(' \n ');

  if (SHEET_TYPE_PATTERNS.masterSummary.test(flatText)) return 'master-summary';
  if (SHEET_TYPE_PATTERNS.objectSummary.test(flatText)) return 'object-summary';

  for (const row of rows) {
    let hasDescription = false;
    let hasUnitOrQuantity = false;
    for (const rawCell of row) {
      const cell = (rawCell || '').trim();
      if (!cell) continue;
      if (!hasDescription && DESCRIPTION_HINT.test(cell)) hasDescription = true;
      if (!hasUnitOrQuantity && UNIT_OR_QUANTITY_HINT.test(cell)) hasUnitOrQuantity = true;
    }
    if (hasDescription && hasUnitOrQuantity) return 'detail';
  }

  return 'unknown';
}
