// hooks/useProject.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { UpdateProjectDataSchema } from "../types/project";
import type { Project, UpdateProjectData } from "../types/project";
import {
  projectService,
  ProjectServiceError,
} from "../services/ProjectService";

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () => {
      z.string().uuid().parse(projectId);
      return projectService.getProject(projectId);
    },
    enabled: !!projectId,
    staleTime: 60 * 1000, // 1 minute
    retry: (failureCount, error) => {
      // Don't retry validation errors
      if (
        error instanceof ProjectServiceError &&
        error.code === "VALIDATION_ERROR"
      ) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

export function useUpdateSingleProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProjectData) => {
      z.string().uuid().parse(projectId);
      const validatedData = UpdateProjectDataSchema.parse(data);
      return projectService.updateProject(projectId, validatedData);
    },
    onSuccess: (updatedProject) => {
      if (updatedProject) {
        queryClient.setQueryData(["project", projectId], updatedProject);

        // Update in projects list if it exists
        queryClient.setQueryData<Project[]>(["projects"], (old = []) =>
          old.map((project) =>
            project.id === projectId ? updatedProject : project
          )
        );
      }
    },
    onError: (error: ProjectServiceError) => {
      console.error("Failed to update project:", formatValidationError(error));
    },
  });
}

export function useAddCollaborator(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => {
      z.string().uuid().parse(projectId);
      z.string().min(1).parse(userId);
      return projectService.addCollaborator(projectId, userId);
    },
    onSuccess: (updatedProject) => {
      if (updatedProject) {
        queryClient.setQueryData(["project", projectId], updatedProject);
      }
    },
    onError: (error: ProjectServiceError) => {
      console.error(
        "Failed to add collaborator:",
        formatValidationError(error)
      );
    },
  });
}

export function useRemoveCollaborator(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => {
      z.string().uuid().parse(projectId);
      z.string().min(1).parse(userId);
      return projectService.removeCollaborator(projectId, userId);
    },
    onSuccess: (updatedProject) => {
      if (updatedProject) {
        queryClient.setQueryData(["project", projectId], updatedProject);
      }
    },
    onError: (error: ProjectServiceError) => {
      console.error(
        "Failed to remove collaborator:",
        formatValidationError(error)
      );
    },
  });
}

export function useProjectStats(projectId: string) {
  return useQuery({
    queryKey: ["project-stats", projectId],
    queryFn: () => {
      z.string().uuid().parse(projectId);
      return projectService.getProjectStats(projectId);
    },
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30 seconds
  });
}
