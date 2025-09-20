// types/project.ts
import { z } from "zod";

// Zod schemas for validation
export const ProjectSettingsSchema = z.object({
  isPublic: z.boolean().default(false),
  allowComments: z.boolean().default(true),
});

export const ProjectSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name too long"),
  description: z.string().optional(),
  ownerId: z.string().min(1, "Owner ID is required"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  collaborators: z.array(z.string()).default([]),
  settings: ProjectSettingsSchema,
  yjsDocumentId: z.uuid(),

  // Canvas/Scene properties from ProjectCard
  canvasWidth: z.number().int().positive().default(1920),
  canvasHeight: z.number().int().positive().default(1080),
  fps: z.number().int().positive().min(1).max(120).default(30),
  thumbnailBase64: z.string().optional(),
});

export const CreateProjectDataSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name too long"),
  description: z.string().max(500, "Description too long").optional(),
  ownerId: z.string().min(1, "Owner ID is required"),
  settings: ProjectSettingsSchema.default({
    allowComments: false,
    isPublic: false,
  }),

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
