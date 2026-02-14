import * as S from "effect/Schema";
import * as Y from "yjs";
import {
  TypedYStruct,
  TypedYRecord,
  createTypedYMap,
} from "./impl-composition-separated";

// =============================================================================
// Example 1: Simple Struct with nested fields
// =============================================================================

const PersonSchema = S.Struct({
  name: S.String,
  age: S.Number,
  address: S.Struct({
    street: S.String,
    city: S.String,
    zipCode: S.String,
  }),
});

function example1() {
  const yDoc = new Y.Doc();
  const yMap = yDoc.getMap("person");

  // Create TypedYStruct
  const person = new TypedYStruct(yMap, PersonSchema);

  // Set simple fields
  person.set("name", "Alice");
  person.set("age", 30);

  // Access nested struct
  const address = person.getNestedStruct("address");
  address.set("street", "123 Main St");
  address.set("city", "Springfield");
  address.set("zipCode", "12345");

  // Get values
  console.log(person.get("name")); // "Alice"
  console.log(address.get("city")); // "Springfield"

  // Get full object
  console.log(person.toObject());
  // { name: "Alice", age: 30, address: { street: "123 Main St", ... } }
}

// =============================================================================
// Example 2: Struct with Record field
// =============================================================================

const ProjectSchema = S.Struct({
  id: S.String,
  name: S.String,
  // Record<frameId, frameData>
  frames: S.Record({
    key: S.String,
    value: S.Struct({
      timestamp: S.Number,
      duration: S.Number,
    }),
  }),
});

function example2() {
  const yDoc = new Y.Doc();
  const yMap = yDoc.getMap("project");

  const project = new TypedYStruct(yMap, ProjectSchema);

  // Set simple fields
  project.set("id", "proj-123");
  project.set("name", "My Animation");

  // Access the frames record
  const framesRecord = project.getRecord("frames");

  // Create a new frame entry
  const frame1 = framesRecord.createStructEntry("frame-1");
  frame1.set("timestamp", 0);
  frame1.set("duration", 100);

  // Create another frame
  const frame2 = framesRecord.createStructEntry("frame-2");
  frame2.set("timestamp", 100);
  frame2.set("duration", 150);

  // Iterate over frames
  for (const [frameId, frameStruct] of framesRecord.entries()) {
    if (frameStruct instanceof TypedYStruct) {
      console.log(`Frame ${frameId}:`, frameStruct.toObject());
    }
  }

  // Check if frame exists
  console.log(framesRecord.has("frame-1")); // true

  // Delete a frame
  framesRecord.delete("frame-2");
}

// =============================================================================
// Example 3: Record at top level with Struct values
// =============================================================================

const FrameDataSchema = S.Struct({
  timestamp: S.Number,
  duration: S.Number,
  layers: S.Array(S.String),
});

// This is a Record<string, FrameData> at the top level
const FramesMapSchema = S.Record({ key: S.String, value: FrameDataSchema });

function example3() {
  const yDoc = new Y.Doc();
  const yMap = yDoc.getMap("framesMap");

  const frames = createTypedYMap(yMap, FramesMapSchema);

  // Create TypedYRecord at the top level
  const framesMap: TypedYRecord<typeof FramesMapSchema> = new TypedYRecord(yMap, FrameDataSchema);

  // Create new frame entries
  const frame1 = framesMap.createStructEntry("frame-1");
  frame1.set("timestamp", 0);
  frame1.set("duration", 100);
  frame1.set("layers", ["layer-1", "layer-2"]);

  const frame2 = frames.createStructEntry("frame-2");
  frame2.set("timestamp", 100);
  frame2.set("duration", 150);
  frame2.set("layers", ["layer-1"]);

  // Get a specific frame
  const retrievedFrame = framesMap.get("frame-1");
  if (retrievedFrame instanceof TypedYStruct) {
    console.log(retrievedFrame.get("timestamp")); // 0
  }

  // Iterate
  for (const [frameId, frameStruct] of framesMap.entries()) {
    console.log(`Frame ${frameId}:`, frameStruct);
  }
}

// =============================================================================
// Example 4: Doubly nested Records (Record<string, Record<string, Value>>)
// =============================================================================

const ShapeSchema = S.Struct({
  type: S.String,
  x: S.Number,
  y: S.Number,
  width: S.Number,
  height: S.Number,
});

// Record<frameId, Record<shapeId, Shape>>
const FramesToShapesSchema = S.Record({
  key: S.String,
  value: S.Record({ key: S.String, value: ShapeSchema }),
});

const LayerSchema = S.Struct({
  id: S.String,
  name: S.String,
  framesToShapes: FramesToShapesSchema,
});

function example4() {
  const yDoc = new Y.Doc();
  const yMap = yDoc.getMap("layer");

  const layer = new TypedYStruct(yMap, LayerSchema);

  layer.set("id", "layer-1");
  layer.set("name", "Main Layer");

  // Access the doubly-nested record structure
  const framesToShapes = layer.getRecord("framesToShapes");

  // Create a record for frame-1's shapes
  const frame1Shapes = framesToShapes.createRecordEntry("frame-1");

  // Add shapes to frame-1
  const shape1 = frame1Shapes.createStructEntry("shape-1");
  shape1.set("type", "rectangle");
  shape1.set("x", 10);
  shape1.set("y", 20);
  shape1.set("width", 100);
  shape1.set("height", 50);

  const shape2 = frame1Shapes.createStructEntry("shape-2");
  shape2.set("type", "circle");
  shape2.set("x", 200);
  shape2.set("y", 100);
  shape2.set("width", 50);
  shape2.set("height", 50);

  // Create shapes for frame-2
  const frame2Shapes = framesToShapes.createRecordEntry("frame-2");
  const shape3 = frame2Shapes.createStructEntry("shape-3");
  shape3.set("type", "ellipse");
  shape3.set("x", 50);
  shape3.set("y", 50);
  shape3.set("width", 80);
  shape3.set("height", 40);

  // Iterate over all frames and their shapes
  for (const [frameId, shapesRecord] of framesToShapes.entries()) {
    if (shapesRecord instanceof TypedYRecord) {
      console.log(`Frame ${frameId}:`);
      for (const [shapeId, shapeStruct] of shapesRecord.entries()) {
        if (shapeStruct instanceof TypedYStruct) {
          console.log(`  Shape ${shapeId}:`, shapeStruct.toObject());
        }
      }
    }
  }

  // Access a specific shape
  const frame1ShapesRetrieved = framesToShapes.get("frame-1");
  if (frame1ShapesRetrieved instanceof TypedYRecord) {
    const specificShape = frame1ShapesRetrieved.get("shape-1");
    if (specificShape instanceof TypedYStruct) {
      console.log("Shape type:", specificShape.get("type")); // "rectangle"
    }
  }

  // Delete operations
  frame1Shapes.delete("shape-2"); // Remove shape-2 from frame-1
  framesToShapes.delete("frame-2"); // Remove entire frame-2
}

// =============================================================================
// Example 5: Using the factory function
// =============================================================================

function example5() {
  const yDoc = new Y.Doc();

  // Automatically creates TypedYStruct
  const personMap = yDoc.getMap("person");
  const person = createTypedYMap(personMap, PersonSchema);
  // person is TypedYStruct<typeof PersonSchema>

  // Automatically creates TypedYRecord
  const framesMap = yDoc.getMap("frames");
  const frames = createTypedYMap(framesMap, FramesMapSchema);
  // frames is TypedYRecord<typeof FramesMapSchema>
}

// =============================================================================
// Key Benefits of This Approach
// =============================================================================

/*
1. CLEAR SEPARATION OF CONCERNS
   - TypedYStruct handles S.Struct schemas with named fields
   - TypedYRecord handles S.Record schemas with dynamic keys
   - Each class has a focused, coherent API

2. RECURSIVE COMPOSITION
   - TypedYStruct can contain TypedYRecord fields
   - TypedYRecord can contain TypedYStruct values
   - TypedYRecord can contain TypedYRecord values (nested records)
   - Full recursion is supported naturally

3. TYPE SAFETY
   - Each class has its own type helpers tailored to its schema type
   - No conditional types trying to handle both cases
   - Clearer type inference for users

4. SIMPLER IMPLEMENTATION
   - No need for isTopLevelRecord flags
   - No dual pathways in methods
   - Each method knows exactly what schema type it's working with

5. BETTER API
   - TypedYStruct: get(), set(), getNestedStruct(), getRecord()
   - TypedYRecord: get(), set(), createStructEntry(), createRecordEntry()
   - Method names clearly indicate what they do
   - No confusion about which methods work in which contexts

6. EASIER TO EXTEND
   - Want to add features to Struct handling? Modify TypedYStruct
   - Want to add features to Record handling? Modify TypedYRecord
   - Changes are localized and don't affect the other class
*/
