import type { BoqState } from "../models/boq.js";

export interface ProjectListEntry {
  projectId: string;
  projectName: string;
  updatedAt: string;
}

export interface StorageAdapter {
  save(projectId: string, state: BoqState): Promise<void>;
  load(projectId: string): Promise<BoqState | null>;
  list(): Promise<ProjectListEntry[]>;
  /** Idempotent: deleting a project that doesn't exist is not an error. */
  delete(projectId: string): Promise<void>;
}
