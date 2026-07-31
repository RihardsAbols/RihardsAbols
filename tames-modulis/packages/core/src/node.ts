// Node-only entry point: everything in the universal barrel (./index.js),
// plus adapters that touch Node built-ins. Keep this separate from index.ts
// so browser bundlers never need to resolve node:fs/promises.
export * from "./index.js";
export { FileSystemStorageAdapter } from "./storage/adapters/FileSystemStorageAdapter.js";
