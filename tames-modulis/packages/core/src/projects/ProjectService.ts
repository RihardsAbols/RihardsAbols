import { createEmptyBoqState, type BoqState } from "../models/boq.js";
import type { ProjectListEntry, StorageAdapter } from "../storage/StorageAdapter.js";

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Projekts nav atrasts: ${projectId}`);
    this.name = "ProjectNotFoundError";
  }
}

export async function createProject(adapter: StorageAdapter, projectName: string): Promise<BoqState> {
  // globalThis.crypto (Web Crypto) rather than node:crypto's randomUUID, so
  // this module stays bundleable for the browser (packages/web) as well as Node.
  const projectId = crypto.randomUUID();
  const state = createEmptyBoqState(projectId, projectName);
  await adapter.save(projectId, state);
  return state;
}

export function listProjects(adapter: StorageAdapter): Promise<ProjectListEntry[]> {
  return adapter.list();
}

export function getProject(adapter: StorageAdapter, projectId: string): Promise<BoqState | null> {
  return adapter.load(projectId);
}

/** Loads the project, applies `updater`, bumps updatedAt, and saves the result. */
export async function updateProject(
  adapter: StorageAdapter,
  projectId: string,
  updater: (state: BoqState) => BoqState,
): Promise<BoqState> {
  const existing = await adapter.load(projectId);
  if (!existing) {
    throw new ProjectNotFoundError(projectId);
  }
  const updated: BoqState = { ...updater(existing), updatedAt: new Date().toISOString() };
  await adapter.save(projectId, updated);
  return updated;
}

export function deleteProject(adapter: StorageAdapter, projectId: string): Promise<void> {
  return adapter.delete(projectId);
}
