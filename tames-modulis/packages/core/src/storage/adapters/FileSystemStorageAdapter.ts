import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BoqState } from "../../models/boq.js";
import type { ProjectListEntry, StorageAdapter } from "../StorageAdapter.js";
import { migrateToCurrent } from "../migrations/index.js";

export class FileSystemStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir: string) {}

  private projectDir(projectId: string): string {
    return join(this.baseDir, "projects", projectId);
  }

  private stateFilePath(projectId: string): string {
    return join(this.projectDir(projectId), "boq-state.json");
  }

  async save(projectId: string, state: BoqState): Promise<void> {
    const filePath = this.stateFilePath(projectId);
    await mkdir(dirname(filePath), { recursive: true });

    // Write to a temp file first and rename into place so a crash mid-write
    // never leaves boq-state.json truncated or corrupted.
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
    await rename(tmpPath, filePath);
  }

  async load(projectId: string): Promise<BoqState | null> {
    const filePath = this.stateFilePath(projectId);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
    return migrateToCurrent(JSON.parse(raw));
  }

  async list(): Promise<ProjectListEntry[]> {
    const projectsDir = join(this.baseDir, "projects");
    let entries: string[];
    try {
      entries = (await readdir(projectsDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const projects: ProjectListEntry[] = [];
    for (const projectId of entries) {
      const state = await this.load(projectId);
      if (state) {
        projects.push({ projectId, projectName: state.projectName, updatedAt: state.updatedAt });
      }
    }
    return projects;
  }

  async delete(projectId: string): Promise<void> {
    await rm(this.projectDir(projectId), { recursive: true, force: true });
  }
}
