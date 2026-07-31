import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { ProjectListEntry } from "@tames-modulis/core";

interface ProjectListProps {
  projects: ProjectListEntry[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (projectId: string) => Promise<void>;
  onImport: (file: File) => Promise<void>;
}

export function ProjectList({ projects, selectedProjectId, onSelect, onCreate, onDelete, onImport }: ProjectListProps) {
  const [newName, setNewName] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await onCreate(name);
    setNewName("");
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    setImporting(true);
    try {
      await onImport(file);
    } finally {
      setImporting(false);
    }
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
      <button
        className="import-button"
        disabled={importing}
        onClick={() => fileInputRef.current?.click()}
      >
        {importing ? "Importē..." : "Importēt Excel"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => void handleFileChange(e)}
      />
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
