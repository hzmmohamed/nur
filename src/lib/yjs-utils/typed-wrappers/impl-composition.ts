import * as S from "effect/Schema";
import { ParseError } from "effect/ParseResult";
import * as Y from "yjs";
import * as E from "effect/Either";

// -----------------------------------------------------------------------------
// 1. Types and Error Class
// -----------------------------------------------------------------------------

/**
 * Define a type alias for a schema that results in a map-like object (Record<string, any>).
 * TInput: Allows the input type (I) to be any type.
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
// 2. TypedYMap with Corrected Safe Methods
// -----------------------------------------------------------------------------

/**
 * Enhanced TypedYMap class with Effect Schema validation.
 */
export class TypedYMap<
  TSchema extends MapSchema<any, any>,
  A = S.Schema.Type<TSchema>
> {
  constructor(
    // The schema property must use TSchema to correctly track the generic type
    public readonly ymap: Y.Map<any>,
    public readonly schema?: TSchema
  ) {}

  // ---------------------------------------------------------------------------
  // Validation Logic
  // ---------------------------------------------------------------------------

  private validateValue<K extends keyof A>(key: K, value: A[K]): A[K] {
    if (!this.schema) return value;

    // Use a temporary variable for the schema structure with the output type A
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

  private validateObject(obj: Partial<A>): Partial<A> {
    if (!this.schema) return obj;

    try {
      const structSchema = this.schema as S.Schema<A, unknown>;
      const partialSchema = S.partial(structSchema);
      return S.decodeUnknownSync(partialSchema)(obj) as Partial<A>;
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

  // ---------------------------------------------------------------------------
  // Public Mutators
  // ---------------------------------------------------------------------------

  set<K extends keyof A>(key: K, value: A[K]): void {
    const validatedValue = this.validateValue(key, value);
    this.ymap.set(key as string, validatedValue);
  }

  /**
   * Safely sets a key-value pair. Returns E.right(void) on success,
   * E.left(TypedYMapValidationError) on validation failure.
   */
  setSafe<K extends keyof A>(
    key: K,
    value: A[K]
  ): E.Either<void, TypedYMapValidationError> {
    try {
      this.set(key, value);
      return E.right(undefined as void);
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return E.left(error);
      }
      throw error;
    }
  }

  update(updates: Partial<A>): void {
    const validatedUpdates = this.validateObject(updates);

    Object.entries(validatedUpdates).forEach(([key, value]) => {
      this.ymap.set(key, value);
    });
  }

  /**
   * Safely updates multiple properties. Returns E.right(void) on success,
   * E.left(TypedYMapValidationError) on validation failure.
   *
   * Corrected return type to E.Either<SuccessValue, ErrorValue>.
   */
  updateSafe(updates: Partial<A>): E.Either<void, TypedYMapValidationError> {
    try {
      this.update(updates);
      return E.right(undefined as void);
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return E.left(error);
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Public Accessors
  // ---------------------------------------------------------------------------

  get<K extends keyof A>(key: K): A[K] | undefined {
    return this.ymap.get(key as string);
  }

  getSafe<K extends keyof A>(key: K): A[K] | undefined {
    const value = this.ymap.get(key as string);
    if (value === undefined) return undefined;

    try {
      return this.validateValue(key, value);
    } catch (error) {
      console.warn(`Value for key "${String(key)}" failed validation:`, error);
      return undefined;
    }
  }

  toObject(): A {
    const rawObject = this.ymap.toJSON();

    if (!this.schema) return rawObject as A;

    try {
      return S.decodeUnknownSync(this.schema)(rawObject);
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

  toObjectSafe(): unknown {
    // Note: This method returns unknown on error, not E.Either, consistent with its original purpose.
    try {
      return this.toObject();
    } catch (error) {
      console.warn("Object validation failed during toObject():", error);
      return this.ymap.toJSON();
    }
  }

  // ---------------------------------------------------------------------------
  // Passthrough Methods (Using A)
  // ---------------------------------------------------------------------------

  has<K extends keyof A>(key: K): boolean {
    return this.ymap.has(key as string);
  }

  delete<K extends keyof A>(key: K): void {
    this.ymap.delete(key as string);
  }

  /**
   * Validates the entire map against the schema. Returns E.Either<void, TypedYMapValidationError>.
   */
  validate(): E.Either<void, TypedYMapValidationError> {
    if (!this.schema) return E.right(undefined as void);

    try {
      this.toObject();
      return E.right(undefined as void);
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        // Return the error in the E.left side
        return E.left(error);
      }
      throw error;
    }
  }

  observe(callback: (event: Y.YMapEvent<any>) => void): void {
    this.ymap.observe(callback);
  }

  unobserve(callback: (event: Y.YMapEvent<any>) => void): void {
    this.ymap.unobserve(callback);
  }

  keys(): string[] {
    return Array.from(this.ymap.keys());
  }

  values(): any[] {
    return Array.from(this.ymap.values());
  }

  entries(): [string, any][] {
    return Array.from(this.ymap.entries());
  }

  clear(): void {
    this.ymap.clear();
  }

  size(): number {
    return this.ymap.size;
  }
}

// -----------------------------------------------------------------------------
// 4. TypedYArrayOfMaps Class
// -----------------------------------------------------------------------------

export class TypedYArrayOfMaps<
  TSchema extends MapSchema<any, any>,
  A = S.Schema.Type<TSchema>
> {
  private readonly yarray: Y.Array<Y.Map<any>>;
  private readonly schema: TSchema;

  constructor(yarray: Y.Array<Y.Map<any>>, schema: TSchema) {
    this.yarray = yarray;
    this.schema = schema;
  }

  private createTypedYMap(ymap: Y.Map<any>): TypedYMap<TSchema> {
    // TSchema is correctly passed here
    return new TypedYMap<TSchema>(ymap, this.schema);
  }

  push(items: TypedYMap<TSchema>[]): void {
    const ymaps = items.map((item) => item.ymap);
    this.yarray.push(ymaps);
  }

  /**
   * Safely pushes items. Returns E.right(void) on success.
   * Items are assumed to be valid as they are TypedYMap instances.
   */
  pushSafe(
    items: TypedYMap<TSchema>[]
  ): E.Either<void, TypedYMapValidationError> {
    try {
      this.push(items);
      return E.right(undefined as void);
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return E.left(error);
      }
      // Catch any unexpected Yjs transaction errors
      throw error;
    }
  }

  insert(index: number, items: TypedYMap<TSchema>[]): void {
    const ymaps = items.map((item) => item.ymap);
    this.yarray.insert(index, ymaps);
  }

  public clear(): void {
    this.yarray.delete(0, this.yarray.length);
  }

  delete(index: number, length: number = 1): void {
    this.yarray.delete(index, length);
  }

  get(index: number): TypedYMap<TSchema> | undefined {
    const ymap = this.yarray.get(index);
    return ymap ? this.createTypedYMap(ymap) : undefined;
  }

  length(): number {
    return this.yarray.length;
  }

  toArray(): TypedYMap<TSchema>[] {
    return this.yarray.toArray().map((ymap) => this.createTypedYMap(ymap));
  }

  toObjectArray(): A[] {
    return this.toArray().map((typedMap) => {
      return typedMap.toObject() as A;
    });
  }

  toObjectArraySafe(): (A | Partial<A>)[] {
    // Note: This implementation converts the object to A or Partial<A> if validation fails
    return this.toArray().map((typedMap) => {
      // The old toObjectSafe returns the raw JSON on error, which is compatible with Partial<A>
      const result = typedMap.toObjectSafe();
      return result as A | Partial<A>;
    });
  }

  observe(callback: (event: Y.YArrayEvent<Y.Map<any>>) => void): void {
    this.yarray.observe(callback);
  }
  unobserve(callback: (event: Y.YArrayEvent<Y.Map<any>>) => void): void {
    this.yarray.unobserve(callback);
  }

  updateAt(index: number, updates: Partial<A>): boolean {
    const item = this.get(index);
    if (!item) return false;

    // We use the safe update method internally and check the result
    return E.isRight(
      item.updateSafe(updates as Partial<S.Schema.Type<typeof item.schema>>)
    );
  }

  /**
   * Safely updates an array item at a given index. Returns E.right(void) on success,
   * E.left(TypedYMapValidationError) on validation or structural failure.
   */
  updateAtSafe(
    index: number,
    updates: Partial<A>
  ): E.Either<void, TypedYMapValidationError> {
    const item = this.get(index);
    if (!item) {
      // NEW: Use TypedYMapValidationError for missing item consistency
      return E.left(
        new TypedYMapValidationError(
          `Item at index ${index} not found. Cannot update.`
        )
      );
    }
    // item.updateSafe now returns E.Either<void, TypedYMapValidationError>
    return item.updateSafe(
      updates as Partial<S.Schema.Type<typeof item.schema>>
    );
  }

  validateAll(): {
    isValid: boolean;
    errors: { index: number; errors: ParseError }[];
  } {
    const errors: { index: number; errors: ParseError }[] = [];
    this.toArray().forEach((item, index) => {
      const validation = item.validate();
      if (E.isLeft(validation)) {
        errors.push({ index, errors: validation.left.parseError! });
      }
    });
    return { isValid: errors.length === 0, errors };
  }

  public getSchema(): TSchema {
    return this.schema;
  }

  createItem(initialData?: Partial<A>): TypedYMap<TSchema> {
    const ymap = new Y.Map();
    const typedMap = this.createTypedYMap(ymap);
    if (initialData) {
      // This will throw if validation fails, which is handled by addItemSafe
      typedMap.update(
        initialData as Partial<S.Schema.Type<typeof typedMap.schema>>
      );
    }
    return typedMap;
  }

  addItem(initialData?: Partial<A>): TypedYMap<TSchema> {
    const item = this.createItem(initialData);
    this.yarray.push([item.ymap]);
    return item;
  }

  /**
   * Safely creates and adds an item to the array. Returns E.right(item) on success,
   * or E.left(TypedYMapValidationError) if initial data fails validation.
   */
  addItemSafe(
    initialData?: Partial<A>
  ): E.Either<TypedYMap<TSchema>, TypedYMapValidationError> {
    try {
      // Creation/Update inside createItem validates the initialData
      const item = this.createItem(initialData);

      // Push the item's internal Y.Map
      this.yarray.push([item.ymap]);

      return E.right(item);
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        // Validation failure during item creation/initial data update
        return E.left(error);
      }
      throw error;
    }
  }
}

// -----------------------------------------------------------------------------
// 5. Factory Function
// -----------------------------------------------------------------------------

export function createTypedYMap<TSchema extends MapSchema<any, any>>(
  schema: TSchema,
  initialData?: Partial<S.Schema.Type<TSchema>>
): TypedYMap<TSchema> {
  const ymap = new Y.Map();

  const typedMap = new TypedYMap<TSchema>(ymap, schema);

  if (initialData) {
    typedMap.update(initialData);
  }

  return typedMap;
}

export function createTypedYArrayOfMaps<TSchema extends MapSchema<any, any>>(
  schema: TSchema,
  yarray: Y.Array<Y.Map<any>> = new Y.Array<Y.Map<any>>()
): TypedYArrayOfMaps<TSchema> {
  return new TypedYArrayOfMaps<TSchema>(yarray, schema);
}
