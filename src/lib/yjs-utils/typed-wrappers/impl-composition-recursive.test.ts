import { describe, it, expect, beforeEach } from "vitest";
import * as S from "effect/Schema";
import * as Y from "yjs";
import { TypedYMap } from "./temp2";

// ============================================================================
// TEST SUITE: Top-level Record with SIMPLE values
// ============================================================================

describe("TypedYMap - Top-level Record with Simple Values", () => {
  const SimpleScores = S.Record({
    key: S.NonEmptyString,
    value: S.Number,
  });

  let ydoc: Y.Doc;
  let ymap: Y.Map<any>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    ymap = ydoc.getMap("scores");
  });

  it("should set and get simple values", () => {
    const scoresMap = TypedYMap.create(SimpleScores, ymap);

    scoresMap.setSimpleValue("player1", 100);
    scoresMap.setSimpleValue("player2", 250);
    scoresMap.setSimpleValue("player3", 175);

    expect(scoresMap.getSimpleValue("player1")).toBe(100);
    expect(scoresMap.getSimpleValue("player2")).toBe(250);
    expect(scoresMap.getSimpleValue("player3")).toBe(175);
  });

  it("should convert to plain object", () => {
    const scoresMap = TypedYMap.create(SimpleScores, ymap);

    scoresMap.setSimpleValue("player1", 100);
    scoresMap.setSimpleValue("player2", 250);

    expect(scoresMap.toObject()).toEqual({
      player1: 100,
      player2: 250,
    });
  });

  it("should initialize with data", () => {
    const scoresMap = TypedYMap.create(SimpleScores, ymap, {
      alice: 500,
      bob: 300,
      charlie: 450,
    });

    expect(scoresMap.getSimpleValue("alice")).toBe(500);
    expect(scoresMap.getSimpleValue("bob")).toBe(300);
    expect(scoresMap.getSimpleValue("charlie")).toBe(450);
  });

  it("should return undefined for non-existent keys", () => {
    const scoresMap = TypedYMap.create(SimpleScores, ymap);

    expect(scoresMap.getSimpleValue("nonexistent")).toBeUndefined();
  });

  it("should throw error when using Struct methods on Record schema", () => {
    const scoresMap = TypedYMap.create(SimpleScores, ymap);

    expect(() => {
      // @ts-expect-error - Testing runtime error
      scoresMap.get("player1");
    }).toThrow("Cannot use get() on a Record schema");

    expect(() => {
      // @ts-expect-error - Testing runtime error
      scoresMap.getNestedMap("player1");
    }).toThrow("Cannot use getNestedMap() on a Record schema");
  });
});

// ============================================================================
// TEST SUITE: Scenario 5 - Triple-nested Records with COMPLEX values
// ============================================================================

describe("TypedYMap - Triple-nested Records", () => {
  const Address = S.Struct({
    nestedRecords: S.Record({
      key: S.NonEmptyString,
      value: S.Record({
        key: S.NonEmptyString,
        value: S.Record({
          key: S.NonEmptyString,
          value: S.Positive,
        }),
      }),
    }),
  });

  let ydoc: Y.Doc;
  let ymap: Y.Map<any>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    ymap = ydoc.getMap("address");
  });

  it("should handle triple-nested record access", () => {
    const map = TypedYMap.create(Address, ymap);

    const level1 = map.getFromRecord("nestedRecords", "building1");
    expect(level1).toBeDefined();

    if (level1) {
      const level2 = level1.getNestedRecord("floor2");
      expect(level2).toBeDefined();

      if (level2) {
        level2.setSimpleValue("room303", 42);
        expect(level2.getSimpleValue("room303")).toBe(42);
      }
    }
  });

  it("should support chained access", () => {
    const map = TypedYMap.create(Address, ymap);

    map
      .getFromRecord("nestedRecords", "building1")
      ?.getNestedRecord("floor2")
      ?.setSimpleValue("room303", 42);

    const room303Value = map
      .getFromRecord("nestedRecords", "building1")
      ?.getNestedRecord("floor2")
      ?.getSimpleValue("room303");

    expect(room303Value).toBe(42);
  });

  it("should initialize with nested data and convert to object", () => {
    const addressMap = TypedYMap.create(Address, ymap, {
      nestedRecords: {
        building1: {
          floor1: {
            room101: 10,
            room102: 15,
          },
          floor2: {
            room201: 20,
            room202: 25,
          },
        },
        building2: {
          floor1: {
            room101: 30,
          },
        },
      },
    });

    const building1Floor2 = addressMap.getFromRecord(
      "nestedRecords",
      "building1"
    );
    expect(building1Floor2).toBeDefined();

    if (building1Floor2) {
      const floor2Data = building1Floor2.getNestedRecord("floor2");
      expect(floor2Data).toBeDefined();

      if (floor2Data) {
        expect(floor2Data.getSimpleValue("room201")).toBe(20);
        expect(floor2Data.toObject()).toEqual({
          room201: 20,
          room202: 25,
        });
      }
    }

    expect(addressMap.toObject()).toEqual({
      nestedRecords: {
        building1: {
          floor1: { room101: 10, room102: 15 },
          floor2: { room201: 20, room202: 25 },
        },
        building2: {
          floor1: { room101: 30 },
        },
      },
    });
  });
});

// ============================================================================
// TEST SUITE: COMPREHENSIVE - All 5 scenarios
// ============================================================================

describe("TypedYMap - Comprehensive Schema (All Scenarios)", () => {
  const ComprehensiveSchema = S.Struct({
    // Scenario 1: Simple field
    id: S.Number,
    name: S.String,

    // Scenario 2: Nested struct
    address: S.Struct({
      street: S.String,
      city: S.String,
      zipCode: S.Number,
    }),

    // Scenario 3: Record with simple values
    metadata: S.Record({
      key: S.NonEmptyString,
      value: S.String,
    }),

    // Scenario 4: Record with struct values
    contacts: S.Record({
      key: S.NonEmptyString,
      value: S.Struct({
        email: S.String,
        phone: S.String,
      }),
    }),

    // Scenario 5: Record with record values
    permissions: S.Record({
      key: S.NonEmptyString,
      value: S.Record({
        key: S.NonEmptyString,
        value: S.Boolean,
      }),
    }),
  });

  let ydoc: Y.Doc;
  let ymap: Y.Map<any>;
  let comprehensive: TypedYMap<typeof ComprehensiveSchema>;

  beforeEach(() => {
    ydoc = new Y.Doc();
    ymap = ydoc.getMap("comprehensive");
    comprehensive = TypedYMap.create(ComprehensiveSchema, ymap);
  });

  describe("Scenario 1: Simple fields", () => {
    it("should get and set simple fields", () => {
      comprehensive.set("id", 123);
      comprehensive.set("name", "John Doe");

      expect(comprehensive.get("id")).toBe(123);
      expect(comprehensive.get("name")).toBe("John Doe");
    });

    it("should validate simple fields", () => {
      comprehensive.set("id", 123);
      expect(comprehensive.getSafe("id")).toBe(123);
    });
  });

  describe("Scenario 2: Nested struct", () => {
    it("should access and modify nested struct", () => {
      const addressMap = comprehensive.getNestedMap("address");
      expect(addressMap).toBeDefined();

      addressMap?.set("street", "123 Main St");
      addressMap?.set("city", "New York");
      addressMap?.set("zipCode", 10001);

      expect(addressMap?.toObject()).toEqual({
        street: "123 Main St",
        city: "New York",
        zipCode: 10001,
      });
    });
  });

  describe("Scenario 3: Simple record", () => {
    it("should set and get individual entries", () => {
      comprehensive.setInSimpleRecord("metadata", "theme", "dark");
      comprehensive.setInSimpleRecord("metadata", "language", "en");

      expect(comprehensive.getFromSimpleRecord("metadata", "theme")).toBe(
        "dark"
      );
      expect(comprehensive.getFromSimpleRecord("metadata", "language")).toBe(
        "en"
      );
    });

    it("should get entire simple record as object", () => {
      comprehensive.setInSimpleRecord("metadata", "theme", "dark");
      comprehensive.setInSimpleRecord("metadata", "language", "en");

      expect(comprehensive.getSimpleRecord("metadata")).toEqual({
        theme: "dark",
        language: "en",
      });
    });
  });

  describe("Scenario 4: Record with struct values", () => {
    it("should create and modify struct entries in record", () => {
      const contact1 = comprehensive.getFromRecord("contacts", "home");
      expect(contact1).toBeDefined();

      contact1?.set("email", "john@home.com");
      contact1?.set("phone", "555-0001");

      expect(contact1?.toObject()).toEqual({
        email: "john@home.com",
        phone: "555-0001",
      });
    });

    it("should handle multiple entries", () => {
      const home = comprehensive.getFromRecord("contacts", "home");
      home?.set("email", "john@home.com");
      home?.set("phone", "555-0001");

      const work = comprehensive.getFromRecord("contacts", "work");
      work?.set("email", "john@work.com");
      work?.set("phone", "555-0002");

      expect(home?.get("email")).toBe("john@home.com");
      expect(work?.get("email")).toBe("john@work.com");
    });
  });

  describe("Scenario 5: Record with record values (double-nested)", () => {
    it("should handle double-nested records", () => {
      const adminPerms = comprehensive.getFromRecord("permissions", "admin");
      expect(adminPerms).toBeDefined();

      adminPerms?.setSimpleValue("read", true);
      adminPerms?.setSimpleValue("write", true);
      adminPerms?.setSimpleValue("delete", true);

      expect(adminPerms?.toObject()).toEqual({
        read: true,
        write: true,
        delete: true,
      });
    });

    it("should get individual permission values", () => {
      const userPerms = comprehensive.getFromRecord("permissions", "user");
      userPerms?.setSimpleValue("read", true);
      userPerms?.setSimpleValue("write", false);

      expect(userPerms?.getSimpleValue("read")).toBe(true);
      expect(userPerms?.getSimpleValue("write")).toBe(false);
    });
  });

  describe("Full object conversion", () => {
    it("should convert entire comprehensive schema to object", () => {
      comprehensive.set("id", 123);
      comprehensive.set("name", "John Doe");

      const address = comprehensive.getNestedMap("address");
      address?.set("street", "123 Main St");
      address?.set("city", "New York");
      address?.set("zipCode", 10001);

      comprehensive.setInSimpleRecord("metadata", "theme", "dark");
      comprehensive.setInSimpleRecord("metadata", "language", "en");

      const home = comprehensive.getFromRecord("contacts", "home");
      home?.set("email", "john@home.com");
      home?.set("phone", "555-0001");

      const adminPerms = comprehensive.getFromRecord("permissions", "admin");
      adminPerms?.setSimpleValue("read", true);
      adminPerms?.setSimpleValue("write", true);

      expect(comprehensive.toObject()).toEqual({
        id: 123,
        name: "John Doe",
        address: {
          street: "123 Main St",
          city: "New York",
          zipCode: 10001,
        },
        metadata: {
          theme: "dark",
          language: "en",
        },
        contacts: {
          home: {
            email: "john@home.com",
            phone: "555-0001",
          },
        },
        permissions: {
          admin: {
            read: true,
            write: true,
          },
        },
      });
    });
  });
});

// ============================================================================
// TEST SUITE: Edge cases and error handling
// ============================================================================

describe("TypedYMap - Edge Cases", () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });

  it("should handle empty records", () => {
    const schema = S.Record({
      key: S.String,
      value: S.Number,
    });
    const ymap = ydoc.getMap("empty");
    const map = TypedYMap.create(schema, ymap);

    expect(map.toObject()).toEqual({});
    expect(map.size()).toBe(0);
  });

  it("should handle validation errors gracefully with updateSafe", () => {
    const schema = S.Struct({
      age: S.Number,
    });
    const ymap = ydoc.getMap("validation");
    const map = TypedYMap.create(schema, ymap);

    const result = map.updateSafe({ age: 25 });
    expect(result.success).toBe(true);

    // Note: Effect Schema validation happens at decode time
    // Invalid updates would be caught during toObject() validation
  });

  it("should support has() method", () => {
    const schema = S.Struct({
      name: S.String,
    });
    const ymap = ydoc.getMap("has-test");
    const map = TypedYMap.create(schema, ymap, { name: "Alice" });

    expect(map.has("name")).toBe(true);
  });

  it("should support delete() method", () => {
    const schema = S.Struct({
      name: S.String,
      age: S.Number,
    });
    const ymap = ydoc.getMap("delete-test");
    const map = TypedYMap.create(schema, ymap, { name: "Alice", age: 30 });

    map.delete("age");
    expect(map.has("age")).toBe(false);
  });

  it("should support clear() method", () => {
    const schema = S.Record({
      key: S.String,
      value: S.Number,
    });

    const ymap = ydoc.getMap("clear-test");
    const map = TypedYMap.create(schema, ymap, {
      a: 1,
      b: 2,
      c: 3,
    });

    expect(map.size()).toBe(3);
    map.clear();
    expect(map.size()).toBe(0);
    expect(map.toObject()).toEqual({});
  });

  it("should support keys(), values(), and entries()", () => {
    const schema = S.Record({
      key: S.String,
      value: S.Number,
    });
    const ymap = ydoc.getMap("iteration-test");
    const map = TypedYMap.create(schema, ymap, {
      a: 1,
      b: 2,
    });

    expect(map.keys()).toEqual(expect.arrayContaining(["a", "b"]));
    expect(map.values()).toEqual(expect.arrayContaining([1, 2]));
    expect(map.entries()).toEqual(
      expect.arrayContaining([
        ["a", 1],
        ["b", 2],
      ])
    );
  });
});

// ============================================================================
// TEST SUITE: Top-level Record with Complex Values
// ============================================================================

describe("TypedYMap - Top-level Record with Complex Values", () => {
  let ydoc: Y.Doc;

  beforeEach(() => {
    ydoc = new Y.Doc();
  });
  const PersonRecord = S.Record({
    key: S.String,
    value: S.Struct({
      name: S.String,
      age: S.Number,
    }),
  });

  it("should handle top-level record with struct values", () => {
    const ymap = ydoc.getMap("empty");
    const map = TypedYMap.create(PersonRecord, ymap);

    const person1 = map.getNestedRecord("person1");
    console.log("test");
    person1?.set("name", "Alice");
    person1?.set("age", 30);
    console.log("test", person1?.toObject());

    expect(person1?.toObject()).toEqual({
      name: "Alice",
      age: 30,
    });
  });

  it("should handle multiple entries with struct values", () => {
    const ymap = ydoc.getMap("empty");

    const map = TypedYMap.create(PersonRecord, ymap, {
      alice: { name: "Alice", age: 30 },
      bob: { name: "Bob", age: 25 },
    });

    const alice = map.getNestedRecord("alice");
    const bob = map.getNestedRecord("bob");

    expect(alice?.get("name")).toBe("Alice");
    expect(alice?.get("age")).toBe(30);
    expect(bob?.get("name")).toBe("Bob");
    expect(bob?.get("age")).toBe(25);
  });

  it("should convert to plain object", () => {
    const ymap = ydoc.getMap("empty");
    const map = TypedYMap.create(PersonRecord, ymap, {
      alice: { name: "Alice", age: 30 },
      bob: { name: "Bob", age: 25 },
    });

    expect(map.toObject()).toEqual({
      alice: { name: "Alice", age: 30 },
      bob: { name: "Bob", age: 25 },
    });
  });

  it("should throw error when using simple value methods on complex record", () => {
    const map = TypedYMap.create(PersonRecord);

    expect(() => {
      map.getSimpleValue("person1");
    }).toThrow("getSimpleValue() only works with simple value schemas");

    expect(() => {
      // @ts-expect-error
      map.setSimpleValue("person1", { name: "Alice", age: 30 });
    }).toThrow("setSimpleValue() only works with simple value schemas");
  });
});
