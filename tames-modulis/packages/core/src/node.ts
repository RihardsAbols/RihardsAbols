// Node-only entry point: everything in the universal barrel (./index.js),
// plus adapters that touch Node built-ins and excel/index.js (kept out of
// index.js only to let browser bundlers code-split it - no reason to make
// Node consumers opt into "./excel" separately).
export * from "./index.js";
export * from "./excel/index.js";
export { FileSystemStorageAdapter } from "./storage/adapters/FileSystemStorageAdapter.js";
