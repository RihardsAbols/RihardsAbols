import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkbook } from '../src/parser/loadWorkbook.js';
import { detectSheetType } from '../src/parser/detectSheetType.js';
import { detectHeaderRow } from '../src/parser/detectHeaderRow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

const HEADER_SCAN_ROWS = 25;

async function classifyAll(filePath) {
  const { sheets } = await loadWorkbook(filePath);
  return sheets.map((sheet) => {
    const rows = sheet.getRows(HEADER_SCAN_ROWS);
    return { name: sheet.name, type: detectSheetType(rows), rows };
  });
}

test('C2-10 BOQ (.xlsx, Red Book baseline): visas lapas pareizi klasificētas', async () => {
  const classified = await classifyAll(path.join(FIXTURES, 'C2-10_BOQ.xlsx'));
  assert.equal(classified.length, 67);

  const byName = Object.fromEntries(classified.map((s) => [s.name, s.type]));
  assert.equal(byName['KO'], 'master-summary');
  assert.equal(byName['KS'], 'object-summary');
  assert.equal(byName['1-2Pp'], 'detail');
  assert.equal(byName['A General requirements '], 'detail');
  assert.equal(byName['B Day works '], 'detail');

  const unknown = classified.filter((s) => s.type === 'unknown');
  assert.deepEqual(unknown.map((s) => s.name), []);
});

test('C2-10 BOQ: KO (master-summary) galvene atrasta un piesaistīta', async () => {
  const { sheets } = await loadWorkbook(path.join(FIXTURES, 'C2-10_BOQ.xlsx'));
  const ko = sheets.find((s) => s.name === 'KO');
  const rows = ko.getRows(30);
  const header = detectHeaderRow(rows, 'master-summary');
  assert.ok(header);
  assert.deepEqual(header.columnMap, {
    1: 'seqNo',
    2: 'sectionRef',
    3: 'description',
    4: 'totalCents',
  });
});

test('C2-10 BOQ: KS (object-summary) galvene atrasta un piesaistīta, ieskaitot 2. rindas apvienošanu', async () => {
  const { sheets } = await loadWorkbook(path.join(FIXTURES, 'C2-10_BOQ.xlsx'));
  const ks = sheets.find((s) => s.name === 'KS');
  const rows = ks.getRows(30);
  const header = detectHeaderRow(rows, 'object-summary');
  assert.ok(header);
  assert.deepEqual(header.columnMap, {
    1: 'seqNo',
    2: 'sectionRef',
    3: 'description',
    4: 'totalCents',
    5: 'salaryCents',
    6: 'materialsCents',
    7: 'mechanismsCents',
    8: 'laborHours',
  });
  assert.equal(header.dataStartRowIndex, 17);
});

test('C2-10 BOQ: detaļu lapa 1-2Pp — pilns 16 kolonnu galvenes piesaiste (unitCost/totalCost)', async () => {
  const { sheets } = await loadWorkbook(path.join(FIXTURES, 'C2-10_BOQ.xlsx'));
  const sheet = sheets.find((s) => s.name === '1-2Pp');
  const rows = sheet.getRows(30);
  const header = detectHeaderRow(rows, 'detail');
  assert.ok(header);
  assert.deepEqual(header.columnMap, {
    1: 'seqNo',
    2: 'code',
    3: 'description',
    4: 'unit',
    5: 'quantity',
    6: 'unitCost.timeRate',
    7: 'unitCost.wageRate',
    8: 'unitCost.salaryCents',
    9: 'unitCost.materialsCents',
    10: 'unitCost.mechanismsCents',
    11: 'unitCost.totalCents',
    12: 'totalCost.laborHours',
    13: 'totalCost.salaryCents',
    14: 'totalCost.materialsCents',
    15: 'totalCost.mechanismsCents',
    16: 'totalCost.totalCents',
  });
});

test('C8-2 Pile BOQ (legacy .xls, Variation Order): visas lapas pareizi klasificētas', async () => {
  const classified = await classifyAll(path.join(FIXTURES, 'C8-2_Pile_BOQ.xls'));
  assert.equal(classified.length, 5);

  const byName = Object.fromEntries(classified.map((s) => [s.name, s.type]));
  assert.equal(byName['Buvn.kopt.'], 'master-summary');
  assert.equal(byName['Kops.1'], 'object-summary');
  assert.equal(byName['1.1 Earthworks'], 'detail');
  assert.equal(byName['1.2 Substructure'], 'detail');
  assert.equal(byName["1.3.'Temporary drainage system "], 'detail');
});

test('C8-2 Pile BOQ: 1.2 Substructure — divu daudzumu kolonnu (VO) modelis piesaistīts', async () => {
  const { sheets } = await loadWorkbook(path.join(FIXTURES, 'C8-2_Pile_BOQ.xls'));
  const sheet = sheets.find((s) => s.name === '1.2 Substructure');
  const rows = sheet.getRows(30);
  const header = detectHeaderRow(rows, 'detail');
  assert.ok(header);
  assert.equal(header.columnMap[3], 'code');
  assert.equal(header.columnMap[6], 'quantity');
  assert.equal(header.columnMap[7], 'quantityCurrent');
  assert.equal(header.columnMap[13], 'unitCost.totalCents');
  assert.equal(header.columnMap[14], 'totalCost.laborHours');
  assert.equal(header.columnMap[18], 'totalCost.totalCents');
});

test('Abu paraugfailu VISĀS lapās galvenes rinda atrasta ar vismaz 3 piesaistītiem laukiem', async () => {
  for (const fixture of ['C2-10_BOQ.xlsx', 'C8-2_Pile_BOQ.xls']) {
    const { sheets } = await loadWorkbook(path.join(FIXTURES, fixture));
    for (const sheet of sheets) {
      const type = detectSheetType(sheet.getRows(HEADER_SCAN_ROWS));
      const header = detectHeaderRow(sheet.getRows(35), type);
      assert.ok(header, `${fixture} / ${sheet.name}: galvene nav atrasta (tips: ${type})`);
      assert.ok(
        Object.keys(header.columnMap).length >= 3,
        `${fixture} / ${sheet.name}: pārāk maz piesaistītu lauku (${JSON.stringify(header.columnMap)})`,
      );
    }
  }
});

test('C8-2 Pile BOQ: Kops.1 (object-summary) galvene atrasta un piesaistīta ar 2 rindu apvienošanu', async () => {
  const { sheets } = await loadWorkbook(path.join(FIXTURES, 'C8-2_Pile_BOQ.xls'));
  const sheet = sheets.find((s) => s.name === 'Kops.1');
  const rows = sheet.getRows(30);
  const header = detectHeaderRow(rows, 'object-summary');
  assert.ok(header);
  assert.equal(header.columnMap[1], 'seqNo');
  assert.equal(header.columnMap[2], 'sectionRef');
  assert.equal(header.columnMap[4], 'description');
  assert.equal(header.columnMap[6], 'totalCents');
  assert.equal(header.columnMap[7], 'salaryCents');
  assert.equal(header.columnMap[8], 'materialsCents');
  assert.equal(header.columnMap[9], 'mechanismsCents');
  assert.equal(header.columnMap[10], 'laborHours');
});
