import { beforeEach, describe, expect, it } from "vitest";
import type { BoqState } from "../src/models/boq.js";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  ProjectNotFoundError,
  updateProject,
} from "../src/projects/ProjectService.js";
import type { ProjectListEntry, StorageAdapter } from "../src/storage/StorageAdapter.js";

class InMemoryStorageAdapter implements StorageAdapter {
  private readonly states = new Map<string, BoqState>();

  async save(projectId: string, state: BoqState): Promise<void> {
    this.states.set(projectId, structuredClone(state));
  }

  async load(projectId: string): Promise<BoqState | null> {
    const state = this.states.get(projectId);
    return state ? structuredClone(state) : null;
  }

  async list(): Promise<ProjectListEntry[]> {
    return [...this.states.values()].map((state) => ({
      projectId: state.projectId,
      projectName: state.projectName,
      updatedAt: state.updatedAt,
    }));
  }

  async delete(projectId: string): Promise<void> {
    this.states.delete(projectId);
  }
}

describe("ProjectService", () => {
  let adapter: InMemoryStorageAdapter;

  beforeEach(() => {
    adapter = new InMemoryStorageAdapter();
  });

  it("createProject saves and returns a fresh empty project with a generated id", async () => {
    const project = await createProject(adapter, "Jauns projekts");

    expect(project.projectId).toBeTruthy();
    expect(project.projectName).toBe("Jauns projekts");
    expect(project.sections).toEqual([]);
    expect(await getProject(adapter, project.projectId)).toEqual(project);
  });

  it("createProject assigns distinct ids across calls", async () => {
    const a = await createProject(adapter, "A");
    const b = await createProject(adapter, "B");
    expect(a.projectId).not.toBe(b.projectId);
  });

  it("listProjects reflects created projects", async () => {
    const a = await createProject(adapter, "Projekts A");
    const b = await createProject(adapter, "Projekts B");

    const listed = await listProjects(adapter);
    expect(listed.map((p) => p.projectId).sort()).toEqual([a.projectId, b.projectId].sort());
  });

  it("getProject returns null for an unknown id", async () => {
    expect(await getProject(adapter, "unknown")).toBeNull();
  });

  it("updateProject applies the updater, bumps updatedAt, and persists the result", async () => {
    const project = await createProject(adapter, "Sākotnējais nosaukums");
    const originalUpdatedAt = project.updatedAt;

    const updated = await updateProject(adapter, project.projectId, (state) => ({
      ...state,
      projectName: "Jaunais nosaukums",
    }));

    expect(updated.projectName).toBe("Jaunais nosaukums");
    expect(updated.createdAt).toBe(project.createdAt);
    // >= rather than a strict inequality: createProject and updateProject can
    // land in the same millisecond under a fast test run, so the ISO
    // timestamps may legitimately tie.
    expect(updated.updatedAt >= originalUpdatedAt).toBe(true);
    expect((await getProject(adapter, project.projectId))?.projectName).toBe("Jaunais nosaukums");
  });

  it("updateProject throws ProjectNotFoundError for an unknown id", async () => {
    await expect(updateProject(adapter, "unknown", (s) => s)).rejects.toThrow(ProjectNotFoundError);
  });

  it("deleteProject removes the project so it can no longer be found", async () => {
    const project = await createProject(adapter, "Dzēšamais");
    await deleteProject(adapter, project.projectId);

    expect(await getProject(adapter, project.projectId)).toBeNull();
    expect(await listProjects(adapter)).toEqual([]);
  });
});
