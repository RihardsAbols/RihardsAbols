import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSheetLineItems } from '../src/parser/extractLineItems.js';
import { diffBoq } from '../src/diff/diffBoq.js';
import { createStagedReview, approveEntry, commitStagedReview } from '../src/diff/stagedReview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

function cloneItems(items) {
  return items.map((item) => JSON.parse(JSON.stringify(item)));
}

async function loadBaseline() {
  const file = path.join(FIXTURES, 'C2-10_BOQ.xlsx');
  const { lineItems } = await extractSheetLineItems(file, '1-2Pp');
  return lineItems;
}

// Sintētiska "revidēta" C2-10 1-2Pp kopija ar VISĀM 4 spec §3 Sesija 4
// prasītajām kategorijām + vienu fuzzy-match "drift" gadījumu
// (ARCHITECTURE_EXPORT.md §5 "1.2" pret "1.2." precedents).
function buildRevised(baseline) {
  const revised = cloneItems(baseline);

  // quantity_changed: pirmās rindas daudzums mainīts.
  revised[0].quantityCurrent = revised[0].quantityCurrent + 10;

  // removed: otrā rinda pilnībā izņemta no revidētās versijas.
  const removedItem = revised.splice(1, 1)[0];

  // fuzzy match: trešā (tagad otrā) rinda paliek nemainīta pēc daudzuma, bet
  // apraksts iegūst sīku pieturzīmju driftu (ARCHITECTURE_EXPORT.md §5 "1.2"
  // pret "1.2." precedents — normalizeCostRef tos uzskata par DAŽĀDĀM
  // atslēgām, looseCostRefKey — par VIENU un TO PAŠU) — jāsaskan kā
  // unchanged ar matchConfidence 'fuzzy', NEVIS jāklasificē kā removed+added
  // pāris.
  const driftedItem = revised[1];
  driftedItem.descriptionRaw = `${driftedItem.descriptionRaw.trim()}.`;

  // added: pilnīgi jauna pozīcija (papildu darbs).
  revised.push({
    id: 9999,
    code: null,
    seqNo: null,
    descriptionRaw: 'Papildu darbs: jauna pozīcija, kuras bāzes tāmē nebija',
    unit: 'gab',
    quantityBase: 3,
    quantityCurrent: 3,
    unitCost: { timeRate: null, wageRate: null, salaryCents: null, materialsCents: null, mechanismsCents: null, totalCents: null },
    totalCost: { laborHours: null, salaryCents: null, materialsCents: null, mechanismsCents: null, totalCents: null },
    sectionRef: '1-2Pp',
    costEstimateRef: null,
    changeStatus: 'added',
    voHistory: [],
  });

  return { revised, removedItem };
}

test('diffBoq: sintētiska revīzija klasificē visas 4 kategorijas (spec §3 Sesija 4 Gatavs, kad)', async () => {
  const baseline = await loadBaseline();
  const { revised, removedItem } = buildRevised(baseline);

  const { entries, summary } = diffBoq(baseline, revised);

  assert.ok(summary.quantity_changed >= 1, 'nav neviena quantity_changed');
  assert.ok(summary.removed >= 1, 'nav neviena removed');
  assert.ok(summary.added >= 1, 'nav neviena added');
  assert.ok(summary.unchanged >= 1, 'nav neviena unchanged');

  const removedEntry = entries.find((e) => e.changeStatus === 'removed' && e.baselineItem.id === removedItem.id);
  assert.ok(removedEntry, 'noņemtā rinda nav atrasta kā removed');

  const addedEntry = entries.find((e) => e.changeStatus === 'added' && e.revisedItem.id === 9999);
  assert.ok(addedEntry, 'jaunā rinda nav atrasta kā added');

  const quantityEntry = entries.find(
    (e) => e.changeStatus === 'quantity_changed' && e.baselineItem.id === baseline[0].id,
  );
  assert.ok(quantityEntry, 'pirmā rinda nav atrasta kā quantity_changed');
  assert.equal(quantityEntry.revisedItem.quantityCurrent, baseline[0].quantityCurrent + 10);

  // Fuzzy match: drifta rinda joprojām saskaņota (nav parādījusies ne kā
  // removed, ne kā added), un atzīmēta ar matchConfidence 'fuzzy'.
  const driftedBaselineItem = baseline[2];
  const fuzzyEntry = entries.find(
    (e) => e.baselineItem && e.baselineItem.id === driftedBaselineItem.id && e.changeStatus !== 'removed',
  );
  assert.ok(fuzzyEntry, 'drifta rinda nav saskaņota vispār');
  assert.equal(fuzzyEntry.matchConfidence, 'fuzzy');
  assert.equal(fuzzyEntry.changeStatus, 'unchanged');
});

test('stagedReview: TIKAI apstiprinātās izmaiņas tiek pielietotas, neapstiprinātās — nekad klusi', async () => {
  const baseline = await loadBaseline();
  const { revised } = buildRevised(baseline);

  const staged = createStagedReview(baseline, revised);
  const quantityEntry = staged.find(
    (e) => e.changeStatus === 'quantity_changed' && e.baselineItem.id === baseline[0].id,
  );
  const removedEntry = staged.find((e) => e.changeStatus === 'removed');
  const addedEntry = staged.find((e) => e.changeStatus === 'added' && e.revisedItem.id === 9999);

  // Apstiprinām TIKAI quantity_changed ierakstu — removed un added atstājam
  // neapstiprinātus.
  const partiallyApproved = approveEntry(staged, quantityEntry.reviewId);
  const result = commitStagedReview(baseline, partiallyApproved);

  const resultQuantityItem = result.find((i) => i.id === baseline[0].id);
  assert.equal(resultQuantityItem.quantityCurrent, baseline[0].quantityCurrent + 10);
  assert.equal(resultQuantityItem.changeStatus, 'quantity_changed');

  // Neapstiprinātā removed rinda paliek bāzes sarakstā (nekad klusi
  // nepazūd).
  assert.ok(result.some((i) => i.id === removedEntry.baselineItem.id));

  // Neapstiprinātā added rinda NAV pievienota rezultātam.
  assert.ok(!result.some((i) => i.id === 9999));

  // Tagad apstiprinām VISU un pārbaudām, ka tad gan removed pazūd, gan added
  // parādās.
  const fullyApproved = staged.map((e) => ({ ...e, approved: true }));
  const fullResult = commitStagedReview(baseline, fullyApproved);
  assert.ok(!fullResult.some((i) => i.id === removedEntry.baselineItem.id));
  assert.ok(fullResult.some((i) => i.id === 9999));
});
