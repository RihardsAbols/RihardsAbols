import { createProject, deleteProject, listProjects, type ProjectListEntry } from "@tames-modulis/core";
import { useCallback, useEffect, useState } from "react";
import { ProjectEditor } from "./components/ProjectEditor.js";
import { ProjectList } from "./components/ProjectList.js";
import { IndexedDbStorageAdapter } from "./storage/IndexedDbStorageAdapter.js";

const adapter = new IndexedDbStorageAdapter();

export function App() {
  const [projects, setProjects] = useState<ProjectListEntry[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await listProjects(adapter));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refreshProjects().finally(() => setLoading(false));
  }, [refreshProjects]);

  const handleCreate = async (name: string) => {
    const project = await createProject(adapter, name);
    await refreshProjects();
    setSelectedProjectId(project.projectId);
  };

  const handleDelete = async (projectId: string) => {
    await deleteProject(adapter, projectId);
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
    await refreshProjects();
  };

  if (loading) {
    return <p className="loading">Ielādē...</p>;
  }

  return (
    <div className="app">
      <h1>Tāmju modulis</h1>
      {error && <p className="error">{error}</p>}
      <div className="layout">
        <ProjectList
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
        {selectedProjectId ? (
          <ProjectEditor adapter={adapter} projectId={selectedProjectId} onSaved={refreshProjects} />
        ) : (
          <p className="hint">Izvēlies vai izveido projektu.</p>
        )}
      </div>
    </div>
  );
}
