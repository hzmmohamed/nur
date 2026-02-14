import { describe, it, expect, beforeEach } from "vitest";
import { TypedYMap, TypedYMapValidationError } from "./impl-composition"; // Assuming the refactored code is in typed-wrappers.ts
import * as S from "effect/Schema";
import * as E from "effect/Either";
import { ParseError } from "effect/ParseResult";
import * as Y from "yjs";

// Assuming the classes are imported from the unified module
import { TypedYArrayOfMaps, createTypedYArrayOfMaps } from "./impl-composition";

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
  let ymap: Y.Map<any>;
  let typedMap: TypedYMap<typeof UserSchema>;

  // Setup a fresh environment before each test
  beforeEach(() => {
    doc = new Y.Doc();
    ymap = doc.getMap("user");
    typedMap = new TypedYMap(ymap, UserSchema);
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

    expect(E.isLeft(result)).toBe(true);
    expect(E.getLeft(result)).toBeInstanceOf(TypedYMapValidationError);
    // Ensure the Y.Map was not modified
    expect(ymap.has("age")).toBe(false);
  });

  it("should handle valid updates with updateSafe", () => {
    const result = typedMap.updateSafe({ name: "Charlie" });
    expect(E.isRight(result)).toBe(true);
    expect(ymap.get("name")).toBe("Charlie");
  });

  // ------------------------------------
  // Accessor and Validation Tests
  // ------------------------------------

  it("should successfully validate the current state of the map", () => {
    // Add the required fields for full validation
    typedMap.update({ id: "u1", name: "Dave", age: 40, isActive: true });

    const validation = typedMap.validate();
    expect(E.isRight(validation)).toBe(true);
  });

  it("should fail validation if required fields are missing", () => {
    // Only set some fields
    typedMap.set("name", "Eve");

    const validation = typedMap.validate();
    expect(E.isLeft(validation)).toBe(true);
    expect(E.getLeft(validation)).toBeInstanceOf(ParseError);
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

  it("should return undefined from getSafe for invalid raw data (simulating a faulty entry)", () => {
    // Manually bypass the typed wrapper to insert invalid data
    ymap.set("age", "not_a_number");

    // get() returns the raw invalid data
    expect(typedMap.get("age")).toBe("not_a_number");

    // getSafe() attempts validation and fails
    const safeValue = typedMap.getSafe("age");
    expect(safeValue).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// 1. Setup Schema
// -----------------------------------------------------------------------------

// Item Schema for the array (e.g., a Todo Item)
const TodoSchema = S.Struct({
  id: S.NonEmptyString,
  text: S.NonEmptyString,
  completed: S.Boolean,
  priority: S.Literal("High", "Medium", "Low"),
});
type Todo = S.Schema.Type<typeof TodoSchema>;

// -----------------------------------------------------------------------------
// 2. Test Suite
// -----------------------------------------------------------------------------

describe("TypedYArrayOfMaps with Effect Schema Validation", () => {
  let doc: Y.Doc;
  let yarray: Y.Array<Y.Map<any>>;
  let typedArray: TypedYArrayOfMaps<typeof TodoSchema>;

  const validItem1Data: Todo = {
    id: "t1",
    text: "Buy groceries",
    completed: false,
    priority: "High",
  };
  const validItem2Data: Todo = {
    id: "t2",
    text: "Write tests",
    completed: true,
    priority: "Medium",
  };
  const invalidItemData = {
    id: "t3",
    text: "",
    completed: false,
    priority: "Invalid",
  }; // text is empty, priority is invalid

  // Helper to create a fully validated TypedYMap instance
  const createValidatedItem = (
    data: Partial<Todo>
  ): TypedYMap<typeof TodoSchema> => {
    const itemYMap = new Y.Map();
    const item = new TypedYMap(itemYMap, TodoSchema);
    item.update(data);
    return item;
  };

  beforeEach(() => {
    doc = new Y.Doc();
    yarray = doc.getArray("todoList");
    typedArray = createTypedYArrayOfMaps(TodoSchema, yarray);
  });

  // ------------------------------------
  // Creation and Addition Tests
  // ------------------------------------

  it("should correctly initialize an empty array", () => {
    expect(typedArray.length()).toBe(0);
    expect(yarray.length).toBe(0);
  });

  it("should add an item using addItem() and correctly wrap the Y.Map", () => {
    const item = typedArray.addItem(validItem1Data);

    expect(typedArray.length()).toBe(1);
    expect(yarray.length).toBe(1);

    // Check that the returned item is a TypedYMap instance
    expect(item).toBeInstanceOf(TypedYMap);

    // Check the data in the underlying Y.Map
    const rawYMap = yarray.get(0);
    expect(rawYMap.get("text")).toBe("Buy groceries");
  });

  it("should push multiple valid items using push()", () => {
    const item1 = createValidatedItem(validItem1Data);
    const item2 = createValidatedItem(validItem2Data);
    typedArray.push([item1, item2]);

    expect(typedArray.length()).toBe(2);
    expect(typedArray.get(1)?.get("text")).toBe("Write tests");
  });

  it("should block push() of an invalid item and throw validation error", () => {
    // @ts-expect-error
    const invalidItem = createValidatedItem(invalidItemData); // This item is invalid but created

    // Attempting to push an invalid item should throw on validation
    expect(() => {
      typedArray.push([invalidItem]);
    }).toThrow(TypedYMapValidationError);

    // Array should remain empty after the failed push
    expect(typedArray.length()).toBe(0);
  });

  // ------------------------------------
  // Access and Conversion Tests
  // ------------------------------------

  it("should correctly return a TypedYMap wrapper on get(index)", () => {
    typedArray.addItem(validItem1Data);

    const itemWrapper = typedArray.get(0);

    expect(itemWrapper).toBeInstanceOf(TypedYMap);
    expect(itemWrapper?.get("priority")).toBe("High");
  });

  it("should convert the array to an array of validated plain objects using toObjectArray()", () => {
    typedArray.addItem(validItem1Data);
    typedArray.addItem(validItem2Data);

    const objectArray = typedArray.toObjectArray();

    expect(objectArray).toHaveLength(2);
    expect(objectArray[0]).toEqual(validItem1Data);
  });

  it("should handle invalid items gracefully in toObjectArraySafe()", () => {
    // 1. Add valid item
    typedArray.addItem(validItem1Data);

    // 2. Manually tamper with the second item's data to make it invalid after insert
    const invalidYMap = new Y.Map();
    invalidYMap.set("id", "t3");
    invalidYMap.set("text", "Invalid Text");
    invalidYMap.set("completed", false);
    invalidYMap.set("priority", "Critical"); // Invalid literal value
    yarray.push([invalidYMap]);

    expect(typedArray.length()).toBe(2);

    const safeObjects = typedArray.toObjectArraySafe();

    // The first item is validated and returned fully
    expect(safeObjects[0]).toEqual(validItem1Data);

    // The second item should fail validation in toObjectSafe and return the raw/partial object
    expect(safeObjects[1]).toEqual(
      expect.objectContaining({
        id: "t3",
        priority: "Critical",
      })
    );
  });

  // ------------------------------------
  // Mutation and Utility Tests
  // ------------------------------------

  it("should update an item correctly using updateAt()", () => {
    typedArray.addItem(validItem1Data);

    const success = typedArray.updateAt(0, {
      completed: true,
      priority: "Low",
    });

    expect(success).toBe(true);
    expect(typedArray.get(0)?.get("completed")).toBe(true);
    expect(typedArray.get(0)?.get("priority")).toBe("Low");
  });

  it("should block invalid updates using updateAt() and return false", () => {
    typedArray.addItem(validItem1Data);

    // Attempt to set 'text' to an empty string (invalid per schema S.nonEmpty)
    const success = typedArray.updateAt(0, { text: "" as any });

    expect(success).toBe(false);
    // Ensure the data was NOT mutated
    expect(typedArray.get(0)?.get("text")).toBe(validItem1Data.text);
  });

  it("should delete an item correctly", () => {
    typedArray.addItem(validItem1Data);
    typedArray.addItem(validItem2Data);

    typedArray.delete(0);

    expect(typedArray.length()).toBe(1);
    expect(typedArray.get(0)?.get("id")).toBe("t2");
  });

  it("should use toArray() to return an array of TypedYMap wrappers for external processing", () => {
    typedArray.addItem(validItem1Data);
    typedArray.addItem(validItem2Data);

    const wrappers = typedArray.toArray();
    expect(wrappers).toHaveLength(2);

    // Test external logic on the wrapper
    const firstItem = wrappers[0];
    firstItem.set("text", "New task description");

    // Verify Yjs reflects the change
    expect(typedArray.get(0)?.get("text")).toBe("New task description");
  });
});
