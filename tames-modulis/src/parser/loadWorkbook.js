import path from 'node:path';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';

function cellTextToString(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
    if (value instanceof Date) return value.toISOString();
    if ('result' in value) return cellTextToString(value.result);
    if ('text' in value) return String(value.text);
    return '';
  }
  return String(value);
}

async function loadXlsxSheets(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets.map((ws) => ({
    name: ws.name,
    getRows(maxRow) {
      const limit = maxRow ? Math.min(maxRow, ws.rowCount) : ws.rowCount;
      const colCount = ws.columnCount || 0;
      const rows = [];
      for (let r = 1; r <= limit; r++) {
        const row = ws.getRow(r);
        const cells = [];
        for (let c = 1; c <= colCount; c++) {
          cells.push(cellTextToString(row.getCell(c).value));
        }
        rows.push(cells);
      }
      return rows;
    },
  }));
}

// Legacy binary .xls (BIFF) — exceljs cannot read this container format at all
// (it only understands the OOXML/zip-based .xlsx layout), so real-world legacy
// files fall back to SheetJS `xlsx`, which parses BIFF natively in pure JS.
function loadLegacyXlsSheets(filePath) {
  const workbook = XLSX.readFile(filePath, { cellFormula: false });
  return workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const range = ws['!ref']
      ? XLSX.utils.decode_range(ws['!ref'])
      : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };
    return {
      name,
      getRows(maxRow) {
        const lastRow = maxRow ? Math.min(range.e.r, maxRow - 1) : range.e.r;
        const rows = [];
        for (let r = range.s.r; r <= lastRow; r++) {
          const cells = [];
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            cells.push(cell && cell.v != null ? String(cell.v) : '');
          }
          rows.push(cells);
        }
        return rows;
      },
    };
  });
}

// Uniform workbook loader: returns { sheets: [{ name, getRows(maxRow) }] }
// regardless of which underlying library actually read the file, so parser
// code (detectSheetType, detectHeaderRow, ...) never needs to know whether
// the source was .xlsx or legacy .xls.
export async function loadWorkbook(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xls') {
    return { sheets: loadLegacyXlsSheets(filePath) };
  }
  return { sheets: await loadXlsxSheets(filePath) };
}
