import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSheetLineItems, extractAllDetailSheets } from '../src/parser/extractLineItems.js';
import { loadRecalculatedWorkbook } from '../src/parser/workbookModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

function sum(items, path_) {
  const [a, b] = path_.split('.');
  return items.reduce((acc, item) => acc + (item[a]?.[b] ?? 0), 0);
}

test('C2-10 1-2Pp: rindu ekstrakcija — daudzumi pareizi, izmaksas korekti nulle (bāzes tāme bez cenām)', async () => {
  const file = path.join(FIXTURES, 'C2-10_BOQ.xlsx');
  const { lineItems, subtotals, sheetType } = await extractSheetLineItems(file, '1-2Pp');

  assert.equal(sheetType, 'detail');
  assert.ok(lineItems.length > 30, `sagaidīts >30 rindu, atrasts ${lineItems.length}`);

  const first = lineItems[0];
  assert.equal(first.seqNo, 1);
  assert.equal(first.unit, 'm3');
  assert.equal(first.quantityBase, 128.54);
  assert.equal(first.quantityCurrent, 128.54);
  assert.match(first.descriptionRaw, /Pamatnes betonēšana b=100 mm/);

  // Bāzes tāmē (Red Book) cenu kolonnas tukšas — spec §0. Pārrēķinātā kopsumma
  // ekstrahētajās rindās (kuru pašā avotfailā vispār nav) tātad korekti = 0.
  assert.equal(sum(lineItems, 'totalCost.totalCents'), 0);
  assert.equal(subtotals.totalCents, 0);

  const recalculated = await loadRecalculatedWorkbook(file);
  // KS!D25 = SUM(E25:G25), kur E25/F25/G25 = '1-2Pp'!M50/N50/O50 (šīs lapas
  // kopsummas rinda) — punktpārbaude: mūsu pārrēķinātā lapas subtotal
  // sakrīt ar KS neatkarīgi aprēķināto vērtību tai pašai sadaļai.
  assert.equal(recalculated.getValue('KS', 'D25'), subtotals.salaryCents + subtotals.materialsCents + subtotals.mechanismsCents);
});

test('C8-2 1.2 Substructure: rindu ekstrakcija — VO divu daudzumu modelis un reālas izmaksas', async () => {
  const file = path.join(FIXTURES, 'C8-2_Pile_BOQ.xls');
  const { lineItems, sheetType } = await extractSheetLineItems(file, '1.2 Substructure');

  assert.equal(sheetType, 'detail');
  assert.ok(lineItems.length >= 5, `sagaidīts >=5 rindu, atrasts ${lineItems.length}`);

  const mobilization = lineItems.find((i) => /Mobilizācija|Mobilization/i.test(i.descriptionRaw));
  assert.ok(mobilization, 'nav atrasta "mobilizācija" rinda');
  assert.equal(mobilization.unit, 'kpl/set');
  assert.equal(mobilization.quantityBase, 1);
  assert.equal(mobilization.quantityCurrent, 1);
  assert.equal(mobilization.totalCost.totalCents, 16500);

  // Punktpārbaude PRET NEATKARĪGI PĀRRĒĶINĀTU zināmu kopsummu (Kops.1 "1.2
  // Substructure" rindas "Estimated costs"): ekstrahēto rindu totalCost.totalCents
  // summa jāsakrīt ar Kops.1 sadaļas kopsummu — spec §3 Sesija 3 "Gatavs, kad"
  // kritērija analogs (tur minēts KO!D35 piemērs; šeit — nozīmīgāks, jo šis
  // fails REĀLI satur cenas, atšķirībā no C2-10 bāzes tāmes).
  const recalculated = await loadRecalculatedWorkbook(file);
  const knownSectionTotal = recalculated.getValue('Kops.1', 'F20');
  assert.equal(knownSectionTotal, 2453969);
  assert.equal(sum(lineItems, 'totalCost.totalCents'), knownSectionTotal);
});

test('Pilns kanoniskais JSON — visas DETAIL lapas abos paraugfailos ekstrahējas bez kļūdām', async () => {
  for (const fixture of ['C2-10_BOQ.xlsx', 'C8-2_Pile_BOQ.xls']) {
    const file = path.join(FIXTURES, fixture);
    const results = await extractAllDetailSheets(file);
    assert.ok(results.length > 0, `${fixture}: nav neviena detail lapa`);
    for (const result of results) {
      assert.ok(Array.isArray(result.lineItems), `${fixture}/${result.sheetName}: lineItems nav masīvs`);
      assert.ok(result.subtotals, `${fixture}/${result.sheetName}: subtotals nav atrasts`);
    }
  }
});
