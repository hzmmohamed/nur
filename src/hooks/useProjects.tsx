// hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type {
  Project,
  CreateProjectData,
  UpdateProjectData,
  ProjectQueryParams,
} from "../types/project";

import {
  CreateProjectDataSchema,
  UpdateProjectDataSchema,
  ProjectQueryParamsSchema,
} from "../types/project";

import {
  projectService,
  ProjectServiceError,
} from "../services/ProjectService";

const PROJECTS_QUERY_KEY = "projects";

// Helper function to format validation errors
function formatValidationError(error: ProjectServiceError): string {
  if (error.validationErrors) {
    const issues = error.validationErrors.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    return `Validation error: ${issues}`;
  }
  return error.message;
}

export function useProjects(params?: ProjectQueryParams) {
  // Validate params before using them
  const validatedParams = params
    ? ProjectQueryParamsSchema.parse(params)
    : undefined;

  return useQuery({
    queryKey: [PROJECTS_QUERY_KEY, validatedParams],
    queryFn: () => projectService.getProjects(validatedParams),
    staleTime: 2 * 60 * 1000, // 2 minutes
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

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProjectData) => {
      // Validate data before sending
      const validatedData = CreateProjectDataSchema.parse(data);
      return projectService.createProject(validatedData);
    },
    onSuccess: (newProject) => {
      // Invalidate projects queries
      queryClient.invalidateQueries({ queryKey: [PROJECTS_QUERY_KEY] });

      // Optimistically add to cache
      queryClient.setQueryData<Project[]>([PROJECTS_QUERY_KEY], (old = []) => [
        newProject,
        ...old,
      ]);
    },
    onError: (error: ProjectServiceError) => {
      console.error("Failed to create project:", formatValidationError(error));
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: UpdateProjectData;
    }) => {
      // Validate data before sending
      z.uuid().parse(projectId);
      const validatedData = UpdateProjectDataSchema.parse(data);
      return projectService.updateProject(projectId, validatedData);
    },
    onSuccess: (updatedProject) => {
      if (updatedProject) {
        // Update single project cache
        queryClient.setQueryData(
          ["project", updatedProject.id],
          updatedProject
        );

        // Update projects list cache
        queryClient.setQueryData<Project[]>([PROJECTS_QUERY_KEY], (old = []) =>
          old.map((project) =>
            project.id === updatedProject.id ? updatedProject : project
          )
        );
      }
    },
    onError: (error: ProjectServiceError) => {
      console.error("Failed to update project:", formatValidationError(error));
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => {
      z.uuid().parse(projectId);
      return projectService.deleteProject(projectId);
    },
    onSuccess: (_, projectId) => {
      // Remove from projects list cache
      queryClient.setQueryData<Project[]>([PROJECTS_QUERY_KEY], (old = []) =>
        old.filter((project) => project.id !== projectId)
      );

      // Remove single project cache
      queryClient.removeQueries({ queryKey: ["project", projectId] });
    },
    onError: (error: ProjectServiceError) => {
      console.error("Failed to delete project:", formatValidationError(error));
    },
  });
}
