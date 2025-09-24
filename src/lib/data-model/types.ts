import { z } from "zod";

// Point with handles for cubic bezier curves
export const PointSchema = z.object({
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  handleIn: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .nullable(), // null for first point in open paths
  handleOut: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .nullable(), // null for last point in open paths
});

// Cubic bezier path - collection of points
export const BezierPathSchema = z.object({
  id: z.string(),
  points: z.array(PointSchema),
  closed: z.boolean(), // true for complete masks, false while drawing/editing
  visible: z.boolean().default(true),
  name: z.string().optional(),
});

// Layer-Frame mask data - contains all bezier paths for a specific layer in a specific frame
export const LayerFrameMaskSchema = z.object({
  layerId: z.string(),
  frameId: z.string(),
  paths: z.array(BezierPathSchema),
});

// Frame entity
export const FrameSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  index: z.number(), // frame index in sequence (0, 1, 2, ...)
  imageUrl: z.string().optional(), // reference to frame image
  metadata: z.record(z.any(), z.any()).optional(), // arbitrary metadata
});

// Layer entity
export const LayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  blendMode: z.enum(["normal"]).default("normal"),
  color: z.string().optional(), // layer color for UI
  metadata: z.record(z.any(), z.any()).optional(), // arbitrary metadata
});

// User selection state
export const UserSelectionSchema = z.object({
  userId: z.string(),
  selectedLayerId: z.string().nullable(),
  selectedFrameId: z.string().nullable(),
  selectedPathIds: z.array(z.string()).default([]),
  selectedPointIndices: z.array(z.number()).default([]), // for editing individual points
});

// Project root schema
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  lastModified: z.number(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Type definitions
export type Point = z.infer<typeof PointSchema>;
export type BezierPath = z.infer<typeof BezierPathSchema>;
export type LayerFrameMask = z.infer<typeof LayerFrameMaskSchema>;
export type Frame = z.infer<typeof FrameSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type UserSelection = z.infer<typeof UserSelectionSchema>;
export type Project = z.infer<typeof ProjectSchema>;
