import { loadWorkbook } from './loadWorkbook.js';
import { loadRecalculatedWorkbook } from './workbookModel.js';
import { detectSheetType } from './detectSheetType.js';
import { detectHeaderRow } from './detectHeaderRow.js';
import { formatCellAddress } from './cellRef.js';

const HEADER_SCAN_ROWS = 25;
const HEADER_WINDOW_ROWS = 40;

function isBlank(value) {
  return value == null || value === '';
}

function setPath(obj, fieldPath, value) {
  const parts = fieldPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]]) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function buildRowRecord(columnMap, sheetName, row, recalculated) {
  const record = {};
  for (const [colStr, fieldPath] of Object.entries(columnMap)) {
    const address = formatCellAddress(Number(colStr), row);
    setPath(record, fieldPath, recalculated.getValue(sheetName, address));
  }
  return record;
}

// Ekstrahē vienas DETAIL lapas rindas TAMES_MODULE_SPEC.md §2 kanoniskajā
// "BOQ rinda" modelī — no galvenes rindas līdz kopsummas (lapas pēdējai)
// rindai. Formulu vērtības PĀRRĒĶINĀTAS Node kodā (workbookModel.js), nevis
// paļaujoties uz exceljs/Excel cache-otu rezultātu (skat. CLAUDE.md — exceljs
// pazaudē cached `<v>` daudzām formulām).
//
// Rindas, kurām nav ne "quantity", ne "quantityCurrent" vērtības (un kuras
// nav lapas pēdējā rinda), tiek uzskatītas par sadaļas virsrakstu/piezīmes
// rindām nevis BOQ pozīcijām un netiek iekļautas `lineItems` sarakstā.
//
// `options.workbook`/`options.recalculated` ļauj atkārtoti izmantot jau
// ielādētu darbgrāmatu (skat. `extractAllDetailSheets`) — pretējā gadījumā
// katrs izsaukums no jauna parsētu VISU failu, kas ~70 lapu darbgrāmatai ir
// dārgi.
export async function extractSheetLineItems(filePath, sheetName, options = {}) {
  const { sheets } = options.workbook ?? (await loadWorkbook(filePath));
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`Lapa nav atrasta: ${sheetName}`);

  const sheetType = detectSheetType(sheet.getRows(HEADER_SCAN_ROWS));
  const header = detectHeaderRow(sheet.getRows(HEADER_WINDOW_ROWS), sheetType);
  if (!header) throw new Error(`Galvenes rinda nav atrasta lapā: ${sheetName}`);

  const recalculated = options.recalculated ?? (await loadRecalculatedWorkbook(filePath));
  const { maxRow } = recalculated.getSheetBounds(sheetName);

  const lineItems = [];
  let subtotals = null;
  let nextId = 1;

  for (let row = header.dataStartRowIndex; row <= maxRow; row++) {
    const record = buildRowRecord(header.columnMap, sheetName, row, recalculated);
    const hasQuantity = !isBlank(record.quantity) || !isBlank(record.quantityCurrent);
    // Šis tāmju veidnes ģimenes fails bieži liek vēl vienu "kolonnu indeksu"
    // rindu tieši aiz galvenes (piem. 1,2,3,4,5... katrā kolonnā) — nevis
    // reālu pozīciju. Reālai pozīcijai apraksts vienmēr ir teksts, ne kails
    // skaitlis, tāpēc šī pazīme droši atšķir abus gadījumus.
    const hasTextDescription = typeof record.description === 'string' && record.description.trim() !== '';

    if (row === maxRow) {
      subtotals = {
        laborHours: record.totalCost?.laborHours ?? null,
        salaryCents: record.totalCost?.salaryCents ?? null,
        materialsCents: record.totalCost?.materialsCents ?? null,
        mechanismsCents: record.totalCost?.mechanismsCents ?? null,
        totalCents: record.totalCost?.totalCents ?? null,
      };
      continue;
    }

    if (!hasQuantity || !hasTextDescription) continue;

    lineItems.push({
      id: nextId++,
      code: record.code ?? null,
      seqNo: record.seqNo ?? null,
      descriptionRaw: record.description ?? '',
      unit: record.unit ?? null,
      quantityBase: record.quantity ?? null,
      quantityCurrent: !isBlank(record.quantityCurrent) ? record.quantityCurrent : (record.quantity ?? null),
      unitCost: {
        timeRate: record.unitCost?.timeRate ?? null,
        wageRate: record.unitCost?.wageRate ?? null,
        salaryCents: record.unitCost?.salaryCents ?? null,
        materialsCents: record.unitCost?.materialsCents ?? null,
        mechanismsCents: record.unitCost?.mechanismsCents ?? null,
        totalCents: record.unitCost?.totalCents ?? null,
      },
      totalCost: {
        laborHours: record.totalCost?.laborHours ?? null,
        salaryCents: record.totalCost?.salaryCents ?? null,
        materialsCents: record.totalCost?.materialsCents ?? null,
        mechanismsCents: record.totalCost?.mechanismsCents ?? null,
        totalCents: record.totalCost?.totalCents ?? null,
      },
      sectionRef: sheetName,
      costEstimateRef: null,
      changeStatus: 'unchanged',
      voHistory: [],
    });
  }

  return { sheetName, sheetType, headerRowIndex: header.headerRowIndex, lineItems, subtotals };
}

// Ērtības funkcija: ielādē darbgrāmatu VIENU reizi un ekstrahē visas DETAIL
// tipa lapas, atkārtoti izmantojot to pašu ielādi (skat. augstāk).
export async function extractAllDetailSheets(filePath) {
  const workbook = await loadWorkbook(filePath);
  const recalculated = await loadRecalculatedWorkbook(filePath);
  const results = [];
  for (const sheet of workbook.sheets) {
    const sheetType = detectSheetType(sheet.getRows(HEADER_SCAN_ROWS));
    if (sheetType !== 'detail') continue;
    results.push(await extractSheetLineItems(filePath, sheet.name, { workbook, recalculated }));
  }
  return results;
}
