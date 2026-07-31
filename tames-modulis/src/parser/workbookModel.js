import path from 'node:path';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import { parseCellAddress, formatCellAddress, shiftFormulaReferences } from './cellRef.js';
import { parseFormula, evaluateFormula } from './formulaEngine.js';

// Būvē "jēlo" šūnu modeli vienai darbgrāmatai: katra šūna ir VAI NU
// { formula: string } VAI { value: <literāls> } — bez paļaušanās uz
// exceljs/SheetJS jebkādu cache-otu formulas rezultātu (skat. PROGRESS.md
// Sesija 3 — exceljs pazaudē cached `<v>` daudzām formulām). "Shared formula"
// atkarīgās šūnas šeit uzreiz iztulkotas uz pilnu, patstāvīgu formulas
// virkni (skat. cellRef.js shiftFormulaReferences).
async function buildRawModelFromExcelJS(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheets = new Map();

  for (const ws of workbook.worksheets) {
    const cells = new Map();
    const anchorFormulas = new Map();
    let maxRow = 0;
    let maxCol = 0;

    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const address = cell.address;
        maxRow = Math.max(maxRow, cell.row);
        maxCol = Math.max(maxCol, cell.col);
        const v = cell.value;
        if (v != null && typeof v === 'object' && !(v instanceof Date)) {
          if ('formula' in v) {
            cells.set(address, { formula: v.formula });
            anchorFormulas.set(address, v.formula);
          } else if ('sharedFormula' in v) {
            cells.set(address, { sharedAnchor: v.sharedFormula });
          } else if (Array.isArray(v.richText)) {
            cells.set(address, { value: v.richText.map((p) => p.text).join('') });
          } else if ('text' in v) {
            cells.set(address, { value: v.text });
          } else {
            cells.set(address, { value: null });
          }
        } else {
          cells.set(address, { value: v });
        }
      });
    });

    for (const [address, descriptor] of cells) {
      if (!descriptor.sharedAnchor) continue;
      const anchorFormula = anchorFormulas.get(descriptor.sharedAnchor);
      if (anchorFormula == null) {
        cells.set(address, { value: null });
        continue;
      }
      const anchorAddr = parseCellAddress(descriptor.sharedAnchor);
      const depAddr = parseCellAddress(address);
      const translated = shiftFormulaReferences(
        anchorFormula,
        depAddr.col - anchorAddr.col,
        depAddr.row - anchorAddr.row,
      );
      cells.set(address, { formula: translated });
    }

    sheets.set(ws.name, { cells, maxRow, maxCol });
  }

  return sheets;
}

function buildRawModelFromSheetJS(filePath) {
  const workbook = XLSX.readFile(filePath, { cellFormula: true });
  const sheets = new Map();

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const cells = new Map();
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { e: { r: -1, c: -1 } };

    for (const addr in ws) {
      if (addr[0] === '!') continue;
      const cell = ws[addr];
      if (cell.f) cells.set(addr, { formula: cell.f });
      else cells.set(addr, { value: cell.v != null ? cell.v : null });
    }

    sheets.set(name, { cells, maxRow: range.e.r + 1, maxCol: range.e.c + 1 });
  }

  return sheets;
}

// Ielādē darbgrāmatu un atgriež pārrēķina piekļuves punktu: `getValue(sheet,
// address)` ATVASINA (nevis nolasa cache) katras formulas vērtību pēc
// pieprasījuma, ar memoizāciju un ciklisku atsauču noteikšanu. Balstās uz
// TIEŠI TĀDu pašu .xlsx/.xls izšķirtspēju kā `loadWorkbook.js`.
export async function loadRecalculatedWorkbook(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const sheets = ext === '.xls' ? buildRawModelFromSheetJS(filePath) : await buildRawModelFromExcelJS(filePath);

  const cache = new Map();
  const inProgress = new Set();

  function getRangeValues(sheetName, startAddr, endAddr) {
    const start = parseCellAddress(startAddr);
    const end = parseCellAddress(endAddr);
    const values = [];
    for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
      for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
        values.push(getCellValue(sheetName, formatCellAddress(c, r)));
      }
    }
    return values;
  }

  function getCellValue(sheetName, address) {
    const key = `${sheetName}!${address}`;
    if (cache.has(key)) return cache.get(key);

    const sheet = sheets.get(sheetName);
    if (!sheet) return null;
    const descriptor = sheet.cells.get(address);
    if (!descriptor) return null;

    if ('value' in descriptor) {
      cache.set(key, descriptor.value);
      return descriptor.value;
    }

    if (inProgress.has(key)) {
      throw new Error(`Cikliska formulu atsauce, iesaistīta šūna: ${key}`);
    }
    inProgress.add(key);
    try {
      const ast = parseFormula(descriptor.formula);
      const result = evaluateFormula(ast, { currentSheet: sheetName, getCellValue, getRangeValues });
      cache.set(key, result);
      return result;
    } finally {
      inProgress.delete(key);
    }
  }

  return {
    sheetNames: [...sheets.keys()],
    getValue: getCellValue,
    getSheetBounds(sheetName) {
      const sheet = sheets.get(sheetName);
      return sheet ? { maxRow: sheet.maxRow, maxCol: sheet.maxCol } : { maxRow: 0, maxCol: 0 };
    },
  };
}
