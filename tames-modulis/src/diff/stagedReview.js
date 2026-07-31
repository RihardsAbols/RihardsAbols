import { diffBoq } from './diffBoq.js';

// "Staged" pārskata plūsma — Kanban app `piStaged*` parauga analogs (skat.
// ARCHITECTURE_EXPORT.md §3 "The staged edit pattern"): diff TIKAI IEROSINA
// izmaiņas; NEKAS netiek pielietots bāzes sarakstam, kamēr katrs ieraksts
// nav explicit apstiprināts (`approveEntry`) un pēc tam commitots
// (`commitStagedReview`). Neapstiprināti ieraksti vienkārši netiek pielietoti
// — nekad klusa apvienošana, tāpat kā Kanban app CCF/VO fuzzy-match plūsmā.
export function createStagedReview(baselineItems, revisedItems) {
  const diff = diffBoq(baselineItems, revisedItems);
  return diff.entries.map((entry, index) => ({
    ...entry,
    reviewId: index + 1,
    approved: false,
  }));
}

export function approveEntry(stagedEntries, reviewId) {
  return stagedEntries.map((e) => (e.reviewId === reviewId ? { ...e, approved: true } : e));
}

export function rejectEntry(stagedEntries, reviewId) {
  return stagedEntries.map((e) => (e.reviewId === reviewId ? { ...e, approved: false } : e));
}

// Pielieto TIKAI apstiprinātos (`approved: true`) ierakstus bāzes sarakstam,
// atgriežot JAUNU rindu masīvu (bāzes saraksts pats netiek mutēts).
export function commitStagedReview(baselineItems, stagedEntries) {
  const approved = stagedEntries.filter((e) => e.approved);

  const removedIds = new Set();
  const quantityChangedById = new Map();
  const addedItems = [];

  for (const entry of approved) {
    if (entry.changeStatus === 'removed') {
      removedIds.add(entry.baselineItem.id);
    } else if (entry.changeStatus === 'quantity_changed') {
      quantityChangedById.set(entry.baselineItem.id, entry.revisedItem);
    } else if (entry.changeStatus === 'added') {
      addedItems.push(entry.revisedItem);
    }
    // 'unchanged' apstiprināšana neko nemaina bāzes rindā.
  }

  const result = [];
  for (const item of baselineItems) {
    if (removedIds.has(item.id)) continue;

    if (quantityChangedById.has(item.id)) {
      const revised = quantityChangedById.get(item.id);
      result.push({
        ...item,
        quantityCurrent: revised.quantityCurrent,
        changeStatus: 'quantity_changed',
        voHistory: [
          ...(item.voHistory || []),
          { quantityBefore: item.quantityCurrent, quantityAfter: revised.quantityCurrent },
        ],
      });
      continue;
    }

    result.push(item);
  }

  for (const item of addedItems) {
    result.push({ ...item, changeStatus: 'added' });
  }

  return result;
}
