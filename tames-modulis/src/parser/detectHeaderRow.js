import { matchIdentityField, matchSubfield } from './keywords.js';

const DETAIL_IDENTITY_FIELDS = new Set([
  'seqNo',
  'code',
  'description',
  'unit',
  'quantity',
  'quantityCurrent',
]);

function scoreRow(row, sheetType) {
  const fields = new Set();
  for (const rawCell of row) {
    const idField = matchIdentityField(rawCell);
    if (idField) {
      fields.add(idField);
      continue;
    }
    if (sheetType !== 'detail') {
      const subField = matchSubfield(rawCell);
      if (subField) fields.add(subField);
    }
  }
  if (sheetType === 'detail') {
    const valid =
      fields.has('description') &&
      (fields.has('unit') || fields.has('quantity') || fields.has('quantityCurrent'));
    return { count: fields.size, valid };
  }
  // master-summary / object-summary
  const valid = fields.has('description') && fields.size >= 2;
  return { count: fields.size, valid };
}

function rowHasNewSubfieldInfo(primaryRow, candidateRow) {
  const width = Math.max(primaryRow.length, candidateRow.length);
  for (let c = 0; c < width; c++) {
    const primaryText = primaryRow[c] || '';
    const candidateText = candidateRow[c] || '';
    const alreadyMapped = matchIdentityField(primaryText) || matchSubfield(primaryText);
    if (alreadyMapped) continue;
    if (matchSubfield(candidateText)) return true;
  }
  return false;
}

// Atrod galvenes rindu (var būt divas — grupas rinda + specifisko lauku
// rinda, skat. C8-2 paraugu) un piesaista kolonnu virsraksta vērtības
// kanoniskajiem lauku nosaukumiem no TAMES_MODULE_SPEC.md §2, izmantojot
// atslēgvārdu vārdnīcu + kolonnu secību (nevis fiksētas kolonnu pozīcijas).
//
// `rows` — masīvs no masīviem (teksta virknes), sākot ar lapas 1. rindu.
// `sheetType` — detectSheetType() rezultāts.
export function detectHeaderRow(rows, sheetType) {
  let bestIndex = -1;
  let bestCount = -1;
  for (let i = 0; i < rows.length; i++) {
    const { count, valid } = scoreRow(rows[i], sheetType);
    if (valid && count > bestCount) {
      bestCount = count;
      bestIndex = i;
    }
  }
  if (bestIndex === -1) return null;

  const primaryRow = rows[bestIndex];
  const candidateMergeIndex = bestIndex + 1;
  const mergeRow = rows[candidateMergeIndex];
  const merged = mergeRow ? rowHasNewSubfieldInfo(primaryRow, mergeRow) : false;
  const headerEndIndex = merged ? candidateMergeIndex : bestIndex;

  const colCount = Math.max(primaryRow.length, merged ? rows[headerEndIndex].length : 0);
  const columnMap = {};
  let phase = 'unit';

  for (let c = 0; c < colCount; c++) {
    const primaryText = primaryRow[c] || '';
    const mergeText = merged ? rows[headerEndIndex][c] || '' : '';

    const idField = matchIdentityField(primaryText) || (mergeText && matchIdentityField(mergeText));
    if (idField) {
      columnMap[c + 1] = idField;
      continue;
    }

    const subField = matchSubfield(primaryText) || (mergeText && matchSubfield(mergeText));
    if (!subField) continue;

    if (sheetType !== 'detail') {
      columnMap[c + 1] = subField;
      continue;
    }

    if (subField === 'totalCents') {
      if (phase === 'unit') {
        columnMap[c + 1] = 'unitCost.totalCents';
        phase = 'total';
      } else {
        columnMap[c + 1] = 'totalCost.totalCents';
      }
    } else if (subField === 'timeRate' || subField === 'wageRate') {
      columnMap[c + 1] = `unitCost.${subField}`;
    } else if (subField === 'laborHours') {
      columnMap[c + 1] = 'totalCost.laborHours';
    } else {
      columnMap[c + 1] = `${phase === 'unit' ? 'unitCost' : 'totalCost'}.${subField}`;
    }
  }

  return {
    headerRowIndex: bestIndex + 1,
    headerEndRowIndex: headerEndIndex + 1,
    dataStartRowIndex: headerEndIndex + 2,
    columnMap,
  };
}
