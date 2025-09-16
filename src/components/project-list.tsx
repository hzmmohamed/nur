// components/ProjectList.tsx
import React, { useState } from "react";
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
} from "../hooks/useProjects";
import { type CreateProjectData } from "../types/project";
import { CURRENT_USER_ID } from "@/lib/constants";

export const ProjectList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  const {
    data: projects = [],
    isLoading,
    error,
    refetch,
  } = useProjects({
    search: searchTerm || undefined,
    userId: CURRENT_USER_ID,
    limit: 100,
    offset: 0,
  });

  const deleteProjectMutation = useDeleteProject();

  const handleDeleteProject = async (
    projectId: string,
    projectName: string
  ) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"?`)) return;

    try {
      await deleteProjectMutation.mutateAsync(projectId);
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-muted-foreground">Loading projects...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
        <div className="text-destructive mb-2">
          Error loading projects: {error.message}
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1 bg-destructive text-destructive-foreground rounded-md text-sm hover:bg-destructive/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search projects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {projects.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-muted-foreground">
              No projects found. Create your first project above!
            </p>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              {project.thumbnailBase64 && (
                <img
                  src={`data:image/png;base64,${project.thumbnailBase64}`}
                  alt={`Thumbnail for ${project.name}`}
                  className="w-full h-auto object-cover aspect-video mb-3 rounded-md bg-muted"
                />
              )}

              <h3 className="text-lg font-semibold text-card-foreground mb-2 line-clamp-1">
                {project.name}
              </h3>

              {project.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {project.description}
                </p>
              )}

              <div className="text-xs text-muted-foreground space-y-1 mb-4">
                <div className="flex items-center justify-between">
                  <span>
                    {project.canvasWidth} x {project.canvasHeight}
                  </span>
                  <span>{project.framesCount} frames</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {Math.floor(
                      (project.framesCount || 0) / (project.fps || 30)
                    )}
                    s
                  </span>
                  <span className="px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded text-xs">
                    {project.fps || 30} fps
                  </span>
                </div>
                <div className="text-xs">
                  Created: {new Date(project.createdAt).toLocaleDateString()}
                </div>
                <div className="text-xs">
                  Updated: {new Date(project.updatedAt).toLocaleDateString()}
                </div>
                <div className="text-xs">
                  Collaborators: {project.collaborators.length}
                </div>
                <div className="text-xs break-all">
                  Document: {project.yjsDocumentId}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => handleDeleteProject(project.id, project.name)}
                  disabled={deleteProjectMutation.isPending}
                  className="px-2 py-1 text-xs text-destructive border border-destructive rounded hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 transition-colors"
                >
                  {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
                </button>

                <span
                  className={`px-2 py-1 rounded text-xs border ${
                    project.settings.isPublic
                      ? "bg-secondary text-secondary-foreground border-secondary"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {project.settings.isPublic ? "Public" : "Private"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
