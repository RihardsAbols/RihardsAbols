import { useState, type FormEvent } from "react";
import type { ProjectListEntry } from "@tames-modulis/core";

interface ProjectListProps {
  projects: ProjectListEntry[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
}

export function ProjectList({ projects, selectedProjectId, onSelect, onCreate, onDelete }: ProjectListProps) {
  const [newName, setNewName] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await onCreate(name);
    setNewName("");
  };

  return (
    <div className="project-list">
      <h2>Projekti</h2>
      <form onSubmit={handleSubmit} className="new-project-form">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Jauna projekta nosaukums"
        />
        <button type="submit">+ Jauns</button>
      </form>
      <ul>
        {projects.map((project) => (
          <li key={project.projectId} className={project.projectId === selectedProjectId ? "selected" : ""}>
            <button className="project-select" onClick={() => onSelect(project.projectId)}>
              {project.projectName}
            </button>
            <button
              className="project-delete"
              aria-label={`Dzēst ${project.projectName}`}
              onClick={() => {
                if (confirm(`Dzēst projektu "${project.projectName}"?`)) {
                  void onDelete(project.projectId);
                }
              }}
            >
              ×
            </button>
          </li>
        ))}
        {projects.length === 0 && <li className="empty">Nav neviena projekta.</li>}
      </ul>
    </div>
  );
}
