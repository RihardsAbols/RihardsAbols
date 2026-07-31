import { normalizeCostRef, looseCostRefKey } from './costRef.js';

const QUANTITY_EPSILON = 1e-9;

// Rindas atslēga = kods, ja tas ir aizpildīts (retums, skat. §2 "bieži
// tukšs"), citādi apraksts — abos gadījumos normalizēts. `code` bieži nav
// aizpildīts BOQ pozīciju līmenī (tas ir sadaļu/lapu atsauces jēdziens KO/KS
// lapās, nevis pozīciju), tāpēc praksē atslēga gandrīz vienmēr ir apraksts.
function itemKey(item) {
  const code = item.code != null ? String(item.code).trim() : '';
  return normalizeCostRef(code || item.descriptionRaw || '');
}

function buildKeyIndex(items, keyFn) {
  const index = new Map();
  items.forEach((item, i) => {
    const key = keyFn(item);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(i);
  });
  return index;
}

function quantitiesEqual(a, b) {
  const an = a == null ? 0 : Number(a);
  const bn = b == null ? 0 : Number(b);
  return Math.abs(an - bn) < QUANTITY_EPSILON;
}

function makeMatchEntry(baselineItem, revisedItem, matchConfidence) {
  const changeStatus = quantitiesEqual(baselineItem.quantityCurrent, revisedItem.quantityCurrent)
    ? 'unchanged'
    : 'quantity_changed';
  return { changeStatus, baselineItem, revisedItem, matchConfidence };
}

// Saskaņo bāzes un revidēto BOQ rindu sarakstus un klasificē katru pāri/
// nesaskaņoto rindu kā 'unchanged' | 'quantity_changed' | 'added' | 'removed'
// (skat. TAMES_MODULE_SPEC.md §3, Sesija 4).
//
// Saskaņošana vispirms mēģina PRECĪZU atslēgas sakritumu, un TIKAI
// nesaskaņotajam atlikumam — fuzzy (loose) sakritumu (skat.
// ARCHITECTURE_EXPORT.md §5 "normalizeCostRef pret looseCostRefKey" — reāls
// piemērs, kur "1.2" un "1.2." tika uzskatīti par divām dažādām atslēgām).
// Fuzzy sakrituma pāri tiek atzīmēti ar `matchConfidence: 'fuzzy'`, lai
// lietotāja pārskata solis (skat. stagedReview.js) tos varētu īpaši izcelt —
// NEKAD klusi apvienot bez šīs atzīmes.
export function diffBoq(baselineItems, revisedItems) {
  const baselineUsed = new Set();
  const revisedUsed = new Set();
  const entries = [];

  const baselineExactIndex = buildKeyIndex(baselineItems, itemKey);
  const revisedExactIndex = buildKeyIndex(revisedItems, itemKey);

  for (const [key, baselineIdxs] of baselineExactIndex) {
    const revisedIdxs = revisedExactIndex.get(key);
    if (!revisedIdxs) continue;
    const pairCount = Math.min(baselineIdxs.length, revisedIdxs.length);
    for (let i = 0; i < pairCount; i++) {
      const bIdx = baselineIdxs[i];
      const rIdx = revisedIdxs[i];
      baselineUsed.add(bIdx);
      revisedUsed.add(rIdx);
      entries.push(makeMatchEntry(baselineItems[bIdx], revisedItems[rIdx], 'exact'));
    }
  }

  const remainingRevised = revisedItems.map((_, i) => i).filter((i) => !revisedUsed.has(i));
  const looseRevisedIndex = new Map();
  for (const rIdx of remainingRevised) {
    const key = looseCostRefKey(itemKey(revisedItems[rIdx]));
    if (!looseRevisedIndex.has(key)) looseRevisedIndex.set(key, []);
    looseRevisedIndex.get(key).push(rIdx);
  }

  baselineItems.forEach((baselineItem, bIdx) => {
    if (baselineUsed.has(bIdx)) return;
    const looseKey = looseCostRefKey(itemKey(baselineItem));
    const candidates = (looseRevisedIndex.get(looseKey) || []).filter((rIdx) => !revisedUsed.has(rIdx));
    if (candidates.length === 0) return;
    const rIdx = candidates[0];
    baselineUsed.add(bIdx);
    revisedUsed.add(rIdx);
    entries.push(makeMatchEntry(baselineItem, revisedItems[rIdx], 'fuzzy'));
  });

  baselineItems.forEach((item, i) => {
    if (baselineUsed.has(i)) return;
    entries.push({ changeStatus: 'removed', baselineItem: item, revisedItem: null, matchConfidence: null });
  });

  revisedItems.forEach((item, i) => {
    if (revisedUsed.has(i)) return;
    entries.push({ changeStatus: 'added', baselineItem: null, revisedItem: item, matchConfidence: null });
  });

  return {
    entries,
    summary: {
      unchanged: entries.filter((e) => e.changeStatus === 'unchanged').length,
      quantity_changed: entries.filter((e) => e.changeStatus === 'quantity_changed').length,
      added: entries.filter((e) => e.changeStatus === 'added').length,
      removed: entries.filter((e) => e.changeStatus === 'removed').length,
    },
  };
}
