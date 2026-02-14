import * as S from "effect/Schema";
import { ParseError } from "effect/ParseResult";
import * as Y from "yjs";

// -----------------------------------------------------------------------------
// 1. Shared Types and Error Class
// -----------------------------------------------------------------------------

export class TypedYMapValidationError extends Error {
  constructor(message: string, public readonly parseError?: ParseError) {
    super(message);
    this.name = "TypedYMapValidationError";
  }
}

// -----------------------------------------------------------------------------
// 2. Schema Inspection Helpers (Shared)
// -----------------------------------------------------------------------------

function isStructSchema(schema: S.Schema<any>): boolean {
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
    // @ts-expect-error - accessing internal structure
    return schema.value;
  }
  return null;
}

// -----------------------------------------------------------------------------
// 3. TypedYStruct - For S.Struct schemas
// -----------------------------------------------------------------------------

/**
 * Type helpers for TypedYStruct
 */
type StructFields<TSchema> = TSchema extends S.Struct<infer Fields>
  ? Fields
  : never;

type IsStructField<T> = T extends S.Struct<any> ? true : false;

type IsRecordField<T> = T extends S.Record$<
  S.Schema.AnyNoContext,
  S.Schema.AnyNoContext
>
  ? true
  : false;

type IsComplexRecordValue<T> = T extends S.Schema<any, any>
  ? IsStructField<T> extends true
    ? true
    : IsRecordField<T> extends true
    ? true
    : false
  : false;

/**
 * Extract keys where the field is a nested Struct
 */
type NestedStructKeys<TSchema extends S.Struct<any>> = {
  [K in keyof S.Schema.Type<TSchema>]: StructFields<TSchema>[K] extends S.Schema<
    any,
    any
  >
    ? IsStructField<StructFields<TSchema>[K]> extends true
      ? K
      : never
    : never;
}[keyof S.Schema.Type<TSchema>];

/**
 * Extract keys where the field is a Record (with any value type)
 */
type RecordFieldKeys<TSchema extends S.Struct<any>> = {
  [K in keyof S.Schema.Type<TSchema>]: StructFields<TSchema>[K] extends S.Schema<
    any,
    any
  >
    ? IsRecordField<StructFields<TSchema>[K]> extends true
      ? K
      : never
    : never;
}[keyof S.Schema.Type<TSchema>];

/**
 * Extract keys where the field is a simple value (not Struct or Record)
 */
type SimpleKeys<TSchema extends S.Struct<any>> = Exclude<
  keyof S.Schema.Type<TSchema>,
  NestedStructKeys<TSchema> | RecordFieldKeys<TSchema>
>;

/**
 * Extract the schema for a specific field
 */
type ExtractFieldSchema<
  TSchema extends S.Struct<any>,
  K
> = TSchema extends S.Struct<infer Fields>
  ? K extends keyof Fields
    ? Fields[K]
    : never
  : never;

/**
 * TypedYStruct - Wraps Y.Map with a Struct schema
 * Provides type-safe access to fields that can be:
 * - Simple values (primitives, arrays, etc.)
 * - Nested Structs (recursively wrapped in TypedYStruct)
 * - Records (wrapped in TypedYRecord)
 */
export class TypedYStruct<TSchema extends S.Struct<any>> {
  private readonly yMap: Y.Map<any>;
  private readonly schema: TSchema;
  private readonly nestedStructs: Map<string, TypedYStruct<any>>;
  private readonly nestedRecords: Map<string, TypedYRecord<any>>;

  constructor(yMap: Y.Map<any>, schema: TSchema) {
    this.yMap = yMap;
    this.schema = schema;
    this.nestedStructs = new Map();
    this.nestedRecords = new Map();

    // Initialize nested structures recursively
    this.initializeNestedStructures();
  }

  private initializeNestedStructures(): void {
    const fields = (this.schema as any).fields;
    if (!fields) return;

    for (const [fieldKey, fieldSchema] of Object.entries(fields)) {
      if (isStructSchema(fieldSchema as S.Schema<any>)) {
        // Nested Struct field
        let nestedYMap = this.yMap.get(fieldKey);
        if (!nestedYMap) {
          nestedYMap = new Y.Map();
          this.yMap.set(fieldKey, nestedYMap);
        }
        const typedStruct = new TypedYStruct(nestedYMap, fieldSchema as any);
        this.nestedStructs.set(fieldKey, typedStruct);
      } else if (isRecordSchema(fieldSchema as S.Schema<any>)) {
        // Record field
        let recordYMap = this.yMap.get(fieldKey);
        if (!recordYMap) {
          recordYMap = new Y.Map();
          this.yMap.set(fieldKey, recordYMap);
        }
        const valueSchema = getRecordValueSchema(fieldSchema as S.Schema<any>);
        if (valueSchema) {
      // @ts-expect-error
          const typedRecord = new TypedYRecord(recordYMap, valueSchema);
          this.nestedRecords.set(fieldKey, typedRecord);
        }
      }
    }
  }

  // ============================================================================
  // Simple Field Operations
  // ============================================================================

  /**
   * Get a simple (non-nested) field value
   */
  public get<K extends SimpleKeys<TSchema>>(
    key: K
  ): S.Schema.Type<TSchema>[K] | undefined {
    const rawValue = this.yMap.get(key as string);
    if (rawValue === undefined) return undefined;

    const fieldSchema = (this.schema as any).fields[key];
    const result = S.decodeUnknownSync(fieldSchema)(rawValue);
    return result as S.Schema.Type<TSchema>[K];
  }

  /**
   * Set a simple (non-nested) field value
   */
  public set<K extends SimpleKeys<TSchema>>(
    key: K,
    value: S.Schema.Type<TSchema>[K]
  ): void {
    const fieldSchema = (this.schema as any).fields[key];
    try {
      S.decodeUnknownSync(fieldSchema)(value);
      this.yMap.set(key as string, value);
    } catch (error) {
      throw new TypedYMapValidationError(
        `Validation failed for field ${String(key)}`,
        error instanceof ParseError ? error : undefined
      );
    }
  }

  /**
   * Check if a simple field exists
   */
  public has<K extends SimpleKeys<TSchema>>(key: K): boolean {
    return this.yMap.has(key as string);
  }

  /**
   * Delete a simple field
   */
  public delete<K extends SimpleKeys<TSchema>>(key: K): void {
    this.yMap.delete(key as string);
  }

  // ============================================================================
  // Nested Struct Operations
  // ============================================================================

  /**
   * Get a nested Struct field as a TypedYStruct
   */
  public getNestedStruct<K extends NestedStructKeys<TSchema>>(
    key: K
  ): TypedYStruct<ExtractFieldSchema<TSchema, K>> {
    const nested = this.nestedStructs.get(key as string);
    if (!nested) {
      throw new Error(`No nested struct found for key: ${String(key)}`);
    }
    return nested as TypedYStruct<ExtractFieldSchema<TSchema, K>>;
  }

  // ============================================================================
  // Record Field Operations
  // ============================================================================

  /**
   * Get a Record field as a TypedYRecord
   */
  public getRecord<K extends RecordFieldKeys<TSchema>>(
    key: K
  ): TypedYRecord<ExtractFieldSchema<TSchema, K>> {
    const record = this.nestedRecords.get(key as string);
    if (!record) {
      throw new Error(`No record found for key: ${String(key)}`);
    }
    return record as TypedYRecord<ExtractFieldSchema<TSchema, K>>;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get all data as a validated object
   */
  public toObject(): S.Schema.Type<TSchema> {
    const data: any = {};

    // Get simple fields
    for (const key of this.yMap.keys()) {
      if (!this.nestedStructs.has(key) && !this.nestedRecords.has(key)) {
        data[key] = this.yMap.get(key);
      }
    }

    // Get nested structs
    for (const [key, nested] of this.nestedStructs.entries()) {
      data[key] = nested.toObject();
    }

    // Get records
    for (const [key, record] of this.nestedRecords.entries()) {
      data[key] = record.toObject();
    }

      // @ts-expect-error
    return S.decodeUnknownSync(this.schema)(data);
  }

  /**
   * Get the underlying Y.Map
   */
  public getRawYMap(): Y.Map<any> {
    return this.yMap;
  }

  /**
   * Observe changes to the Y.Map
   */
  public observe(callback: (event: Y.YMapEvent<any>) => void): void {
    this.yMap.observe(callback);
  }

  /**
   * Unobserve changes
   */
  public unobserve(callback: (event: Y.YMapEvent<any>) => void): void {
    this.yMap.unobserve(callback);
  }
}

// -----------------------------------------------------------------------------
// 4. TypedYRecord - For S.Record schemas
// -----------------------------------------------------------------------------

/**
 * Type helpers for TypedYRecord
 */
type ExtractRecordValueSchema<T> = T extends S.Record$<
  S.Schema.AnyNoContext,
  infer V
>
  ? V
  : never;

/**
 * Determine the return type for get() based on the value schema
 */
type RecordGetReturnType<ValueSchema> = ValueSchema extends S.Struct<any>
  ? TypedYStruct<ValueSchema>
  : ValueSchema extends S.Record$<S.Schema.AnyNoContext, S.Schema.AnyNoContext>
  ? TypedYRecord<ValueSchema>
  : S.Schema.Type<ValueSchema>;

/**
 * TypedYRecord - Wraps Y.Map with a Record schema (Record<string, V>)
 * Provides type-safe access to dynamic key-value pairs where values can be:
 * - Simple values (primitives, arrays, etc.)
 * - Structs (wrapped in TypedYStruct)
 * - Nested Records (recursively wrapped in TypedYRecord)
 */
export class TypedYRecord<
  TSchema extends S.Record$<S.Schema.AnyNoContext, S.Schema.AnyNoContext>
> {
  private readonly yMap: Y.Map<any>;
  private readonly valueSchema: S.Schema<any>;
  private readonly isStructValue: boolean;
  private readonly isRecordValue: boolean;

  constructor(yMap: Y.Map<any>, recordSchema: TSchema) {
    this.yMap = yMap;
    this.valueSchema = recordSchema.value;
    this.isStructValue = isStructSchema(recordSchema.value);
    this.isRecordValue = isRecordSchema(recordSchema.value);
  }

  // ============================================================================
  // Basic Record Operations
  // ============================================================================
  /**
   * Get a value from the record
   * Returns different types based on the value schema:
   * - Simple values: raw typed value
   * - Struct values: TypedYStruct instance
   * - Record values: TypedYRecord instance
   */
  public get(
    key: string
  ): RecordGetReturnType<ExtractRecordValueSchema<TSchema>> | undefined {
    const rawValue = this.yMap.get(key);
    if (rawValue === undefined) return undefined;

    if (this.isStructValue && rawValue instanceof Y.Map) {
      // @ts-expect-error
      return new TypedYStruct(rawValue, this.valueSchema);
    }

    if (this.isRecordValue && rawValue instanceof Y.Map) {
      const nestedValueSchema = getRecordValueSchema(this.valueSchema);
      if (nestedValueSchema) {
        // @ts-expect-error
        return new TypedYRecord(rawValue, nestedValueSchema);
      }
    }

    // Simple value
    const result = S.decodeUnknownSync(this.valueSchema)(rawValue);
    return result as S.Schema.Type<ExtractRecordValueSchema<TSchema>>;
  }

  /**
   * Set a value in the record
   * Accepts different types based on the value schema:
   * - Simple values: raw typed value
   * - Struct values: TypedYStruct instance
   * - Record values: TypedYRecord instance
   */
  public set(
    key: string,
    value: RecordGetReturnType<ExtractRecordValueSchema<TSchema>>
  ): void {
    // @ts-expect-error
    if (value instanceof TypedYStruct) {
      if (!this.isStructValue) {
        throw new TypedYMapValidationError(
          "Cannot set TypedYStruct value in non-struct record"
        );
      }
      this.yMap.set(key, value.getRawYMap());
      return;
    }

    // @ts-expect-error
    if (value instanceof TypedYRecord) {
      if (!this.isRecordValue) {
        throw new TypedYMapValidationError(
          "Cannot set TypedYRecord value in non-record record"
        );
      }
      this.yMap.set(key, value.getRawYMap());
      return;
    }

    // Simple value - validate and set
    try {
      S.decodeUnknownSync(this.valueSchema)(value);
      this.yMap.set(key, value);
    } catch (error) {
      throw new TypedYMapValidationError(
        `Validation failed for record key ${key}`,
        error instanceof ParseError ? error : undefined
      );
    }
  }

  /**
   * Create a new entry with a Struct value
   * Only works when value schema is a Struct
   */
  public createStructEntry(
    key: string
  ): ExtractRecordValueSchema<TSchema> extends S.Struct<any>
    ? TypedYStruct<ExtractRecordValueSchema<TSchema>>
    : never {
    if (!this.isStructValue) {
      throw new Error("Value schema is not a Struct");
    }

    const newYMap = new Y.Map();
    this.yMap.set(key, newYMap);
    // @ts-expect-error
    return new TypedYStruct(newYMap, this.valueSchema) as any;
  }

  /**
   * Create a new entry with a Record value
   * Only works when value schema is a Record
   */
  public createRecordEntry(
    key: string
  ): ExtractRecordValueSchema<TSchema> extends S.Record$<
    S.Schema.AnyNoContext,
    S.Schema.AnyNoContext
  >
    ? TypedYRecord<ExtractRecordValueSchema<TSchema>>
    : never {
    if (!this.isRecordValue) {
      throw new Error("Value schema is not a Record");
    }

    const nestedValueSchema = getRecordValueSchema(this.valueSchema);
    if (!nestedValueSchema) {
      throw new Error("Could not extract nested value schema");
    }

    const newYMap = new Y.Map();
    this.yMap.set(key, newYMap);
    // @ts-expect-error
    return new TypedYRecord(newYMap, nestedValueSchema) as any;
  }

  /**
   * Check if a key exists
   */
  public has(key: string): boolean {
    return this.yMap.has(key);
  }

  /**
   * Delete a key
   */
  public delete(key: string): boolean {
    if (!this.has(key)) return false;
    this.yMap.delete(key);
    return true;
  }

  /**
   * Get all keys
   */
  public keys(): string[] {
    return Array.from(this.yMap.keys());
  }

  /**
   * Get the size of the record
   */
  public size(): number {
    return this.yMap.size;
  }

  // ============================================================================
  // Iteration
  // ============================================================================

  /**
   * Iterate over entries in the record
   * Yields [key, value] pairs where value type depends on the value schema
   */
  public *entries(): Generator<
    [string, RecordGetReturnType<ExtractRecordValueSchema<TSchema>>]
  > {
    for (const [key, rawValue] of this.yMap.entries()) {
      if (this.isStructValue && rawValue instanceof Y.Map) {
        // @ts-expect-error
        yield [key, new TypedYStruct(rawValue, this.valueSchema)];
      } else if (this.isRecordValue && rawValue instanceof Y.Map) {
        const nestedValueSchema = getRecordValueSchema(this.valueSchema);
        if (nestedValueSchema) {
          // @ts-expect-error
          yield [key, new TypedYRecord(rawValue, nestedValueSchema)];
        }
      } else {
        const value = S.decodeUnknownSync(this.valueSchema)(rawValue);
        // @ts-expect-error
        yield [key, value as S.Schema.Type<ExtractRecordValueSchema<TSchema>>];
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get all data as a validated object
   */
  public toObject(): Record<
    string,
    S.Schema.Type<ExtractRecordValueSchema<TSchema>>
  > {
    const result: any = {};

    for (const [key, value] of this.entries()) {
      // @ts-expect-error
      if (value instanceof TypedYStruct) {
        result[key] = value.toObject();
        // @ts-expect-error
      } else if (value instanceof TypedYRecord) {
        result[key] = value.toObject();
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Get the underlying Y.Map
   */
  public getRawYMap(): Y.Map<any> {
    return this.yMap;
  }

  /**
   * Observe changes to the Y.Map
   */
  public observe(callback: (event: Y.YMapEvent<any>) => void): void {
    this.yMap.observe(callback);
  }

  /**
   * Unobserve changes
   */
  public unobserve(callback: (event: Y.YMapEvent<any>) => void): void {
    this.yMap.unobserve(callback);
  }
}

// -----------------------------------------------------------------------------
// 5. Factory Function for Convenience
// -----------------------------------------------------------------------------

/**
 * Create a TypedYStruct or TypedYRecord based on the schema type
 */
export function createTypedYMap<TSchema extends S.Schema<any>>(
  yMap: Y.Map<any>,
  schema: TSchema
): TSchema extends S.Struct<any>
  ? TypedYStruct<TSchema>
  : TSchema extends S.Record$<S.Schema.AnyNoContext, S.Schema.AnyNoContext>
  ? TypedYRecord<TSchema>
  : never {
  if (isStructSchema(schema)) {
    return new TypedYStruct(yMap, schema as any) as any;
  }

  if (isRecordSchema(schema)) {
    const valueSchema = getRecordValueSchema(schema);
    if (valueSchema) {
      return new TypedYRecord(
        yMap,
        S.Record({ key: S.String, value: valueSchema })
      ) as any;
    }
  }

  throw new Error("Schema must be either a Struct or Record");
}
