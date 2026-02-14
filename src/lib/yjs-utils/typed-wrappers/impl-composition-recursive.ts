import * as S from "effect/Schema";
import { ParseError } from "effect/ParseResult";
import * as Y from "yjs";
import { nested } from "effect/Config";
import type {
  AnimationProjectSchema,
  LightingLayerSchema,
  LightingLayerShapeSchema,
} from "@/lib/domain/schemas-effect";

// -----------------------------------------------------------------------------
// 1. Types and Error Class
// -----------------------------------------------------------------------------

/**
 * MapSchema now accepts BOTH Struct and Record as top-level schemas
 */
export type MapSchema<
  A extends Record<string, any>,
  TInput = unknown
> = S.Schema<A, TInput>;

export class TypedYMapValidationError extends Error {
  constructor(message: string, public readonly parseError?: ParseError) {
    super(message);
    this.name = "TypedYMapValidationError";
  }
}

// -----------------------------------------------------------------------------
// 2. Type-Level Field Classification (ENHANCED)
// -----------------------------------------------------------------------------

/**
 * Check if a schema is a Struct (TypeLiteral with fields)
 */
type IsTypeLiteral<T> = T extends S.Schema<any, any>
  ? T extends S.Struct<Record<keyof T["fields"], S.Struct.Field>>
    ? true
    : false
  : false;

/**
 * Check if a schema is a Record
 */
type IsRecord<T> = T extends S.Record$<S.Schema.All, S.Schema.All>
  ? true
  : false;

/**
 * Extract the schema for a specific field from a Struct TSchema
 * Used for: getNestedMap(), getFromRecord() (when TSchema is Struct)
 */
type ExtractFieldSchema<TSchema, K> = TSchema extends S.Struct<infer Fields>
  ? K extends keyof Fields
    ? Fields[K]
    : never
  : never;

/**
 * Extract the value schema from a top-level Record TSchema
 * Used for: getNestedRecord(), getSimpleValue() (when TSchema is Record)
 */
type ExtractRecordValueSchema<T> = T extends S.Record$<S.Schema.All, any>
  ? T["value"]
  : never;

/**
 * Check if a Record's value schema is complex (Struct or nested Record)
 */
type IsComplexRecordValue<T> = T extends S.Schema<any, any>
  ? IsTypeLiteral<T> extends true
    ? true
    : IsRecord<T> extends true
    ? true
    : false
  : false;

/**
 * Check if a Record's value schema is a Struct specifically
 */
type IsStructRecordValue<T> = T extends S.Schema<any, any>
  ? T extends S.Struct<any>
    ? true
    : false
  : false;

/**
 * Check if a Record's value schema is another Record
 */
type IsRecordRecordValue<T> = T extends S.Schema<any, any>
  ? IsRecord<T> extends true
    ? true
    : false
  : false;

/**
 * SCENARIO 2: Extract keys where the field is a nested Struct (TypeLiteral)
 * Only applies when TSchema is a Struct
 */
type NestedStructKeys<TSchema extends MapSchema<any, any>> =
  TSchema extends S.Struct<infer Fields>
    ? {
        [K in keyof S.Schema.Type<TSchema>]: Fields[K] extends S.Schema<
          any,
          any
        >
          ? IsTypeLiteral<Fields[K]> extends true
            ? K
            : never
          : never;
      }[keyof S.Schema.Type<TSchema>]
    : never;

/**
 * SCENARIO 3: Extract keys where the field is a Record with SIMPLE values
 * Only applies when TSchema is a Struct
 */
type SimpleRecordKeys<TSchema extends MapSchema<any, any>> =
  TSchema extends S.Struct<infer Fields>
    ? {
        [K in keyof S.Schema.Type<TSchema>]: Fields[K] extends S.Schema<
          any,
          any
        >
          ? IsRecord<Fields[K]> extends true
            ? IsComplexRecordValue<
                ExtractRecordValueSchema<Fields[K]>
              > extends false
              ? K
              : never
            : never
          : never;
      }[keyof S.Schema.Type<TSchema>]
    : never;

/**
 * SCENARIO 4: Extract keys where the field is a Record with Struct values
 * Only applies when TSchema is a Struct
 */
type RecordWithStructKeys<TSchema extends MapSchema<any, any>> =
  TSchema extends S.Struct<infer Fields>
    ? {
        [K in keyof S.Schema.Type<TSchema>]: Fields[K] extends S.Schema<
          any,
          any
        >
          ? IsRecord<Fields[K]> extends true
            ? IsStructRecordValue<
                ExtractRecordValueSchema<Fields[K]>
              > extends true
              ? K
              : never
            : never
          : never;
      }[keyof S.Schema.Type<TSchema>]
    : never;

/**
 * SCENARIO 5: Extract keys where the field is a Record with Record values (nested records)
 * Only applies when TSchema is a Struct
 */
type RecordWithRecordKeys<TSchema extends MapSchema<any, any>> =
  TSchema extends S.Struct<infer Fields>
    ? {
        [K in keyof S.Schema.Type<TSchema>]: Fields[K] extends S.Schema<
          any,
          any
        >
          ? IsRecord<Fields[K]> extends true
            ? IsRecordRecordValue<
                ExtractRecordValueSchema<Fields[K]>
              > extends false
              ? K
              : never
            : never
          : never;
      }[keyof S.Schema.Type<TSchema>]
    : never;

/**
 * Union of all complex record keys (for backwards compatibility)
 */
type RecordKeys<TSchema extends MapSchema<any, any>> =
  | RecordWithStructKeys<TSchema>
  | RecordWithRecordKeys<TSchema>;

/**
 * SCENARIO 1: Extract keys that are simple (primitives, arrays, etc.)
 * Only applies when TSchema is a Struct
 */

type SimpleKeys<TSchema extends MapSchema<any, any>> =
  TSchema extends S.Struct<any>
    ? Exclude<
        keyof S.Schema.Type<TSchema>,
        | NestedStructKeys<TSchema>
        | SimpleRecordKeys<TSchema>
        | RecordWithStructKeys<TSchema>
        | RecordWithRecordKeys<TSchema>
      >
    : never;

// -----------------------------------------------------------------------------
// 3. Schema AST Traversal Helper
// -----------------------------------------------------------------------------

function isNestedStructSchema(schema: S.Schema<any>): boolean {
  return (
    schema.ast._tag === "TypeLiteral" &&
    schema.ast.propertySignatures.length > 0 &&
    schema.ast.indexSignatures.length === 0
  );
}

function isRecordSchema(schema: S.Schema<any>): boolean {
  return (
    schema.ast._tag === "TypeLiteral" &&
    schema.ast.propertySignatures.length === 0 &&
    schema.ast.indexSignatures.length > 0
  );
}

function getRecordValueSchema(schema: S.Schema<any>): S.Schema<any> | null {
  if (
    schema.ast._tag === "TypeLiteral" &&
    "indexSignatures" in schema.ast &&
    Array.isArray(schema.ast.indexSignatures) &&
    schema.ast.indexSignatures.length > 0
  ) {
    // @ts-expect-error
    return schema.value;
  }
  return null;
}

function isComplexValueSchema(schema: S.Schema<any>): boolean {
  return isNestedStructSchema(schema) || isRecordSchema(schema);
}

/**
 * NEW: Classify the type of record value for runtime branching
 */
type RecordValueType = "simple" | "struct" | "record" | "unknown";

function classifyRecordValueType(schema: S.Schema<any>): RecordValueType {
  const valueSchema = getRecordValueSchema(schema);
  if (!valueSchema) return "unknown";

  if (isNestedStructSchema(valueSchema)) return "struct";
  if (isRecordSchema(valueSchema)) return "record";
  return "simple";
}

// -----------------------------------------------------------------------------
// 4. TypedYMap Class - NOW SUPPORTS BOTH STRUCT AND RECORD TOP-LEVEL SCHEMAS
// -----------------------------------------------------------------------------

export class TypedYMap<
  TSchema extends MapSchema<any, any>,
  A = S.Schema.Type<TSchema>
> {
  private readonly ymap: Y.Map<any>;
  public readonly schema: TSchema;
  private readonly nestedMapCache = new Map<keyof A, TypedYMap<any>>();

  /**
   * Track whether this TypedYMap wraps a Struct or Record at the top level
   */
  private readonly isTopLevelRecord: boolean;

  private constructor(ymap: Y.Map<any>, schema: TSchema) {
    this.ymap = ymap;
    this.schema = schema;
    this.isTopLevelRecord = isRecordSchema(schema);

    if (!this.isTopLevelRecord) {
      // Only initialize nested maps for Struct schemas
      this.initializeNestedMaps();
    }
  }

  public static create<TSchema extends MapSchema<any, any>>(
    schema: TSchema,
    ymap: Y.Map<any> = new Y.Map(),
    initialData?: Partial<S.Schema.Type<TSchema>>
  ): TypedYMap<TSchema> {
    const typedMap = new TypedYMap<TSchema>(ymap, schema);

    if (initialData) {
      typedMap.update(initialData);
    }

    return typedMap;
  }

  private initializeNestedMaps(): void {
    // Only called for Struct schemas
    // @ts-expect-error
    const fields = this.schema.fields as Record<keyof A, S.Schema<any>>;

    for (const key in fields) {
      const fieldSchema = fields[key];

      if (isNestedStructSchema(fieldSchema)) {
        // SCENARIO 2: Handle nested Struct
        const nestedYMap = new Y.Map();
        this.ymap.set(key as string, nestedYMap);
        const nestedTypedMap = new TypedYMap(nestedYMap, fieldSchema);
        // @ts-expect-error
        this.nestedMapCache.set(key, nestedTypedMap);
      } else if (isRecordSchema(fieldSchema)) {
        const recordValueType = classifyRecordValueType(fieldSchema);

        // Initialize an empty Y.Map for all record types
        const recordYMap = new Y.Map();
        this.ymap.set(key as string, recordYMap);

        // SCENARIO 3: Simple records - just Y.Map, no nested structure needed
        // SCENARIO 4 & 5: Complex records - nested maps created on-demand in get/set
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Validation Logic
  // ---------------------------------------------------------------------------

  private validateValue<K extends keyof A>(key: K, value: A[K]): A[K] {
    if (!this.schema) return value;

    const structSchema = this.schema as S.Schema<A, unknown>;
    const partialSchema = S.partial(structSchema);
    const validationObject = { [key]: value };

    try {
      const result = S.decodeUnknownSync(partialSchema)(validationObject);
      return result[key]!;
    } catch (error) {
      if (error instanceof ParseError) {
        throw new TypedYMapValidationError(
          `Validation failed for key "${String(key)}": ${error.message}`,
          error
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Public Accessors - TYPE-SAFE SEPARATION
  // ---------------------------------------------------------------------------

  /**
   * SCENARIO 1: Get a simple (non-struct, non-record) field value.
   * Only works when TSchema is a Struct.
   */
  // @ts-expect-error
  public get<K extends SimpleKeys<TSchema>>(key: K): A[K] | undefined {
    if (this.isTopLevelRecord) {
      throw new Error(
        "Cannot use get() on a Record schema. Use getRecordValue() instead."
      );
    }
    // @ts-expect-error
    return this.ymap.get(key as string) as A[K] | undefined;
  }

  /**
   * SCENARIO 2: Get a nested struct field as a TypedYMap wrapper.
   * Only accepts keys that correspond to nested struct fields.
   * Only works when TSchema is a Struct.
   */
  public getNestedMap<K extends NestedStructKeys<TSchema>>(
    key: K
  ): TypedYMap<ExtractFieldSchema<TSchema, K>> | undefined {
    if (this.isTopLevelRecord) {
      throw new Error("Cannot use getNestedMap() on a Record schema.");
    }
    return this.nestedMapCache.get(key as keyof A) as any;
  }

  /**
   * SCENARIO 3: Get a simple record field as a plain object.
   * Only works when TSchema is a Struct.
   */
  public getSimpleRecord<K extends SimpleRecordKeys<TSchema>>(
    key: K
  ): Record<string, any> | undefined {
    if (this.isTopLevelRecord) {
      throw new Error(
        "Cannot use getSimpleRecord() on a Record schema. Use toObject() instead."
      );
    }
    const recordMap = this.ymap.get(key as string);
    if (recordMap instanceof Y.Map) {
      return Object.fromEntries(recordMap.entries());
    }
    return undefined;
  }

  /**
   * SCENARIO 3: Get a single value from a simple record field.
   * Only works when TSchema is a Struct.
   */
  public getFromSimpleRecord<K extends SimpleRecordKeys<TSchema>>(
    fieldKey: K,
    recordKey: string
  ): any | undefined {
    if (this.isTopLevelRecord) {
      throw new Error("Cannot use getFromSimpleRecord() on a Record schema.");
    }
    const recordMap = this.ymap.get(fieldKey as string);
    if (recordMap instanceof Y.Map) {
      return recordMap.get(recordKey);
    }
    return undefined;
  }

  /**
   * SCENARIO 4 & 5: Get a complex record field's Y.Map for dynamic key access.
   * Only works when TSchema is a Struct.
   */
  public getRecordMap<K extends RecordKeys<TSchema>>(
    key: K
  ): Y.Map<any> | undefined {
    if (this.isTopLevelRecord) {
      throw new Error(
        "Cannot use getRecordMap() on a Record schema. Use getRawYMap() instead."
      );
    }
    const recordMap = this.ymap.get(key as string);
    if (recordMap instanceof Y.Map) {
      return recordMap;
    }
    return undefined;
  }

  /**
   * SCENARIO 4 & 5: Get a value from a complex record field with a specific dynamic key.
   * Only works when TSchema is a Struct with Record fields.
   * Returns a TypedYMap wrapping the Record's value schema.
   */
  public getFromRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    recordKey: string
  ):
    | TypedYMap<ExtractRecordValueSchema<ExtractFieldSchema<TSchema, K>>>
    | undefined {
    if (this.isTopLevelRecord) {
      throw new Error(
        "Cannot use getFromRecord() on a top-level Record schema. Use getNestedRecord() instead."
      );
    }

    const recordMap = this.getRecordMap(fieldKey as any);
    if (!recordMap) return undefined;

    // @ts-expect-error
    const fieldSchema = this.schema.fields[fieldKey];
    const valueSchema = getRecordValueSchema(fieldSchema);

    if (!valueSchema || !isComplexValueSchema(valueSchema)) {
      return undefined;
    }

    let nestedYMap = recordMap.get(recordKey);

    // If it doesn't exist yet, create it
    if (!nestedYMap) {
      nestedYMap = new Y.Map();
      recordMap.set(recordKey, nestedYMap);
    }

    // Wrap in TypedYMap
    return new TypedYMap(nestedYMap, valueSchema) as any;
  }

  /**
   * NEW: For top-level Record schemas with complex values, get a nested TypedYMap by record key.
   * Only works when TSchema is a Record with complex (Struct/Record) values.
   * Returns a TypedYMap wrapping the Record's value schema.
   */
  public getNestedRecord(
    recordKey: string
  ): TSchema extends S.Record$<any, infer V>
    ? IsComplexRecordValue<V> extends true
      ? TypedYMap<V> | undefined
      : never
    : never {
    if (!this.isTopLevelRecord) {
      throw new Error(
        "getNestedRecord() only works on top-level Record schemas."
      );
    }

    const valueSchema = getRecordValueSchema(this.schema);
    if (!valueSchema || !isComplexValueSchema(valueSchema)) {
      throw new Error(
        "getNestedRecord() only works with complex (Struct/Record) value schemas. Use getSimpleValue() for simple values."
      );
    }

    let nestedYMap = this.ymap.get(recordKey);

    // If it doesn't exist yet, create it
    if (!nestedYMap) {
      nestedYMap = new Y.Map();
      this.ymap.set(recordKey, nestedYMap);
    }

    // Wrap in TypedYMap with the Record's value schema
    return new TypedYMap(nestedYMap, valueSchema) as any;
  }

  /**
   * NEW: For top-level Record schemas with SIMPLE values, get a value by record key.
   * Only works when TSchema is a Record with simple (non-Struct, non-Record) values.
   */
  public getSimpleValue(
    recordKey: string
  ): TSchema extends S.Record$<any, infer V>
    ? IsComplexRecordValue<V> extends false
      ? S.Schema.Type<V> | undefined
      : never
    : never {
    if (!this.isTopLevelRecord) {
      throw new Error(
        "getSimpleValue() only works on top-level Record schemas."
      );
    }

    const valueSchema = getRecordValueSchema(this.schema);
    if (!valueSchema) {
      throw new Error("Cannot extract value schema from Record");
    }

    if (isComplexValueSchema(valueSchema)) {
      throw new Error(
        "getSimpleValue() only works with simple value schemas. Use getNestedRecord() for complex values."
      );
    }

    return this.ymap.get(recordKey) as any;
  }

  /**
   * NEW: For top-level Record schemas with SIMPLE values, set a value by record key.
   * Only works when TSchema is a Record with simple (non-Struct, non-Record) values.
   */
  public setSimpleValue(
    recordKey: string,
    value: TSchema extends S.Record$<any, infer V>
      ? IsComplexRecordValue<V> extends false
        ? S.Schema.Type<V>
        : never
      : never
  ): void {
    if (!this.isTopLevelRecord) {
      throw new Error(
        "setSimpleValue() only works on top-level Record schemas."
      );
    }

    const valueSchema = getRecordValueSchema(this.schema);
    if (!valueSchema) {
      throw new Error("Cannot extract value schema from Record");
    }

    if (isComplexValueSchema(valueSchema)) {
      throw new Error(
        "setSimpleValue() only works with simple value schemas. Use setRecordValue() for complex values."
      );
    }

    // Could add validation here if needed
    this.ymap.set(recordKey, value);
  }

  /**
   * NEW: For top-level Record schemas, get a value by key.
   * Returns TypedYMap for complex values, raw value for simple values.
   *
   * @deprecated Use getNestedRecord() for complex values or getSimpleValue() for simple values instead.
   */
  public getRecordValue(recordKey: string): any {
    if (!this.isTopLevelRecord) {
      throw new Error("getRecordValue() only works on Record schemas.");
    }

    const valueSchema = getRecordValueSchema(this.schema);
    if (!valueSchema) return undefined;

    const rawValue = this.ymap.get(recordKey);
    if (rawValue === undefined) return undefined;

    if (isComplexValueSchema(valueSchema)) {
      // Return wrapped TypedYMap for complex values
      if (rawValue instanceof Y.Map) {
        return new TypedYMap(rawValue, valueSchema);
      }
      // Create if doesn't exist
      const newYMap = new Y.Map();
      this.ymap.set(recordKey, newYMap);
      return new TypedYMap(newYMap, valueSchema);
    }

    // Return raw value for simple types
    return rawValue;
  }

  /**
   * NEW: For top-level Record schemas, set a value by key.
   *
   * @deprecated Use setSimpleValue() for simple values. For complex values, get the nested map first.
   */
  public setRecordValue(recordKey: string, value: any): void {
    if (!this.isTopLevelRecord) {
      throw new Error("setRecordValue() only works on Record schemas.");
    }

    const valueSchema = getRecordValueSchema(this.schema);
    if (!valueSchema) {
      throw new Error("Cannot extract value schema from Record");
    }

    const recordValueType = classifyRecordValueType(this.schema);

    if (recordValueType === "simple") {
      // Direct set for simple values
      this.ymap.set(recordKey, value);
    } else if (recordValueType === "struct" || recordValueType === "record") {
      // Create nested Y.Map for complex values
      const nestedYMap = new Y.Map();
      const nestedTypedMap = new TypedYMap(nestedYMap, valueSchema);
      nestedTypedMap.update(value);
      this.ymap.set(recordKey, nestedYMap);
    }
  }

  /**
   * NEW: Get the raw underlying Y.Map (useful for Record schemas)
   */
  public getRawYMap(): Y.Map<any> {
    return this.ymap;
  }

  /**
   * SCENARIO 1: Safe version of get for simple fields with validation.
   */
  // @ts-expect-error
  public getSafe<K extends SimpleKeys<TSchema>>(key: K): A[K] | undefined {
    if (this.isTopLevelRecord) {
      throw new Error("Cannot use getSafe() on a Record schema.");
    }
    const value = this.ymap.get(key as string);
    if (value === undefined) return undefined;

    try {
      // @ts-expect-error
      return this.validateValue(key as keyof A, value);
    } catch (error) {
      console.warn(`Value for key "${String(key)}" failed validation:`, error);
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Public Mutators
  // ---------------------------------------------------------------------------

  /**
   * SCENARIO 3: Set a single entry in a simple record field.
   * Only works when TSchema is a Struct.
   */
  public setInSimpleRecord<K extends SimpleRecordKeys<TSchema>>(
    fieldKey: K,
    recordKey: string,
    value: any
  ): void {
    if (this.isTopLevelRecord) {
      throw new Error(
        "Cannot use setInSimpleRecord() on a Record schema. Use setRecordValue() instead."
      );
    }

    let recordMap = this.ymap.get(fieldKey as string);

    if (!(recordMap instanceof Y.Map)) {
      recordMap = new Y.Map();
      this.ymap.set(fieldKey as string, recordMap);
    }

    recordMap.set(recordKey, value);
  }

  public set<K extends keyof A>(key: K, value: A[K]): void {
    if (this.isTopLevelRecord) {
      // For top-level Records, use setRecordValue
      this.setRecordValue(key as string, value);
      return;
    }

    const nestedMap = this.nestedMapCache.get(key);

    if (nestedMap) {
      // SCENARIO 2: Handle nested Struct
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError(
          `Cannot set non-object value for nested struct key "${String(key)}"`
        );
      }
      nestedMap.update(value as Partial<A[K]>);
    } else {
      // @ts-expect-error
      const fieldSchema = this.schema.fields[key];

      if (isRecordSchema(fieldSchema)) {
        // Handle all Record field types
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          throw new TypeError(
            `Cannot set non-object value for record key "${String(key)}"`
          );
        }

        const recordValueType = classifyRecordValueType(fieldSchema);
        const valueSchema = getRecordValueSchema(fieldSchema);

        let recordMap = this.ymap.get(key as string);
        if (!(recordMap instanceof Y.Map)) {
          recordMap = new Y.Map();
          this.ymap.set(key as string, recordMap);
        }

        // Clear existing entries
        recordMap.clear();

        // Set new entries based on value type
        for (const [recordKey, recordValue] of Object.entries(value)) {
          if (recordValueType === "simple") {
            // SCENARIO 3: Simple value - direct set
            recordMap.set(recordKey, recordValue);
          } else if (
            recordValueType === "struct" ||
            recordValueType === "record"
          ) {
            // SCENARIO 4 & 5: Complex value - create nested Y.Map
            const nestedYMap = new Y.Map();
            const nestedTypedMap = new TypedYMap(nestedYMap, valueSchema!);
            nestedTypedMap.update(recordValue as any);
            recordMap.set(recordKey, nestedYMap);
          }
        }
      } else {
        // SCENARIO 1: Handle simple value
        const validatedValue = this.validateValue(key, value);
        this.ymap.set(key as string, validatedValue);
      }
    }
  }

  public update(updates: Partial<A>): void {
    for (const key in updates) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const value = updates[key];
        this.set(key, value as A[typeof key]);
      }
    }
  }

  public updateSafe(updates: Partial<A>): {
    success: boolean;
    errors?: ParseError;
  } {
    try {
      this.update(updates);
      return { success: true };
    } catch (error) {
      if (error instanceof TypedYMapValidationError && error.parseError) {
        return { success: false, errors: error.parseError };
      }
      if (error instanceof TypeError) {
        return {
          success: false,
          errors: { message: error.message } as unknown as ParseError,
        };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Other Methods
  // ---------------------------------------------------------------------------

  public toObject(): A {
    if (this.isTopLevelRecord) {
      // Handle top-level Record schema
      const valueSchema = getRecordValueSchema(this.schema);
      if (!valueSchema) {
        throw new Error("Cannot extract value schema from Record");
      }

      const recordValueType = classifyRecordValueType(this.schema);
      const result: any = {};

      for (const [recordKey, recordValue] of this.ymap.entries()) {
        if (recordValueType === "simple") {
          result[recordKey] = recordValue;
        } else if (
          recordValueType === "struct" ||
          recordValueType === "record"
        ) {
          if (recordValue instanceof Y.Map) {
            const nestedTypedMap = new TypedYMap(recordValue, valueSchema);
            result[recordKey] = nestedTypedMap.toObject();
          } else {
            result[recordKey] = recordValue;
          }
        }
      }

      try {
        return S.decodeUnknownSync(this.schema)(result);
      } catch (error) {
        if (error instanceof ParseError) {
          throw new TypedYMapValidationError(
            `Object validation failed: ${error.message}`,
            error
          );
        }
        throw error;
      }
    }

    // Handle Struct schema
    const result = {} as A;
    // @ts-expect-error
    const fields = this.schema.fields as Record<keyof A, S.Schema<any>>;

    for (const key in fields) {
      const nestedMap = this.nestedMapCache.get(key);

      if (nestedMap) {
        // SCENARIO 2: Handle nested Struct
        (result[key] as any) = nestedMap.toObject();
      } else {
        const fieldSchema = fields[key];
        const rawValue = this.ymap.get(key as string);

        if (rawValue !== undefined) {
          if (isRecordSchema(fieldSchema)) {
            const recordValueType = classifyRecordValueType(fieldSchema);
            const valueSchema = getRecordValueSchema(fieldSchema);

            if (rawValue instanceof Y.Map) {
              if (recordValueType === "simple") {
                // SCENARIO 3: Simple record - convert to plain object
                (result[key] as any) = Object.fromEntries(rawValue.entries());
              } else if (
                recordValueType === "struct" ||
                recordValueType === "record"
              ) {
                // SCENARIO 4 & 5: Complex record - recursively convert
                const recordResult: any = {};
                for (const [recordKey, recordValue] of rawValue.entries()) {
                  if (recordValue instanceof Y.Map) {
                    const nestedTypedMap = new TypedYMap(
                      recordValue,
                      valueSchema!
                    );
                    recordResult[recordKey] = nestedTypedMap.toObject();
                  } else {
                    recordResult[recordKey] = recordValue;
                  }
                }
                (result[key] as any) = recordResult;
              }
            } else {
              // Already plain object
              (result[key] as any) = rawValue;
            }
          } else {
            // SCENARIO 1: Simple value
            (result[key] as any) = rawValue;
          }
        }
      }
    }

    try {
      console.log(this.ymap.toJSON());
      return S.decodeUnknownSync(this.schema)(result);
    } catch (error) {
      if (error instanceof ParseError) {
        throw new TypedYMapValidationError(
          `Object validation failed: ${error.message}`,
          error
        );
      }
      throw error;
    }
  }

  public toObjectSafe(): A | Partial<A> {
    try {
      return this.toObject();
    } catch (error) {
      console.warn("Object validation failed during toObject():", error);

      if (this.isTopLevelRecord) {
        // For Record schemas, return the raw entries
        return Object.fromEntries(this.ymap.entries()) as Partial<A>;
      }

      const rawResult = {} as Partial<A>;
      // @ts-expect-error
      for (const key in this.schema.fields) {
        // @ts-expect-error
        const nestedMap = this.nestedMapCache.get(key);
        if (nestedMap) {
          // @ts-expect-error
          (rawResult[key] as any) = nestedMap.toObjectSafe();
        } else {
          const rawValue = this.ymap.get(key as string);
          if (rawValue instanceof Y.Map) {
            (rawResult[key as keyof A] as any) = Object.fromEntries(
              rawValue.entries()
            );
          } else {
            (rawResult[key as keyof A] as any) = rawValue;
          }
        }
      }
      return rawResult;
    }
  }

  public has(key: keyof A): boolean {
    return this.ymap.has(key as string);
  }

  public delete(key: keyof A): void {
    const nestedMap = this.nestedMapCache.get(key);
    if (nestedMap) {
      nestedMap.clear();
      this.nestedMapCache.delete(key);
    }
    this.ymap.delete(key as string);
  }

  public clear(): void {
    this.nestedMapCache.forEach((nestedMap) => nestedMap.clear());
    this.nestedMapCache.clear();
    this.ymap.clear();
  }

  public size(): number {
    return this.ymap.size;
  }

  public validate(): { isValid: boolean; errors?: ParseError } {
    if (!this.schema) return { isValid: true };

    try {
      this.toObject();
      return { isValid: true };
    } catch (error) {
      if (error instanceof TypedYMapValidationError && error.parseError) {
        return { isValid: false, errors: error.parseError };
      }
      throw error;
    }
  }

  public observe(callback: (event: Y.YMapEvent<any>) => void): void {
    this.ymap.observe(callback);
  }

  public unobserve(callback: (event: Y.YMapEvent<any>) => void): void {
    this.ymap.unobserve(callback);
  }

  public keys(): (keyof A)[] {
    return Array.from(this.ymap.keys()) as (keyof A)[];
  }

  public values(): any[] {
    return Array.from(this.ymap.values());
  }

  public entries(): [keyof A, any][] {
    return Array.from(this.ymap.entries()) as [keyof A, any][];
  }

  /**
   * TypedYMap Collection Helper Methods
   *
   * These methods should be added to TypedYMap to support the MaskingLayer use case:
   * Record<frameId, Record<shapeId, Shape>>
   *
   * Current problems these solve:
   * 1. Getting nested record structure requires getRawYMap()
   * 2. Setting values in nested records requires extracting raw Y.Map
   * 3. Iterating over nested records is verbose
   * 4. Creating nested TypedYMap wrappers is manual
   */

  // ============================================================================
  // Problem 1: Accessing Nested Record Structure
  // ============================================================================

  /**
   * CURRENT CODE (in MaskingLayer):
   *
   * private getFramesToShapesMapRecord(): Y.Map<any> {
   *   return this.typedYMap.getRawYMap().get("framesToShapesMap");
   * }
   *
   * ISSUE: Direct Y.Map access violates abstraction
   */

  // PROPOSED SOLUTION: Add to TypedYMap class

  /**
   * Get keys from a nested complex record field.
   * For Record<K, Record<K2, V>> structures.
   *
   * Example: Get all frameIds that have shapes
   * layer.typedYMap.getRecordKeys("framesToShapesMap")
   * // => ["frame-1", "frame-2"]
   */
  public getRecordKeys<K extends RecordKeys<TSchema>>(fieldKey: K): string[] {
    if (this.isTopLevelRecord) {
      throw new Error(
        "getRecordKeys() requires a Struct schema with Record fields"
      );
    }

    const recordMap = this.getRecordMap(fieldKey);
    if (!recordMap) return [];

    return Array.from(recordMap.keys());
  }

  /**
   * Check if a nested complex record field has a specific key.
   *
   * Example: Check if frame has any shapes
   * layer.typedYMap.hasRecordKey("framesToShapesMap", "frame-1")
   */
  public hasRecordKey<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    recordKey: string
  ): boolean {
    if (this.isTopLevelRecord) {
      throw new Error(
        "hasRecordKey() requires a Struct schema with Record fields"
      );
    }

    const recordMap = this.getRecordMap(fieldKey);
    return recordMap?.has(recordKey) ?? false;
  }

  /**
   * Get size of a nested complex record field.
   *
   * Example: Count how many frames have shapes
   * layer.typedYMap.getRecordSize("framesToShapesMap")
   */
  public getRecordSize<K extends RecordKeys<TSchema>>(fieldKey: K): number {
    if (this.isTopLevelRecord) {
      throw new Error(
        "getRecordSize() requires a Struct schema with Record fields"
      );
    }

    const recordMap = this.getRecordMap(fieldKey);
    return recordMap?.size ?? 0;
  }

  /**
   * Iterate over all entries in a record field.
   * For Record<K, V> where V is complex (Struct/Record).
   * Yields [key, TypedYMap] tuples.
   *
   * Example: Iterate over all frames
   * for (const [frameId, frameTypedYMap] of
   *      project.typedYMap.iterateRecord("framesMap")) {
   *   const frame = new AnimationFrame(frameTypedYMap);
   *   frames.push(frame);
   * }
   */
  public *iterateRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K
  ): Generator<
    [
      string,
      TypedYMap<ExtractRecordValueSchema<ExtractFieldSchema<TSchema, K>>>
    ]
  > {
    if (this.isTopLevelRecord) {
      throw new Error("iterateRecord() requires a Struct schema");
    }

    const recordMap = this.getRecordMap(fieldKey);
    if (!recordMap) return;

    // Get the value schema
    const fieldSchema = (this.schema as any).fields[fieldKey];
    const valueSchema = getRecordValueSchema(fieldSchema);

    if (!valueSchema || !isComplexValueSchema(valueSchema)) {
      throw new Error("iterateRecord() requires complex value schema");
    }

    for (const [key, valueYMap] of recordMap.entries()) {
      if (!(valueYMap instanceof Y.Map)) continue;

      // Wrap in TypedYMap
      const typedYMap = new TypedYMap(valueYMap, valueSchema);
      yield [key, typedYMap as any];
    }
  }

  // ============================================================================
  // Problem 2: Nested Record Operations (Two Levels Deep)
  // ============================================================================

  /**
   * CURRENT CODE (in MaskingLayer.getShapesForFrame):
   *
   * const framesMap = this.getFramesToShapesMapRecord(); // Y.Map
   * const frameShapesMap = framesMap.get(frameId);        // Y.Map
   *
   * for (const [_, shapeYmap] of frameShapesMap.entries()) {
   *   const shapeTypedYMap = TypedYMap.create(MaskingShapeSchema, shapeYmap);
   *   shapes.push(new MaskingShape(shapeTypedYMap, ...));
   * }
   *
   * ISSUE: Manual TypedYMap wrapping, verbose iteration
   */

  // PROPOSED SOLUTION: Add to TypedYMap class

  /**
   * TODO: Investigate if this can be achieved using existing getFromRecord() chained calls
   * or if a dedicated method is truly necessary.
   *
   * Get keys from a doubly-nested record field.
   * For Record<K, Record<K2, V>> structures.
   *
   * Example: Get all shapeIds for a specific frame
   * layer.typedYMap.getNestedRecordKeys("framesToShapesMap", "frame-1")
   * // => ["shape-1", "shape-2", "shape-3"]
   *
   * Possible alternative with existing API:
   * const frameRecord = layer.typedYMap.getFromRecord("framesToShapesMap", "frame-1");
   * const shapeIds = frameRecord?.keys() // if TypedYMap.keys() method exists
   */
  public getNestedRecordKeys<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    recordKey: string
  ): string[] {
    if (this.isTopLevelRecord) {
      throw new Error("getNestedRecordKeys() requires a Struct schema");
    }

    // Get the outer record (frames map)
    const outerRecordMap = this.getRecordMap(fieldKey);
    if (!outerRecordMap) return [];

    // Get the inner record (shapes map for this frame)
    const innerRecordMap = outerRecordMap.get(recordKey);
    if (!(innerRecordMap instanceof Y.Map)) return [];

    return Array.from(innerRecordMap.keys());
  }

  /**
   * TODO: Investigate if this can be achieved by chaining getFromRecord() twice
   * or if a dedicated method provides significant value.
   *
   * Get a TypedYMap from a doubly-nested record field.
   * For Record<K, Record<K2, V>> where V is complex (Struct/Record).
   *
   * Example: Get a shape's TypedYMap from a specific frame
   * const shapeTypedYMap = layer.typedYMap.getFromNestedRecord(
   *   "framesToShapesMap",
   *   "frame-1",
   *   "shape-1"
   * );
   *
   * Possible alternative with existing API:
   * const frameRecord = layer.typedYMap.getFromRecord("framesToShapesMap", "frame-1");
   * const shapeTypedYMap = frameRecord?.getFromRecord("shape-1");
   * // But this assumes the frameRecord is itself a Record schema, not a Struct
   */
  public getFromNestedRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    outerKey: string,
    innerKey: string
  ):
    | TypedYMap<
        ExtractRecordValueSchema<
          ExtractRecordValueSchema<ExtractFieldSchema<TSchema, K>>
        >
      >
    | undefined {
    if (this.isTopLevelRecord) {
      throw new Error("getFromNestedRecord() requires a Struct schema");
    }

    // Get the outer record map (frames)
    const outerRecordMap = this.getRecordMap(fieldKey);
    if (!outerRecordMap) return undefined;

    // Get the inner record map (shapes for this frame)
    let innerRecordMap = outerRecordMap.get(outerKey);
    if (!innerRecordMap) {
      // Auto-create if doesn't exist
      innerRecordMap = new Y.Map();
      outerRecordMap.set(outerKey, innerRecordMap);
    }

    if (!(innerRecordMap instanceof Y.Map)) return undefined;

    // Get or create the value Y.Map
    let valueYMap = innerRecordMap.get(innerKey);
    if (!valueYMap) {
      valueYMap = new Y.Map();
      innerRecordMap.set(innerKey, valueYMap);
    }

    // Get the value schema (Record<K, Record<K2, V>> -> V)
    const fieldSchema = (this.schema as any).fields[fieldKey];
    const outerValueSchema = getRecordValueSchema(fieldSchema); // Record<K2, V>
    const innerValueSchema = getRecordValueSchema(outerValueSchema); // V

    if (!innerValueSchema || !isComplexValueSchema(innerValueSchema)) {
      return undefined;
    }

    // Wrap in TypedYMap
    return new TypedYMap(valueYMap, innerValueSchema) as any;
  }

  /**
   * TODO: Investigate if this can be achieved using existing set() method on a
   * TypedYMap obtained via getFromRecord().
   *
   * Set a TypedYMap into a doubly-nested record field.
   * For Record<K, Record<K2, V>> where V is complex.
   *
   * Example: Add a shape to a frame
   * const shapeTypedYMap = shape.getTypedYMap();
   * layer.typedYMap.setInNestedRecord(
   *   "framesToShapesMap",
   *   "frame-1",
   *   "shape-1",
   *   shapeTypedYMap
   * );
   *
   * Possible alternative with existing API:
   * const frameRecord = layer.typedYMap.getFromRecord("framesToShapesMap", "frame-1");
   * frameRecord?.set("shape-1", shapeTypedYMap.getRawYMap());
   * // But this still requires getRawYMap() which we're trying to avoid
   */
  public setInNestedRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    outerKey: string,
    innerKey: string,
    value: TypedYMap<any>
  ): void {
    if (this.isTopLevelRecord) {
      throw new Error("setInNestedRecord() requires a Struct schema");
    }

    // Get or create outer record map (frames)
    const outerRecordMap = this.getRecordMap(fieldKey);
    if (!outerRecordMap) {
      throw new Error(`Field ${String(fieldKey)} is not a record`);
    }

    // Get or create inner record map (shapes for this frame)
    let innerRecordMap = outerRecordMap.get(outerKey);
    if (!innerRecordMap) {
      innerRecordMap = new Y.Map();
      outerRecordMap.set(outerKey, innerRecordMap);
    }

    if (!(innerRecordMap instanceof Y.Map)) {
      throw new Error(`Inner key ${outerKey} is not a Y.Map`);
    }

    // Set the value's raw Y.Map
    innerRecordMap.set(innerKey, value.getRawYMap());
  }

  /**
   * TODO: Investigate if this can be achieved using existing delete() method on a
   * TypedYMap obtained via getFromRecord().
   *
   * Delete from a doubly-nested record field.
   *
   * Example: Remove a shape from a frame
   * layer.typedYMap.deleteFromNestedRecord(
   *   "framesToShapesMap",
   *   "frame-1",
   *   "shape-1"
   * );
   *
   * Possible alternative with existing API:
   * const frameRecord = layer.typedYMap.getFromRecord("framesToShapesMap", "frame-1");
   * frameRecord?.delete("shape-1");
   */
  public deleteFromNestedRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    outerKey: string,
    innerKey: string
  ): boolean {
    if (this.isTopLevelRecord) {
      throw new Error("deleteFromNestedRecord() requires a Struct schema");
    }

    const outerRecordMap = this.getRecordMap(fieldKey);
    if (!outerRecordMap) return false;

    const innerRecordMap = outerRecordMap.get(outerKey);
    if (!(innerRecordMap instanceof Y.Map)) return false;

    if (!innerRecordMap.has(innerKey)) return false;

    innerRecordMap.delete(innerKey);
    return true;
  }

  /**
   * TODO: Investigate if this can be achieved using existing deleteFromRecord() method.
   *
   * Delete an entire nested record (e.g., all shapes for a frame).
   *
   * Example: Remove all shapes for a frame
   * layer.typedYMap.deleteNestedRecord("framesToShapesMap", "frame-1");
   *
   * Possible alternative with existing API:
   * layer.typedYMap.deleteFromRecord("framesToShapesMap", "frame-1");
   * // This should work if deleteFromRecord() can delete Record values
   */
  public deleteNestedRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    outerKey: string
  ): boolean {
    if (this.isTopLevelRecord) {
      throw new Error("deleteNestedRecord() requires a Struct schema");
    }

    const outerRecordMap = this.getRecordMap(fieldKey);
    if (!outerRecordMap) return false;

    if (!outerRecordMap.has(outerKey)) return false;

    outerRecordMap.delete(outerKey);
    return true;
  }

  /**
   * TODO: Investigate if this can be achieved by chaining iterateRecord() or using
   * existing iteration methods more effectively.
   *
   * Iterate over all entries in a doubly-nested record field.
   * Yields [outerKey, innerKey, TypedYMap] tuples.
   *
   * Example: Iterate over all shapes in all frames
   * for (const [frameId, shapeId, shapeTypedYMap] of
   *      layer.typedYMap.iterateNestedRecord("framesToShapesMap")) {
   *   const shape = new MaskingShape(shapeTypedYMap, ...);
   *   console.log(`Frame ${frameId} has shape ${shapeId}`);
   * }
   *
   * Possible alternative with existing API:
   * for (const [frameId, frameRecord] of layer.typedYMap.iterateRecord("framesToShapesMap")) {
   *   for (const [shapeId, shapeTypedYMap] of frameRecord.iterateRecord(...)) {
   *     // But frameRecord is a TypedYMap<Record<shapeId, Shape>>, can we iterate it?
   *   }
   * }
   */
  public *iterateNestedRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K
  ): Generator<[string, string, TypedYMap<any>]> {
    if (this.isTopLevelRecord) {
      throw new Error("iterateNestedRecord() requires a Struct schema");
    }

    const outerRecordMap = this.getRecordMap(fieldKey);
    if (!outerRecordMap) return;

    // Get the value schema
    const fieldSchema = (this.schema as any).fields[fieldKey];
    const outerValueSchema = getRecordValueSchema(fieldSchema);
    const innerValueSchema = getRecordValueSchema(outerValueSchema);

    if (!innerValueSchema || !isComplexValueSchema(innerValueSchema)) {
      throw new Error("iterateNestedRecord() requires complex value schema");
    }

    // Iterate outer record (frames)
    for (const [outerKey, innerRecordMap] of outerRecordMap.entries()) {
      if (!(innerRecordMap instanceof Y.Map)) continue;

      // Iterate inner record (shapes)
      for (const [innerKey, valueYMap] of innerRecordMap.entries()) {
        if (!(valueYMap instanceof Y.Map)) continue;

        // Wrap in TypedYMap
        const typedYMap = new TypedYMap(valueYMap, innerValueSchema);
        yield [outerKey, innerKey, typedYMap as any];
      }
    }
  }

  // ============================================================================
  // Problem 3: Single-Level Record Operations
  // ============================================================================

  /**
   * TODO: Investigate if this can be achieved using existing set() method or if
   * the abstraction needs enhancement to handle TypedYMap values.
   *
   * Set a value in a record field by providing a TypedYMap.
   * For Record<K, V> where V is complex.
   *
   * Example: Add a frame to the project
   * const frameTypedYMap = frame.getTypedYMap();
   * project.typedYMap.setInRecord("framesMap", frameId, frameTypedYMap);
   *
   * Possible alternative with existing API:
   * project.typedYMap.set("framesMap", { ...existingFrames, [frameId]: frameData });
   * // But this requires getting all existing frames first and is inefficient
   */
  public setInRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    recordKey: string,
    value: TypedYMap<any>
  ): void {
    if (this.isTopLevelRecord) {
      throw new Error("setInRecord() requires a Struct schema");
    }

    const recordMap = this.getRecordMap(fieldKey);
    if (!recordMap) {
      throw new Error(`Field ${String(fieldKey)} is not a record`);
    }

    // Set the value's raw Y.Map
    recordMap.set(recordKey, value.getRawYMap());
  }

  /**
   * TODO: Investigate if deleteFromSimpleRecord() or similar method already handles this.
   *
   * Delete a value from a record field.
   *
   * Example: Remove a frame from the project
   * project.typedYMap.deleteFromRecord("framesMap", frameId);
   *
   * Note: This may already be covered by existing methods for simple record operations.
   */
  public deleteFromRecord<K extends RecordKeys<TSchema>>(
    fieldKey: K,
    recordKey: string
  ): boolean {
    if (this.isTopLevelRecord) {
      throw new Error("deleteFromRecord() requires a Struct schema");
    }

    const recordMap = this.getRecordMap(fieldKey);
    if (!recordMap) return false;

    if (!recordMap.has(recordKey)) return false;

    recordMap.delete(recordKey);
    return true;
  }

  // ============================================================================
  // Summary
  // ============================================================================

  /*
CONFIRMED USEFUL (First 4 methods):
1. getRecordKeys() - Essential for iteration, no alternative
2. hasRecordKey() - Useful convenience, could use getRecordKeys().includes() but inefficient
3. getRecordSize() - Useful convenience, could use getRecordKeys().length but inefficient  
4. iterateRecord() - Essential for clean iteration with TypedYMap wrappers

NEEDS INVESTIGATION (Remaining methods):
All other methods should be investigated to see if they can be achieved by:
- Chaining existing methods (e.g., getFromRecord() twice)
- Using TypedYMap methods on nested structures
- Combining existing primitives in domain classes

Key questions to answer during investigation:
1. Can getFromNestedRecord() be replaced by chaining getFromRecord()?
2. Can setInNestedRecord() work if we add a setInRecord() that accepts TypedYMap?
3. Can we iterate nested records by chaining iterateRecord()?
4. Is deleteNestedRecord() just an alias for deleteFromRecord()?

These methods may still be valuable for:
- Better error messages
- Performance (fewer intermediate steps)
- Cleaner API (explicit intent)
- Type safety (proper type inference for nested structures)
*/
}
