import { describe, it, expect, beforeEach } from "vitest";
import { TypedYMap, TypedYMapValidationError } from "./impl-extend"; // Assuming the refactored code is in typed-wrappers.ts
import * as S from "effect/Schema";
import { ParseError } from "effect/ParseResult";
import * as Y from "yjs";

// -----------------------------------------------------------------------------
// 1. Setup Schema
// -----------------------------------------------------------------------------

// Define a simple Effect Schema for a User Profile
const UserSchema = S.Struct({
  id: S.String,
  name: S.String,
  age: S.Number,
  isActive: S.Boolean,
});

// -----------------------------------------------------------------------------
// 2. Test Suite
// -----------------------------------------------------------------------------

describe("TypedYMap with Effect Schema Validation", () => {
  let doc: Y.Doc;
  let rootYmap: Y.Map<any>;
  let ymap: TypedYMap<typeof UserSchema>;
  let typedMap: TypedYMap<typeof UserSchema>;

  // Setup a fresh environment before each test
  beforeEach(() => {
    doc = new Y.Doc();
    rootYmap = doc.getMap("userMap");
    typedMap = new TypedYMap(UserSchema);
    ymap = typedMap;
    rootYmap.set("myMap", typedMap);
  });

  // ------------------------------------
  // Core Mutator Tests (Validation on Write)
  // ------------------------------------

  it("should successfully set a valid value", () => {
    typedMap.set("name", "Alice");
    expect(ymap.get("name")).toBe("Alice");
    expect(typedMap.get("name")).toBe("Alice");
  });

  it("should throw TypedYMapValidationError for invalid set operation (wrong type)", () => {
    // Attempt to set 'name' to a number (should be String)
    const invalidValue = 123 as any;

    expect(() => {
      typedMap.set("name", invalidValue);
    }).toThrow(TypedYMapValidationError);

    try {
      typedMap.set("name", invalidValue);
    } catch (e) {
      const error = e as TypedYMapValidationError;
      expect(error.message).toContain('Validation failed for key "name"');
      expect(error.parseError).toBeInstanceOf(ParseError);
    }
  });

  it("should successfully update with a partial, valid object", () => {
    typedMap.update({ name: "Bob", age: 30 });

    expect(ymap.get("name")).toBe("Bob");
    expect(ymap.get("age")).toBe(30);
  });

  it("should throw TypedYMapValidationError for invalid update operation", () => {
    // Attempt to update 'age' with a string (should be Number)
    const invalidUpdate = { age: "thirty" } as any;

    expect(() => {
      typedMap.update(invalidUpdate);
    }).toThrow(TypedYMapValidationError);

    try {
      typedMap.update(invalidUpdate);
    } catch (e) {
      const error = e as TypedYMapValidationError;
      expect(error.message).toContain("Object validation failed");
      expect(error.parseError).toBeInstanceOf(ParseError);
    }
  });

  // ------------------------------------
  // Safe Mutator Tests
  // ------------------------------------

  it("should handle invalid updates gracefully with updateSafe", () => {
    const result = typedMap.updateSafe({ age: "twenty" } as any);

    expect(result.success).toBe(false);
    expect(result.errors).toBeInstanceOf(ParseError);
    // Ensure the Y.Map was not modified
    expect(ymap.has("age")).toBe(false);
  });

  it("should handle valid updates with updateSafe", () => {
    const result = typedMap.updateSafe({ name: "Charlie" });
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(ymap.get("name")).toBe("Charlie");
  });

  // ------------------------------------
  // Accessor and Validation Tests
  // ------------------------------------

  it("should successfully validate the current state of the map", () => {
    // Add the required fields for full validation
    typedMap.update({ id: "u1", name: "Dave", age: 40, isActive: true });

    const validation = typedMap.validate();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toBeUndefined();
  });

  it("should fail validation if required fields are missing", () => {
    // Only set some fields
    typedMap.set("name", "Eve");

    const validation = typedMap.validate();
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toBeInstanceOf(ParseError);
  });

  it("should convert to object successfully with toObject", () => {
    const userData = { id: "u2", name: "Frank", age: 50, isActive: false };
    typedMap.update(userData);

    const obj = typedMap.toObject();
    expect(obj).toEqual(userData);
  });

  it("should throw error on toObject if current data is invalid/incomplete", () => {
    // Set only one field, making the full object invalid
    typedMap.set("id", "u3");

    expect(() => typedMap.toObject()).toThrow(TypedYMapValidationError);
  });

  it("should return raw object on toObjectSafe if current data is invalid", () => {
    // Set only one field, making the full object invalid
    typedMap.set("id", "u4");

    const safeObj = typedMap.toObjectSafe();
    // It returns the raw Y.Map JSON (Partial<User>)
    expect(safeObj).toEqual({ id: "u4" });
    // It should not be of type User (A) since it failed validation
    expect(safeObj?.hasOwnProperty("name")).toBe(false);
  });

  // it("should return undefined from getSafe for invalid raw data (simulating a faulty entry)", () => {
  //   // Manually bypass the typed wrapper to insert invalid data
  //   ymap.set("age", "not_a_number");

  //   // get() returns the raw invalid data
  //   expect(typedMap.get("age")).toBe("not_a_number");

  //   // getSafe() attempts validation and fails
  //   const safeValue = typedMap.getSafe("age");
  //   expect(safeValue).toBeUndefined();
  // });
});
