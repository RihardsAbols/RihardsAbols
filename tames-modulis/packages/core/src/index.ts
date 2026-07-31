export type { BoqItem, BoqSection, BoqState } from "./models/boq.js";
export {
  createEmptyBoqState,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_VAT_RATE,
  DEFAULT_OVERHEAD_RATE,
  DEFAULT_PROFIT_RATE,
} from "./models/boq.js";
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
export { TAME_COLUMNS, KNOWN_UNITS } from "./excel/columns.js";
export { exportBoqToWorkbook, exportBoqToBuffer } from "./excel/export.js";
export { importBoqFromWorkbook, importBoqFromBuffer } from "./excel/import.js";
