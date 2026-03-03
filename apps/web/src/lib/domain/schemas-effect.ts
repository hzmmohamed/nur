/**
 * Effect schemas for animation domain entities
 * Used with typed Yjs wrappers for validation
 */

import { Schema as S } from "effect";

// Coordinate types
export const PointSchema = S.Struct({
  x: S.Number,
  y: S.Number,
});

export const PolarHandleSchema = S.Struct({
  angle: S.Number,
  distance: S.Number,
});

export const BezierPointSchema = S.Struct({
  position: PointSchema,
  handleIn: S.NullOr(PolarHandleSchema),
  handleOut: S.NullOr(PolarHandleSchema),
});

export const BoundsSchema = S.Struct({
  minX: S.Number,
  minY: S.Number,
  maxX: S.Number,
  maxY: S.Number,
});

// Animation Frame
export const AnimationFrameSchema = S.Struct({
  id: S.UUID.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => crypto.randomUUID())
  ),
  index: S.Number,
  timestamp: S.Number,
  duration: S.optional(S.Number),
  thumbnailUrl: S.optional(S.NonEmptyString),
  metadata: S.optional(S.Record({ key: S.NonEmptyString, value: S.Unknown })),
  order: S.Number,
});

// Path data (stored in nested Y.Map)
export const PathDataSchema = S.Struct({
  points: S.Array(BezierPointSchema),
  closed: S.Boolean,
});

export const ClosedPathDataSchema = S.Struct({
  points: S.Array(BezierPointSchema).pipe(S.minItems(3)),
  closed: S.Literal(true),
});

// export const GranularPathDataSchema = S.Struct({
//   pointsArray: S.Unknown, // Y.Array type, can't validate structure
//   closed: S.Boolean,
// });

// Masking Shape
export const MaskingShapeSchema = S.Struct({
  id: S.UUID.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => crypto.randomUUID())
  ),
  frameId: S.UUID,
  pathData: ClosedPathDataSchema,
});

// Masking Layer
export const MaskingLayerSchema = S.Struct({
  id: S.UUID.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => crypto.randomUUID())
  ),
  name: S.NonEmptyString,
  visible: S.Boolean.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => true)
  ),
  order: S.Number.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => 0)
  ),
  color: S.optional(S.NonEmptyString),
  metadata: S.optional(S.Record({ key: S.NonEmptyString, value: S.Unknown })),
  framesToShapesMap: S.Record({
    key: S.UUID.annotations({ description: "Frame Unique ID" }),
    value: S.Record({
      key: S.UUID.annotations({ description: "Masking Shape Unique ID" }),
      value: MaskingShapeSchema,
    }),
  }),
});

// Lighting Layer Shape
export const LightingLayerShapeSchema = S.Struct({
  id: S.UUID.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => crypto.randomUUID())
  ),
  frameId: S.UUID,
  baseColor: S.NonEmptyString,
  intensity: S.Number.pipe(S.clamp(0, 1)).pipe(
    S.propertySignature,
    S.withConstructorDefault(() => 1.0)
  ),
  falloffType: S.Literal("linear", "exponential", "smooth").pipe(
    S.propertySignature,
    S.withConstructorDefault(() => "linear" as const)
  ),
  innerPathData: ClosedPathDataSchema,
  outerPathData: ClosedPathDataSchema,
});

// Lighting Layer
export const BlendModeSchema = S.Literal(
  "normal",
  "add",
  "multiply",
  "screen",
  "overlay"
);

export const LightingLayerSchema = S.Struct({
  id: S.UUID.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => crypto.randomUUID())
  ),
  maskingLayerId: S.NonEmptyString,
  name: S.NonEmptyString,
  visible: S.Boolean.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => true)
  ),
  order: S.Number.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => 0)
  ),
  blendMode: BlendModeSchema.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => "normal" as const)
  ),
  opacity: S.Number.pipe(S.clamp(0, 1)).pipe(
    S.propertySignature,
    S.withConstructorDefault(() => 1.0)
  ),
  metadata: S.optional(S.Record({ key: S.NonEmptyString, value: S.Unknown })),
  framesToShapesMap: S.Record({
    key: S.UUID.annotations({ description: "Frame Unique ID" }),
    value: S.Record({
      key: S.UUID.annotations({ description: "Lighting Shape Unique ID" }),
      value: LightingLayerShapeSchema,
    }),
  }),
});

// Animation Project
export const AnimationProjectSchema = S.Struct({
  id: S.UUID.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => crypto.randomUUID())
  ),
  name: S.NonEmptyString.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => "Untitled Project")
  ),
  frameRate: S.Number.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => 30)
  ),
  width: S.Number.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => 1920)
  ),
  height: S.Number.pipe(
    S.propertySignature,
    S.withConstructorDefault(() => 1080)
  ),
  framesMap: S.Record({ key: S.UUID, value: AnimationFrameSchema }),
  maskingLayersMap: S.Record({ key: S.UUID, value: MaskingLayerSchema }),
  lightingLayersMap: S.Record({ key: S.UUID, value: LightingLayerSchema }),
});

// Type exports - Input types for constructors (fields with defaults are optional)
export type AnimationFrameInputData = S.Schema.Encoded<
  typeof AnimationFrameSchema
>;
export type MaskingShapeInputData = S.Schema.Encoded<typeof MaskingShapeSchema>;
export type MaskingLayerInputData = S.Schema.Encoded<typeof MaskingLayerSchema>;
export type LightingLayerShapeInputData = S.Schema.Encoded<
  typeof LightingLayerShapeSchema
>;
export type LightingLayerInputData = S.Schema.Encoded<
  typeof LightingLayerSchema
>;
export type AnimationProjectInputData = S.Schema.Encoded<
  typeof AnimationProjectSchema
>;

// Output types (all fields as stored in YDoc)
export type AnimationFrameData = S.Schema.Type<typeof AnimationFrameSchema>;
export type MaskingShapeData = S.Schema.Type<typeof MaskingShapeSchema>;
export type MaskingLayerData = S.Schema.Type<typeof MaskingLayerSchema>;
export type LightingLayerShapeData = S.Schema.Type<
  typeof LightingLayerShapeSchema
>;
export type LightingLayerData = S.Schema.Type<typeof LightingLayerSchema>;
export type AnimationProjectData = S.Schema.Type<typeof AnimationProjectSchema>;
