import { type ZodSchema, ZodError } from "zod";
import * as Y from "yjs";

// Base validation error class
export class TypedYMapValidationError extends Error {
  constructor(message: string, public readonly zodError?: ZodError) {
    super(message);
    this.name = "TypedYMapValidationError";
  }
}

// Enhanced TypedYMap class with Zod validation
export class TypedYMap<T> {
  constructor(
    public readonly ymap: Y.Map<any>,
    private readonly schema?: ZodSchema<T>
  ) {}

  // Validate a value against the schema
  private validateValue<K extends keyof T>(key: K, value: T[K]): T[K] {
    if (!this.schema) return value;

    try {
      // For partial validation of individual fields, we create a partial schema
      const partialSchema = this.schema.partial();
      const validationObject = { [key]: value } as Partial<T>;
      const result = partialSchema.parse(validationObject);
      return result[key]!;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new TypedYMapValidationError(
          `Validation failed for key "${String(key)}": ${error.errors
            .map((e) => e.message)
            .join(", ")}`,
          error
        );
      }
      throw error;
    }
  }

  // Validate entire object against schema
  private validateObject(obj: Partial<T>): Partial<T> {
    if (!this.schema) return obj;

    try {
      // Use partial schema for partial objects
      const partialSchema = this.schema.partial();
      return partialSchema.parse(obj);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new TypedYMapValidationError(
          `Object validation failed: ${error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`,
          error
        );
      }
      throw error;
    }
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    const validatedValue = this.validateValue(key, value);
    this.ymap.set(key as string, validatedValue);
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.ymap.get(key as string);
  }

  // Safe get with validation
  getSafe<K extends keyof T>(key: K): T[K] | undefined {
    const value = this.ymap.get(key as string);
    if (value === undefined) return undefined;

    try {
      return this.validateValue(key, value);
    } catch (error) {
      console.warn(`Value for key "${String(key)}" failed validation:`, error);
      return undefined;
    }
  }

  has<K extends keyof T>(key: K): boolean {
    return this.ymap.has(key as string);
  }

  delete<K extends keyof T>(key: K): void {
    this.ymap.delete(key as string);
  }

  observe(callback: (event: Y.YMapEvent<any>) => void): void {
    this.ymap.observe(callback);
  }

  unobserve(callback: (event: Y.YMapEvent<any>) => void): void {
    this.ymap.unobserve(callback);
  }

  toObject(): Partial<T> {
    const obj = this.ymap.toJSON();
    return this.schema ? this.validateObject(obj) : obj;
  }

  // Safe toObject that doesn't throw on validation errors
  toObjectSafe(): Partial<T> {
    try {
      return this.toObject();
    } catch (error) {
      console.warn("Object validation failed during toObject():", error);
      return this.ymap.toJSON(); // Return raw object if validation fails
    }
  }

  // Utility methods
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

  // Update multiple properties at once with validation
  update(updates: Partial<T>): void {
    const validatedUpdates = this.validateObject(updates);

    Object.entries(validatedUpdates).forEach(([key, value]) => {
      if (value !== undefined) {
        this.ymap.set(key, value);
      }
    });
  }

  // Safe update that doesn't throw on validation errors
  updateSafe(updates: Partial<T>): { success: boolean; errors?: ZodError } {
    try {
      this.update(updates);
      return { success: true };
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return { success: false, errors: error.zodError };
      }
      throw error;
    }
  }

  // Validate current state of the map
  validate(): { isValid: boolean; errors?: ZodError } {
    if (!this.schema) return { isValid: true };

    try {
      this.schema.parse(this.toObject());
      return { isValid: true };
    } catch (error) {
      if (error instanceof ZodError) {
        return { isValid: false, errors: error };
      }
      throw error;
    }
  }

  // Get schema for this map
  getSchema(): ZodSchema<T> | undefined {
    return this.schema;
  }
}

// Enhanced TypedYArrayOfMaps class with Zod validation
export class TypedYArrayOfMaps<T> {
  constructor(
    public readonly yarray: Y.Array<Y.Map<any>>,
    private readonly schema?: ZodSchema<T>
  ) {}

  // Create TypedYMap with schema
  private createTypedYMap(ymap: Y.Map<any>): TypedYMap<T> {
    return new TypedYMap<T>(ymap, this.schema);
  }

  // Validate array of items
  private validateItems(items: TypedYMap<T>[]): void {
    if (!this.schema) return;

    items.forEach((item, index) => {
      console.log("validation", item);
      const validation = item.validate();
      if (!validation.isValid) {
        throw new TypedYMapValidationError(
          `Item at index ${index} failed validation: ${validation.errors?.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`,
          validation.errors
        );
      }
    });
  }

  // Push TypedYMap objects by extracting their internal Y.Map
  push(items: TypedYMap<T>[]): void {
    this.validateItems(items);
    const ymaps = items.map((item) => item.ymap);
    this.yarray.push(ymaps);
  }

  // Safe push that doesn't throw on validation errors
  pushSafe(items: TypedYMap<T>[]): {
    success: boolean;
    errors?: TypedYMapValidationError[];
  } {
    try {
      this.push(items);
      return { success: true };
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return { success: false, errors: [error] };
      }
      throw error;
    }
  }

  // Insert TypedYMap objects at specific index
  insert(index: number, items: TypedYMap<T>[]): void {
    this.validateItems(items);
    const ymaps = items.map((item) => item.ymap);
    this.yarray.insert(index, ymaps);
  }

  // Safe insert
  insertSafe(
    index: number,
    items: TypedYMap<T>[]
  ): { success: boolean; errors?: TypedYMapValidationError[] } {
    try {
      this.insert(index, items);
      return { success: true };
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return { success: false, errors: [error] };
      }
      throw error;
    }
  }

  // Delete remains the same
  delete(index: number, length: number = 1): void {
    this.yarray.delete(index, length);
  }

  // Get returns TypedYMap wrapper around the Y.Map
  get(index: number): TypedYMap<T> | undefined {
    const ymap = this.yarray.get(index);
    return ymap ? this.createTypedYMap(ymap) : undefined;
  }

  length(): number {
    return this.yarray.length;
  }

  // Convert to array of TypedYMap objects
  toArray(): TypedYMap<T>[] {
    return this.yarray.toArray().map((ymap) => this.createTypedYMap(ymap));
  }

  // Convert to array of plain objects
  toObjectArray(): Partial<T>[] {
    return this.yarray.toArray().map((ymap) => {
      const typedMap = this.createTypedYMap(ymap);
      return typedMap.toObject();
    });
  }

  // Safe toObjectArray that handles validation errors gracefully
  toObjectArraySafe(): Partial<T>[] {
    return this.yarray.toArray().map((ymap) => {
      const typedMap = this.createTypedYMap(ymap);
      return typedMap.toObjectSafe();
    });
  }

  observe(callback: (event: Y.YArrayEvent<Y.Map<any>>) => void): void {
    this.yarray.observe(callback);
  }

  unobserve(callback: (event: Y.YArrayEvent<Y.Map<any>>) => void): void {
    this.yarray.unobserve(callback);
  }

  // Utility methods for common operations

  // Find by a property value
  find(predicate: (item: TypedYMap<T>) => boolean): TypedYMap<T> | undefined {
    return this.toArray().find(predicate);
  }

  // Find index by property value
  findIndex(predicate: (item: TypedYMap<T>) => boolean): number {
    return this.toArray().findIndex(predicate);
  }

  // Filter items
  filter(predicate: (item: TypedYMap<T>) => boolean): TypedYMap<T>[] {
    return this.toArray().filter(predicate);
  }

  // Map over items
  map<U>(callback: (item: TypedYMap<T>, index: number) => U): U[] {
    return this.toArray().map(callback);
  }

  // Update an item by index
  updateAt(index: number, updates: Partial<T>): boolean {
    const item = this.get(index);
    if (!item) return false;

    try {
      item.update(updates);
      return true;
    } catch (error) {
      console.warn(`Update failed for item at index ${index}:`, error);
      return false;
    }
  }

  // Safe update at index
  updateAtSafe(
    index: number,
    updates: Partial<T>
  ): { success: boolean; errors?: ZodError } {
    const item = this.get(index);
    if (!item) return { success: false };

    return item.updateSafe(updates);
  }

  // Update first item matching predicate
  updateWhere(
    predicate: (item: TypedYMap<T>) => boolean,
    updates: Partial<T>
  ): boolean {
    const item = this.find(predicate);
    if (!item) return false;

    try {
      item.update(updates);
      return true;
    } catch (error) {
      console.warn("Update failed for item matching predicate:", error);
      return false;
    }
  }

  // Safe update where
  updateWhereSafe(
    predicate: (item: TypedYMap<T>) => boolean,
    updates: Partial<T>
  ): { success: boolean; errors?: ZodError } {
    const item = this.find(predicate);
    if (!item) return { success: false };

    return item.updateSafe(updates);
  }

  // Remove first item matching predicate
  removeWhere(predicate: (item: TypedYMap<T>) => boolean): boolean {
    const index = this.findIndex(predicate);
    if (index === -1) return false;

    this.delete(index, 1);
    return true;
  }

  // Sort items in place (WARNING: This recreates the entire array)
  sort(compareFn: (a: TypedYMap<T>, b: TypedYMap<T>) => number): void {
    const sortedItems = this.toArray().sort(compareFn);

    // Clear array and re-add sorted items
    this.yarray.delete(0, this.length());
    this.push(sortedItems);
  }

  // Validate all items in the array
  validateAll(): {
    isValid: boolean;
    errors: { index: number; errors: ZodError }[];
  } {
    const errors: { index: number; errors: ZodError }[] = [];

    this.toArray().forEach((item, index) => {
      const validation = item.validate();
      if (!validation.isValid && validation.errors) {
        errors.push({ index, errors: validation.errors });
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Get schema for this array
  getSchema(): ZodSchema<T> | undefined {
    return this.schema;
  }

  // Create a new TypedYMap with validation
  createItem(initialData?: Partial<T>): TypedYMap<T> {
    const ymap = new Y.Map();
    const typedMap = this.createTypedYMap(ymap);

    if (initialData) {
      typedMap.update(initialData);
    }

    return typedMap;
  }

  // Create and add a new item
  addItem(initialData?: Partial<T>): TypedYMap<T> {
    const item = this.createItem(initialData);
    this.yarray.push([item.ymap]);
    return item;
  }

  // Safe create and add
  addItemSafe(initialData?: Partial<T>): {
    success: boolean;
    item?: TypedYMap<T>;
    errors?: TypedYMapValidationError[];
  } {
    try {
      const item = this.addItem(initialData);
      return { success: true, item };
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return { success: false, errors: [error] };
      }
      throw error;
    }
  }
}

// Factory functions for easier creation
export function createTypedYMap<T>(
  schema?: ZodSchema<T>,
  initialData?: Partial<T>
): TypedYMap<T> {
  const ymap = new Y.Map();
  const typedMap = new TypedYMap<T>(ymap, schema);

  if (initialData) {
    typedMap.update(initialData);
  }

  return typedMap;
}

export function createTypedYArrayOfMaps<T>(
  p0: Y.Array<unknown>,
  layerFrameMaskSchema: unknown,
  schema?: ZodSchema<T>
): TypedYArrayOfMaps<T> {
  const yarray = new Y.Array<Y.Map<any>>();
  return new TypedYArrayOfMaps<T>(yarray, schema);
}
