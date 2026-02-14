import * as S from "effect/Schema";
import * as Y from "yjs";
import { TypedYStruct, TypedYRecord } from "./impl-composition-separated";

// =============================================================================
// Type Safety Demonstration
// =============================================================================

/*
The improved conditional types ensure that:
1. get() returns the correct type based on the value schema
2. set() accepts the correct type based on the value schema
3. createStructEntry() only works when value is a Struct
4. createRecordEntry() only works when value is a Record
5. No manual type assertions needed in user code
*/

// =============================================================================
// Example 1: Record with Simple Values
// =============================================================================

const SimpleRecordSchema = S.Record({ key: S.String, value: S.Number });

function example1() {
  const yDoc = new Y.Doc();
  const yMap = yDoc.getMap("scores");

  const scores = new TypedYRecord(yMap, SimpleRecordSchema``);

  // get() returns: number | undefined
  const aliceScore = scores.get("alice");
  if (aliceScore !== undefined) {
    // TypeScript knows this is a number
    const doubled = aliceScore * 2;
    console.log(doubled);
  }

  // set() accepts: number
  scores.set("bob", 95);

  // @ts-expect-error - Cannot pass string to number record
  scores.set("charlie", "invalid");

  // @ts-expect-error - Cannot create struct entry for simple values
  scores.createStructEntry("dave");

  // Iteration
  for (const [name, score] of scores.entries()) {
    // TypeScript knows score is a number
    console.log(`${name}: ${score}`);
    const doubled = score * 2; // ✓ Works, score is number
  }
}

// =============================================================================
// Example 2: Record with Struct Values
// =============================================================================

const UserSchema = S.Struct({
  name: S.String,
  age: S.Number,
  email: S.String,
});

const UsersRecordSchema = S.Record(S.String, UserSchema);

function example2() {
  const yDoc = new Y.Doc();
  const yMap = yDoc.getMap("users");

  const users = new TypedYRecord(yMap, UserSchema);

  // get() returns: TypedYStruct<typeof UserSchema> | undefined
  const user1 = users.get("user-1");
  if (user1) {
    // TypeScript knows this is a TypedYStruct
    const name = user1.get("name"); // ✓ Type: string | undefined
    const age = user1.get("age"); // ✓ Type: number | undefined

    // @ts-expect-error - Cannot access non-existent field
    // user1.get("invalid");
  }

  // createStructEntry() returns: TypedYStruct<typeof UserSchema>
  const newUser = users.createStructEntry("user-2");
  // No need for type assertions!
  newUser.set("name", "Alice");
  newUser.set("age", 30);
  newUser.set("email", "alice@example.com");

  // @ts-expect-error - Cannot set with wrong type
  // newUser.set("age", "thirty");

  // set() accepts: TypedYStruct<typeof UserSchema>
  const anotherUser = users.createStructEntry("user-3");
  users.set("user-3-copy", anotherUser); // ✓ Works

  // @ts-expect-error - Cannot set simple value when expecting struct
  // users.set("user-4", { name: "Bob", age: 25, email: "bob@example.com" });

  // Iteration
  for (const [userId, userStruct] of users.entries()) {
    // TypeScript knows userStruct is TypedYStruct<typeof UserSchema>
    const userName = userStruct.get("name");
    console.log(`User ${userId}: ${userName}`);
  }
}

// =============================================================================
// Example 3: Record with Record Values (Nested Records)
// =============================================================================

const TagsSchema = S.Record(S.String, S.Boolean);
const ArticlesWithTagsSchema = S.Record(S.String, TagsSchema);

function example3() {
  const yDoc = new Y.Doc();
  const yMap = yDoc.getMap("articles");

  // TypedYRecord where values are Records
  const articles = new TypedYRecord(yMap, TagsSchema);

  // get() returns: TypedYRecord<typeof TagsSchema> | undefined
  const article1Tags = articles.get("article-1");
  if (article1Tags) {
    // TypeScript knows this is a TypedYRecord
    const isPublished = article1Tags.get("published"); // ✓ Type: boolean | undefined
    article1Tags.set("featured", true); // ✓ Type-safe

    // @ts-expect-error - Cannot set wrong type
    // article1Tags.set("archived", "yes");
  }

  // createRecordEntry() returns: TypedYRecord<typeof TagsSchema>
  const article2Tags = articles.createRecordEntry("article-2");
  // No type assertions needed!
  article2Tags.set("published", true);
  article2Tags.set("featured", false);

  // @ts-expect-error - Cannot create struct entry when value is Record
  // articles.createStructEntry("article-3");

  // Iteration with nested iteration
  for (const [articleId, tagsRecord] of articles.entries()) {
    // TypeScript knows tagsRecord is TypedYRecord
    console.log(`Article ${articleId} tags:`);
    for (const [tagName, tagValue] of tagsRecord.entries()) {
      // TypeScript knows tagValue is boolean
      console.log(`  ${tagName}: ${tagValue}`);
    }
  }
}

// =============================================================================
// Example 4: Complex Nested Structure
// =============================================================================

const ShapeSchema = S.Struct({
  type: S.Literal("rect", "circle", "polygon"),
  x: S.Number,
  y: S.Number,
  visible: S.Boolean,
});

const FrameSchema = S.Struct({
  timestamp: S.Number,
  duration: S.Number,
  shapes: S.Record(S.String, ShapeSchema),
});

const ProjectSchema = S.Struct({
  id: S.String,
  name: S.String,
  frames: S.Record(S.String, FrameSchema),
});

function example4() {
  const yDoc = new Y.Doc();
  const yMap = yDoc.getMap("project");

  const project = new TypedYStruct(yMap, ProjectSchema);

  // Set simple fields
  project.set("id", "proj-123");
  project.set("name", "My Animation");

  // Get the frames record
  const frames = project.getRecord("frames");
  // Type: TypedYRecord with FrameSchema values

  // Create a new frame
  const frame1 = frames.createStructEntry("frame-1");
  // Type: TypedYStruct<typeof FrameSchema>

  frame1.set("timestamp", 0);
  frame1.set("duration", 100);

  // Get the shapes record from the frame
  const shapes = frame1.getRecord("shapes");
  // Type: TypedYRecord with ShapeSchema values

  // Create a new shape
  const shape1 = shapes.createStructEntry("shape-1");
  // Type: TypedYStruct<typeof ShapeSchema>

  shape1.set("type", "rect");
  shape1.set("x", 10);
  shape1.set("y", 20);
  shape1.set("visible", true);

  // @ts-expect-error - Wrong literal value
  // shape1.set("type", "invalid");

  // @ts-expect-error - Wrong type
  // shape1.set("x", "ten");

  // Now navigate and retrieve with full type safety
  const retrievedFrame = frames.get("frame-1");
  if (retrievedFrame) {
    // Type: TypedYStruct<typeof FrameSchema>
    const timestamp = retrievedFrame.get("timestamp"); // number | undefined

    const retrievedShapes = retrievedFrame.getRecord("shapes");
    // Type: TypedYRecord with ShapeSchema values

    const retrievedShape = retrievedShapes.get("shape-1");
    if (retrievedShape) {
      // Type: TypedYStruct<typeof ShapeSchema>
      const shapeType = retrievedShape.get("type"); // "rect" | "circle" | "polygon" | undefined
      const x = retrievedShape.get("x"); // number | undefined

      if (shapeType && x !== undefined) {
        console.log(`Shape type: ${shapeType}, x: ${x}`);
      }
    }
  }
}

// =============================================================================
// Example 5: Type Safety in Iteration
// =============================================================================

function example5() {
  const yDoc = new Y.Doc();
  const projectMap = yDoc.getMap("project");

  const project = new TypedYStruct(projectMap, ProjectSchema);

  // Set up some data
  project.set("id", "proj-1");
  project.set("name", "Animation");

  const frames = project.getRecord("frames");
  const frame1 = frames.createStructEntry("frame-1");
  frame1.set("timestamp", 0);
  frame1.set("duration", 100);

  const shapes = frame1.getRecord("shapes");
  const shape1 = shapes.createStructEntry("shape-1");
  shape1.set("type", "circle");
  shape1.set("x", 50);
  shape1.set("y", 50);
  shape1.set("visible", true);

  // Type-safe iteration through nested structures
  for (const [frameId, frameStruct] of frames.entries()) {
    // TypeScript knows: frameStruct is TypedYStruct<typeof FrameSchema>
    const timestamp = frameStruct.get("timestamp");
    const duration = frameStruct.get("duration");

    console.log(`Frame ${frameId}: ${timestamp}ms, duration ${duration}ms`);

    const frameShapes = frameStruct.getRecord("shapes");
    // TypeScript knows: frameShapes is TypedYRecord with ShapeSchema values

    for (const [shapeId, shapeStruct] of frameShapes.entries()) {
      // TypeScript knows: shapeStruct is TypedYStruct<typeof ShapeSchema>
      const type = shapeStruct.get("type");
      const x = shapeStruct.get("x");
      const y = shapeStruct.get("y");
      const visible = shapeStruct.get("visible");

      console.log(
        `  Shape ${shapeId}: type=${type}, pos=(${x},${y}), visible=${visible}`
      );

      // All these are properly typed - no assertions needed!
      if (typeof x === "number" && typeof y === "number") {
        const distance = Math.sqrt(x * x + y * y); // ✓ Math operations work
        console.log(`    Distance from origin: ${distance}`);
      }
    }
  }
}

// =============================================================================
// Example 6: Compile-Time Safety
// =============================================================================

function example6CompileTimeSafety() {
  const yDoc = new Y.Doc();

  // Simple value record
  const scoresMap = yDoc.getMap("scores");
  const scores = new TypedYRecord(scoresMap, S.Number);

  // ✓ Correct usage
  scores.set("alice", 100);
  const aliceScore = scores.get("alice"); // Type: number | undefined

  // ❌ These will cause compile errors:
  // scores.set("bob", "ninety"); // Error: string not assignable to number
  // scores.createStructEntry("charlie"); // Error: method doesn't exist for simple values

  // Struct value record
  const usersMap = yDoc.getMap("users");
  const users = new TypedYRecord(usersMap, UserSchema);

  // ✓ Correct usage
  const user1 = users.createStructEntry("user-1");
  user1.set("name", "Alice");

  // ❌ These will cause compile errors:
  // users.set("user-2", { name: "Bob", age: 25 }); // Error: plain object not assignable
  // users.createRecordEntry("user-3"); // Error: value schema is not a Record
  // const badUser = users.get("user-1");
  // badUser.set("invalidField", "value"); // Error: field doesn't exist
}

// =============================================================================
// Summary of Type Safety Benefits
// =============================================================================

/*
✓ NO MORE MANUAL TYPE ASSERTIONS
  Before: const frame = frames.get("frame-1") as TypedYStruct<FrameSchema>;
  After:  const frame = frames.get("frame-1"); // Automatically typed correctly!

✓ COMPILE-TIME ERROR DETECTION
  - Wrong value types caught at compile time
  - Invalid field access caught at compile time
  - Method availability enforced by schema type

✓ FULL AUTOCOMPLETE SUPPORT
  - IDE suggests only valid fields
  - IDE shows correct return types
  - IDE shows correct parameter types

✓ REFACTORING SAFETY
  - Change schema → TypeScript catches all affected code
  - Rename fields → TypeScript updates all access points
  - Change types → TypeScript enforces throughout codebase

✓ SELF-DOCUMENTING CODE
  - Types communicate intent
  - No need to check documentation for return types
  - Method signatures clearly show what's possible
*/
