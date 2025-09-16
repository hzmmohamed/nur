// types/project.ts
import { z } from "zod";

// Zod schemas for validation
export const ProjectSettingsSchema = z.object({
  isPublic: z.boolean().default(false),
  allowComments: z.boolean().default(true),
  version: z.string().default("1.0.0"),
});

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name too long"),
  description: z.string().optional(),
  ownerId: z.string().min(1, "Owner ID is required"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  collaborators: z.array(z.string()).default([]),
  settings: ProjectSettingsSchema,
  yjsDocumentId: z.string().uuid(),

  // Canvas/Scene properties from ProjectCard
  canvasWidth: z.number().int().positive().default(1920),
  canvasHeight: z.number().int().positive().default(1080),
  fps: z.number().int().positive().min(1).max(120).default(30),
  framesCount: z.number().int().nonnegative().default(0),
  thumbnailBase64: z.string().optional(),

  // Additional metadata
  lastUpdatedAt: z.string().datetime().optional(),
});

export const CreateProjectDataSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name too long"),
  description: z.string().max(500, "Description too long").optional(),
  ownerId: z.string().min(1, "Owner ID is required"),
  settings: ProjectSettingsSchema.partial().optional(),

  // Canvas/Scene properties
  canvasWidth: z.number().int().positive().default(1920),
  canvasHeight: z.number().int().positive().default(1080),
  fps: z.number().int().positive().min(1).max(120).default(30),
  thumbnailBase64: z.string().optional(),
});

export const UpdateProjectDataSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name too long")
    .optional(),
  description: z.string().max(500, "Description too long").optional(),
  settings: ProjectSettingsSchema.partial().optional(),
  collaborators: z.array(z.string()).optional(),

  // Canvas/Scene properties
  canvasWidth: z.number().int().positive().optional(),
  canvasHeight: z.number().int().positive().optional(),
  fps: z.number().int().positive().min(1).max(120).optional(),
  framesCount: z.number().int().nonnegative().optional(),
  thumbnailBase64: z.string().optional(),
});

export const ProjectQueryParamsSchema = z.object({
  userId: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
  search: z.string().optional(),
});

// Infer TypeScript types from Zod schemas
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type CreateProjectData = z.infer<typeof CreateProjectDataSchema>;
export type UpdateProjectData = z.infer<typeof UpdateProjectDataSchema>;
export type ProjectQueryParams = z.infer<typeof ProjectQueryParamsSchema>;
