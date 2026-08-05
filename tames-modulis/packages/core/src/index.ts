export type { BoqItem, BoqSection, BoqState, CompanyDetails } from "./models/boq.js";
export {
  createEmptyBoqState,
  createEmptyCompanyDetails,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_VAT_RATE,
  DEFAULT_OVERHEAD_RATE,
  DEFAULT_PROFIT_RATE,
  DEFAULT_DISCOUNT_RATE,
} from "./models/boq.js";
export type { VariationOrder, VariationOrderChange, VariationOrderStatus } from "./models/variationOrder.js";
export type { BoqItemDiffRow, CreateVariationOrderInput, ItemVoImpact, ItemDisplayInfo, ReserveEntry, ReserveBalance } from "./variationOrders/deriveCurrentState.js";
export {
  deriveCurrentSections,
  deriveCurrentState,
  nextVariationOrderNumber,
  createVariationOrder,
  voidVariationOrder,
  computeVariationOrderDirectTotalImpact,
  diffAgainstBaseline,
  computeItemCodesAndHistory,
  computeReserveBalance,
} from "./variationOrders/deriveCurrentState.js";
export type { ExecutionRecord, ExecutionRecordEntry } from "./models/executionRecord.js";
export type { CreateExecutionRecordInput, ExecutionOverviewRow } from "./executionRecords/executionRecords.js";
export {
  computeExecutedToDate,
  computeRemainingQuantity,
  computeExecutionOverview,
  computeExecutionRecordValue,
  createExecutionRecord,
  voidExecutionRecord,
} from "./executionRecords/executionRecords.js";
export type { ProjectListEntry, StorageAdapter } from "./storage/StorageAdapter.js";
// FileSystemStorageAdapter is intentionally NOT re-exported here: it imports
// node:fs/promises, and this barrel must stay bundleable for the browser
// (packages/web imports it directly). Node-side code should import it from
// "@tames-modulis/core/node" instead (see src/node.ts).
export { migrateToCurrent, UnsupportedSchemaVersionError } from "./storage/migrations/index.js";
export {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  ProjectNotFoundError,
} from "./projects/ProjectService.js";
export type { BoqItemCosts, BoqSectionSummary, BoqSummary } from "./calculations/boq.js";
export {
  round2,
  calculateItemCosts,
  calculateSectionDirectTotal,
  summarizeBoq,
} from "./calculations/boq.js";
// Excel export/import is intentionally NOT re-exported here: it pulls in
// exceljs, a large dependency most consumers of this barrel (e.g. the
// project-list/editor UI) don't need on every page load. Import it from
// "@tames-modulis/core/excel" instead - see src/excel/index.ts - ideally via
// a dynamic import() at the call site so bundlers can code-split it.
