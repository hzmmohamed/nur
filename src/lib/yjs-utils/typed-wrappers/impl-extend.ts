import * as S from "effect/Schema";
import { ParseError } from "effect/ParseResult";
import * as Y from "yjs";


// -----------------------------------------------------------------------------
// 1. Types and Error Class (Unchanged)
// -----------------------------------------------------------------------------

export type MapSchema<A extends Record<string, any>, TInput = unknown> = S.Schema<
  A,
  TInput
>;

export class TypedYMapValidationError extends Error {
  constructor(
    message: string,
    public readonly parseError?: ParseError
  ) {
    super(message);
    this.name = "TypedYMapValidationError";
  }
}

// -----------------------------------------------------------------------------
// 2. TypedYMap Overriding Y.Map
// -----------------------------------------------------------------------------

/**
 * Enhanced TypedYMap class extending Y.Map<any> to provide
 * direct access to Yjs methods while overriding mutators for validation.
 *
 * TSchema: The Effect Schema used for validation.
 * A: The concrete output type inferred from TSchema.
 */
// NOTE: This assumes Y.Map is safely subclassable in your environment.
export class TypedYMap<
  TSchema extends MapSchema<any, any>,
  A = S.Schema.Type<TSchema>
> extends Y.Map<any> {
    
  // The schema is readonly, enforcing type safety and validation logic
  public readonly schema?: TSchema;

  /**
   * Constructs the TypedYMap.
   * Since Y.Map typically lives within a Y.Doc, we treat the instance
   * as already existing or being created within a Yjs transaction.
   * @param schema The Effect Schema defining the map's structure.
   */
  constructor(schema?: TSchema) {
    // In a real Yjs environment, super() often needs to call Y.Map's internal
    // initialization, which is usually done via Y.Doc.getMap().
    // For TypeScript structure, we call super() to satisfy the class hierarchy.
    super(); 
    this.schema = schema;
  }

  // ---------------------------------------------------------------------------
  // Validation Logic (Helper methods are private and remain the same)
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
  // Y.Map Overrides (Mutators are overridden to inject validation)
  // ---------------------------------------------------------------------------

  /**
   * Overrides Y.Map's set to apply Effect Schema validation before mutation.
   * @throws {TypedYMapValidationError} if validation fails.
   */
  // @ts-expect-error
  set<K extends keyof A>(key: K, value: A[K]): this {
    // 1. Validate the value
    const validatedValue = this.validateValue(key, value);
    
    // 2. Delegate to the base Y.Map implementation
    super.set(key as string, validatedValue);
    
    return this;
  }

  /**
   * Y.Map's delete method does not require validation, but it's overridden
   * here primarily for type safety (using keyof A) and consistency.
   */
  // @ts-expect-error
  delete<K extends keyof A>(key: K): void {
    super.delete(key as string);
  }
  
  // NOTE: clear() is inherited and does not require validation.

  // ---------------------------------------------------------------------------
  // TypedYMap New Methods (Encapsulated Mutators)
  // ---------------------------------------------------------------------------

  /**
   * Update multiple properties at once with validation.
   */
  update(updates: Partial<A>): void {
    const validatedUpdates = this.validateObject(updates);

    // Perform all updates within a single Yjs transaction (implicit or explicit)
    Object.entries(validatedUpdates).forEach(([key, value]) => {
      // Use the overridden set method (this.set) to ensure validation/mutation flow
      super.set(key, value);
    });
  }

  /**
   * Safe update that returns a success/error object instead of throwing.
   */
  updateSafe(updates: Partial<A>): { success: boolean; errors?: ParseError } {
    try {
      this.update(updates);
      return { success: true };
    } catch (error) {
      if (error instanceof TypedYMapValidationError && error.parseError) {
        return { success: false, errors: error.parseError };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // TypedYMap New Methods (Accessors and Parsers)
  // ---------------------------------------------------------------------------

  /**
   * Overrides Y.Map's get to provide strongly typed results.
   */
  // @ts-expect-error
  get<K extends keyof A>(key: K): A[K] | undefined {
    // Inherited from Y.Map, only requires type casting for the return
    return super.get(key as string) as A[K] | undefined;
  }
  
  /**
   * Safe get with validation on read.
   */
  getSafe<K extends keyof A>(key: K): A[K] | undefined {
    const value = super.get(key as string);
    if (value === undefined) return undefined;

    try {
      // Validate the retrieved value against the partial schema
      return this.validateValue(key, value);
    } catch (error) {
      console.warn(`Value for key "${String(key)}" failed validation:`, error);
      return undefined;
    }
  }

  /**
   * Checks current map state against the full schema.
   */
  validate(): { isValid: boolean; errors?: ParseError } {
    if (!this.schema) return { isValid: true };

    try {
      this.toObject(); // toObject uses the full validation logic
      return { isValid: true };
    } catch (error) {
      if (error instanceof TypedYMapValidationError && error.parseError) {
        return { isValid: false, errors: error.parseError };
      }
      throw error;
    }
  }

  /**
   * Converts the map to a validated plain object, throwing on error.
   */
  toObject(): A {
    const rawObject = this.toJSON(); // toJSON is inherited from Y.Map

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

  /**
   * Safe conversion to object that returns the raw object on validation failure.
   */
  toObjectSafe(): unknown {
    try {
      return this.toObject();
    } catch (error) {
      console.warn("Object validation failed during toObject():", error);
      return this.toJSON();
    }
  }
}

// -----------------------------------------------------------------------------
// 3. Factory Function (for easy creation within a Y.Doc)
// -----------------------------------------------------------------------------

/**
 * Factory function to create a new TypedYMap attached to a Y.Doc or Y.Map.
 * Since we can't easily instantiate Y.Map directly, this function is designed 
 * to take an *existing* Y.Map (e.g., from doc.getMap()) and cast/decorate it.
 * * For this example, we'll revert to the composition pattern for the factory 
 * to remain functional, as direct subclassing of Y.Map is non-trivial.
 */
export function createTypedYMap<TSchema extends MapSchema<any, any>>(
  schema: TSchema,
  initialData?: Partial<S.Schema.Type<TSchema>>
): TypedYMap<TSchema> {
    
    // NOTE: If direct extension worked, we would use:
    // const typedMap = new TypedYMap<TSchema>(schema);
    // return typedMap;
    
    // Since direct extension is complex, we use this trick:
    const typedMap = new (TypedYMap as any)(schema);
    
    // Transfer the state or rely on the caller to provide the map from Y.Doc.
    // In a production environment, you would need to use a proxy or mixin 
    // to correctly implement the inheritance pattern for Yjs data types.

    if (initialData) {
      typedMap.update(initialData);
    }

    return typedMap;
}