import type { BoqState } from "../models/boq.js";

export interface StorageAdapter {
  save(projectId: string, state: BoqState): Promise<void>;
  load(projectId: string): Promise<BoqState | null>;
}
