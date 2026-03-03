/**
 * Zod schemas for animation domain entities
 * Used with typed Yjs wrappers for validation
 */

import z from 'zod';

// Coordinate types
export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const PolarHandleSchema = z.object({
  angle: z.number(),
  distance: z.number(),
});

export const BezierPointSchema = z.object({
  position: PointSchema,
  handleIn: PolarHandleSchema.nullable(),
  handleOut: PolarHandleSchema.nullable(),
});

export const BoundsSchema = z.object({
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
});

// Animation Frame
export const AnimationFrameSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  index: z.number(),
  timestamp: z.number(),
  duration: z.number().optional(),
  thumbnailUrl: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  order: z.number(),
});

// Path data (stored in nested Y.Map)
export const PathDataSchema = z.object({
  points: z.array(BezierPointSchema),
  closed: z.boolean(),
});

export const GranularPathDataSchema = z.object({
  pointsArray: z.any(), // Y.Array type, can't validate structure
  closed: z.boolean(),
});

// Masking Shape
export const MaskingShapeSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  frameId: z.string(),
  pathData: z.any(), // Nested Y.Map, validated separately
});

// Masking Layer
export const MaskingLayerSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  name: z.string(),
  visible: z.boolean().default(true),
  order: z.number().default(0),
  color: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  shapes: z.any(), // Y.Map<frameId, Y.Array<shapeYmap>>, validated separately
});

// Lighting Layer Shape
export const LightingLayerShapeSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  frameId: z.string(),
  baseColor: z.string(),
  intensity: z.number().min(0).max(1).default(1.0),
  falloffType: z.enum(['linear', 'exponential', 'smooth']).default('linear'),
  innerPathData: z.any(), // Nested Y.Map, validated separately
  outerPathData: z.any(), // Nested Y.Map, validated separately
});

// Lighting Layer
export const BlendModeSchema = z.object({
  type: z.enum(['normal', 'add', 'multiply', 'screen', 'overlay']),
});

export const LightingLayerSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  maskingLayerId: z.string(),
  name: z.string(),
  visible: z.boolean().default(true),
  order: z.number().default(0),
  blendMode: BlendModeSchema.default({ type: 'normal' }),
  opacity: z.number().min(0).max(1).default(1.0),
  metadata: z.record(z.string(), z.any()).optional(),
  shapes: z.any(), // Y.Map<frameId, Y.Array<shapeYmap>>, validated separately
});

// Animation Project
export const AnimationProjectSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  name: z.string().default('Untitled Project'),
  frameRate: z.number().default(30),
  width: z.number().default(1920),
  height: z.number().default(1080),
  metadata: z.record(z.string(), z.any()).optional(),
  frames: z.any(), // Y.Array, validated separately
  maskingLayers: z.any(), // Y.Array, validated separately
  lightingLayers: z.any(), // Y.Array, validated separately
});

// Type exports - Input types for constructors (fields with defaults are optional)
export type AnimationFrameInputData = z.input<typeof AnimationFrameSchema>;
export type MaskingShapeInputData = z.input<typeof MaskingShapeSchema>;
export type MaskingLayerInputData = z.input<typeof MaskingLayerSchema>;
export type LightingLayerShapeInputData = z.input<typeof LightingLayerShapeSchema>;
export type LightingLayerInputData = z.input<typeof LightingLayerSchema>;
export type AnimationProjectInputData = z.input<typeof AnimationProjectSchema>;

// Output types (all fields as stored in YDoc)
export type AnimationFrameData = z.infer<typeof AnimationFrameSchema>;
export type MaskingShapeData = z.infer<typeof MaskingShapeSchema>;
export type MaskingLayerData = z.infer<typeof MaskingLayerSchema>;
export type LightingLayerShapeData = z.infer<typeof LightingLayerShapeSchema>;
export type LightingLayerData = z.infer<typeof LightingLayerSchema>;
export type AnimationProjectData = z.infer<typeof AnimationProjectSchema>;
