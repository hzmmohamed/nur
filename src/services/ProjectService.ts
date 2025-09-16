// services/ProjectService.ts
import { redis } from "./upstashRedis";
import { v4 as uuidv4 } from "uuid";
import type {
  Project,
  CreateProjectData,
  UpdateProjectData,
  ProjectQueryParams,
  ProjectSettings,
} from "../types/project";

export class ProjectServiceError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "ProjectServiceError";
  }
}

class ProjectService {
  private readonly PROJECT_KEY_PREFIX = "project:";
  private readonly USER_PROJECTS_KEY_PREFIX = "user_projects:";
  private readonly PROJECT_INDEX_KEY = "projects_index";
  private readonly SEARCH_PREFIX = "search:";

  private getProjectKey(projectId: string): string {
    return `${this.PROJECT_KEY_PREFIX}${projectId}`;
  }

  private getUserProjectsKey(userId: string): string {
    return `${this.USER_PROJECTS_KEY_PREFIX}${userId}`;
  }

  private extractSearchTerms(project: Project): string[] {
    const terms: string[] = [];

    // Extract words from name and description
    const text = `${project.name} ${project.description || ""}`.toLowerCase();
    const words = text.match(/\b\w+\b/g) || [];

    // Add significant words (length > 2)
    words.forEach((word) => {
      if (word.length > 2) {
        terms.push(word);
      }
    });

    return [...new Set(terms)]; // Remove duplicates
  }

  private serializeProject(project: Project): Record<string, string> {
    return {
      id: project.id,
      name: project.name,
      description: project.description || "",
      ownerId: project.ownerId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      collaborators: JSON.stringify(project.collaborators),
      settings: JSON.stringify(project.settings),
      yjsDocumentId: project.yjsDocumentId,
    };
  }

  private deserializeProject(data: Record<string, any>): Project {
    return {
      id: data.id,
      name: data.name,
      description: data.description || undefined,
      ownerId: data.ownerId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      collaborators: JSON.parse(data.collaborators || "[]"),
      settings: JSON.parse(data.settings || "{}"),
      yjsDocumentId: data.yjsDocumentId,
    };
  }

  async createProject(data: CreateProjectData): Promise<Project> {
    try {
      const now = new Date().toISOString();
      const projectId = uuidv4();
      const yjsDocumentId = uuidv4();

      const project: Project = {
        id: projectId,
        name: data.name,
        description: data.description,
        ownerId: data.ownerId,
        createdAt: now,
        updatedAt: now,
        collaborators: [],
        settings: {
          isPublic: false,
          allowComments: true,
          version: "1.0.0",
          ...data.settings,
        },
        yjsDocumentId,
      };

      // Use pipeline for atomic operations
      const pipeline = redis.pipeline();

      // Store project data as hash
      pipeline.hset(
        this.getProjectKey(projectId),
        this.serializeProject(project)
      );

      // Add to projects index (sorted set by timestamp)
      pipeline.zadd(this.PROJECT_INDEX_KEY, {
        score: Date.now(),
        member: projectId,
      });

      // Add to owner's projects set
      pipeline.sadd(this.getUserProjectsKey(data.ownerId), projectId);

      // Add search terms
      const searchTerms = this.extractSearchTerms(project);
      searchTerms.forEach((term) => {
        pipeline.sadd(`${this.SEARCH_PREFIX}${term}`, projectId);
      });

      await pipeline.exec();

      return project;
    } catch (error) {
      throw new ProjectServiceError(`Failed to create project: ${error}`);
    }
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const projectData = await redis.hgetall(this.getProjectKey(projectId));

      if (!projectData || !projectData.id) {
        return null;
      }

      return this.deserializeProject(projectData);
    } catch (error) {
      throw new ProjectServiceError(`Failed to get project: ${error}`);
    }
  }

  async getProjects(params: ProjectQueryParams = {}): Promise<Project[]> {
    try {
      const { userId, limit = 50, offset = 0, search } = params;

      let projectIds: string[] = [];

      if (search) {
        // Search by terms
        const searchTerms = search
          .toLowerCase()
          .split(" ")
          .filter((term) => term.length > 2);

        if (searchTerms.length === 0) {
          return [];
        }

        if (searchTerms.length === 1) {
          projectIds = await redis.smembers(
            `${this.SEARCH_PREFIX}${searchTerms[0]}`
          );
        } else {
          // For multiple terms, get intersection
          const searchKeys = searchTerms.map(
            (term) => `${this.SEARCH_PREFIX}${term}`
          );
          const tempKey = `temp_search_${Date.now()}`;

          await redis.sinterstore(tempKey, ...searchKeys);
          projectIds = await redis.smembers(tempKey);
          await redis.del(tempKey);
        }
      } else if (userId) {
        // Get user's projects
        projectIds = await redis.smembers(this.getUserProjectsKey(userId));
      } else {
        // Get all projects (paginated by score/time)
        projectIds = await redis.zrange(
          this.PROJECT_INDEX_KEY,
          offset,
          offset + limit - 1
        );
      }

      if (projectIds.length === 0) {
        return [];
      }

      // Apply pagination for search and user queries
      if (search || userId) {
        projectIds = projectIds.slice(offset, offset + limit);
      }

      // Fetch all project data in parallel using pipeline
      const pipeline = redis.pipeline();
      projectIds.forEach((id) => {
        pipeline.hgetall(this.getProjectKey(id));
      });

      const results = await pipeline.exec();

      const projects: Project[] = [];
      for (const result of results || []) {
        if (result) {
          const projectData = result as Record<string, any>;
          if (projectData.id) {
            projects.push(projectData);
          }
        }
      }

      // Sort by updatedAt desc
      return projects.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch (error) {
      throw new ProjectServiceError(`Failed to get projects: ${error}`);
    }
  }

  async updateProject(
    projectId: string,
    data: UpdateProjectData
  ): Promise<Project | null> {
    try {
      const existingProject = await this.getProject(projectId);
      if (!existingProject) {
        return null;
      }

      const now = new Date().toISOString();
      const updatedProject: Project = {
        ...existingProject,
        ...data,
        settings: data.settings
          ? { ...existingProject.settings, ...data.settings }
          : existingProject.settings,
        updatedAt: now,
      };

      const pipeline = redis.pipeline();

      // Update project data
      pipeline.hset(
        this.getProjectKey(projectId),
        this.serializeProject(updatedProject)
      );

      // Update search index if name or description changed
      if (data.name || data.description) {
        // Remove old search terms
        const oldSearchTerms = this.extractSearchTerms(existingProject);
        oldSearchTerms.forEach((term) => {
          pipeline.srem(`${this.SEARCH_PREFIX}${term}`, projectId);
        });

        // Add new search terms
        const newSearchTerms = this.extractSearchTerms(updatedProject);
        newSearchTerms.forEach((term) => {
          pipeline.sadd(`${this.SEARCH_PREFIX}${term}`, projectId);
        });
      }

      // Update timestamp in index
      pipeline.zadd(this.PROJECT_INDEX_KEY, {
        score: Date.now(),
        member: projectId,
      });

      await pipeline.exec();

      return updatedProject;
    } catch (error) {
      throw new ProjectServiceError(`Failed to update project: ${error}`);
    }
  }

  async deleteProject(projectId: string): Promise<boolean> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        return false;
      }

      const pipeline = redis.pipeline();

      // Delete project data
      pipeline.del(this.getProjectKey(projectId));

      // Remove from projects index
      pipeline.zrem(this.PROJECT_INDEX_KEY, projectId);

      // Remove from owner's projects
      pipeline.srem(this.getUserProjectsKey(project.ownerId), projectId);

      // Remove from collaborators' projects
      project.collaborators.forEach((collaboratorId) => {
        pipeline.srem(this.getUserProjectsKey(collaboratorId), projectId);
      });

      // Remove from search index
      const searchTerms = this.extractSearchTerms(project);
      searchTerms.forEach((term) => {
        pipeline.srem(`${this.SEARCH_PREFIX}${term}`, projectId);
      });

      await pipeline.exec();

      return true;
    } catch (error) {
      throw new ProjectServiceError(`Failed to delete project: ${error}`);
    }
  }

  async addCollaborator(
    projectId: string,
    userId: string
  ): Promise<Project | null> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        return null;
      }

      if (project.collaborators.includes(userId)) {
        return project; // Already a collaborator
      }

      const updatedProject = await this.updateProject(projectId, {
        collaborators: [...project.collaborators, userId],
      });

      if (updatedProject) {
        // Add project to collaborator's projects list
        await redis.sadd(this.getUserProjectsKey(userId), projectId);
      }

      return updatedProject;
    } catch (error) {
      throw new ProjectServiceError(`Failed to add collaborator: ${error}`);
    }
  }

  async removeCollaborator(
    projectId: string,
    userId: string
  ): Promise<Project | null> {
    try {
      const project = await this.getProject(projectId);
      if (!project) {
        return null;
      }

      const updatedCollaborators = project.collaborators.filter(
        (id) => id !== userId
      );
      const updatedProject = await this.updateProject(projectId, {
        collaborators: updatedCollaborators,
      });

      if (updatedProject) {
        // Remove project from collaborator's projects list
        await redis.srem(this.getUserProjectsKey(userId), projectId);
      }

      return updatedProject;
    } catch (error) {
      throw new ProjectServiceError(`Failed to remove collaborator: ${error}`);
    }
  }
}

export const projectService = new ProjectService();
