export function colLettersToNumber(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

export function numberToColLetters(num) {
  let n = num;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const CELL_REF_RE = /^\$?([A-Z]{1,3})\$?(\d+)$/i;

export function parseCellAddress(address) {
  const m = CELL_REF_RE.exec(address);
  if (!m) throw new Error(`Nederīga šūnas adrese: ${address}`);
  return { col: colLettersToNumber(m[1]), row: parseInt(m[2], 10) };
}

export function formatCellAddress(col, row) {
  return `${numberToColLetters(col)}${row}`;
}

// Pārbīda VISAS relatīvās šūnu atsauces formulā par (colDelta, rowDelta) —
// standarta Excel "shared formula" izplatīšanas noteikums (velkot formulu uz
// citu šūnu, relatīvās atsauces pārbīdās, absolūtās ar $ nemainās).
const REF_TOKEN_RE = /(\$?)([A-Z]{1,3})(\$?)(\d+)/gi;

export function shiftFormulaReferences(formula, colDelta, rowDelta) {
  return formula.replace(REF_TOKEN_RE, (match, dollarCol, letters, dollarRow, digits) => {
    let col = colLettersToNumber(letters);
    let row = parseInt(digits, 10);
    if (!dollarCol) col += colDelta;
    if (!dollarRow) row += rowDelta;
    return `${dollarCol}${numberToColLetters(col)}${dollarRow}${row}`;
  });
}
