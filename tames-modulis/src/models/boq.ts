export interface BoqItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export interface BoqSection {
  id: string;
  name: string;
  items: BoqItem[];
}

export interface BoqState {
  schemaVersion: number;
  projectId: string;
  projectName: string;
  sections: BoqSection[];
  createdAt: string;
  updatedAt: string;
}

export function createEmptyBoqState(projectId: string, projectName: string): BoqState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    projectId,
    projectName,
    sections: [],
    createdAt: now,
    updatedAt: now,
  };
}
