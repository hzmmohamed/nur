// components/ProjectList.tsx
import React, { useState } from "react";
import { useProjects, useDeleteProject } from "../hooks/useProjects";
import { CURRENT_USER_ID } from "@/lib/constants";
import type { Project } from "@/types/project";

import { Play, Clock, Monitor, Zap, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProjectCardProps {
  project: Project;
  onDelete?: (projectId: string) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onDelete }) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Format the updatedAt timestamp to relative time
  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const updated = new Date(timestamp);
    const diffInSeconds = Math.floor(
      (now.getTime() - updated.getTime()) / 1000
    );

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600)
      return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return updated.toLocaleDateString();
  };

  const handleDeleteConfirm = () => {
    onDelete?.(project.id);
    setIsDeleteDialogOpen(false);
  };

  return (
    <Card className="hover:shadow-md transition-shadow duration-200 cursor-pointer overflow-hidden group">
      {/* Thumbnail Section */}
      <div className="relative aspect-video bg-muted flex items-center justify-center">
        {project.thumbnailBase64 ? (
          <img
            src={`data:image/jpeg;base64,${project.thumbnailBase64}`}
            alt={project.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Play size={32} className="mb-2" />
            <span className="text-sm font-medium">No Preview</span>
          </div>
        )}

        {/* Delete Button - appears on hover */}
        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteDialogOpen(true);
              }}
            >
              <Trash2 size={16} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{project.name}"? This action
                cannot be undone and will permanently remove the project and all
                its data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsDeleteDialogOpen(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Project
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Content Section */}
      <CardContent className="p-4">
        {/* Project Name */}
        <h3 className="font-semibold text-foreground text-lg mb-1 truncate">
          {project.name}
        </h3>

        {/* Description */}
        {project.description && (
          <p className="text-muted-foreground text-sm mb-3 line-clamp-2 leading-relaxed">
            {project.description}
          </p>
        )}

        {/* Metadata Row */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {/* Canvas Size and FPS */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Monitor size={12} />
              <span>
                {project.canvasWidth} × {project.canvasHeight}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Zap size={12} />
              <span>{project.fps} fps</span>
            </div>
          </div>

          {/* Last Updated */}
          <div className="flex items-center gap-1">
            <Clock size={12} />
            <span>{formatTimeAgo(project.updatedAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const ProjectList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");

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

  const handleDeleteProject = async (projectId: string) => {
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
      {/* <div className="mb-6">
        <input
          type="text"
          placeholder="Search projects..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div> */}

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
            <ProjectCard project={project} key={project.id} onDelete={handleDeleteProject} />
          ))
        )}
      </div>
    </div>
  );
};
