// =============================================================================
// COMPARISON: Old vs New Architecture
// =============================================================================

/*
┌─────────────────────────────────────────────────────────────────────────────┐
│ OLD ARCHITECTURE (Single Class)                                             │
└─────────────────────────────────────────────────────────────────────────────┘

TypedYMap<TSchema>
├── Constructor decides: isTopLevelRecord flag
├── Type system branches on IsRecord<TSchema>
├── Methods branch on this.isTopLevelRecord
│
├── For Struct schemas:
│   ├── get<SimpleKeys>()
│   ├── set<SimpleKeys>()
│   ├── getNestedMap<NestedStructKeys>()
│   ├── getFromRecord<RecordKeys>()
│   ├── getRecordKeys<RecordKeys>()
│   ├── iterateRecord<RecordKeys>()
│   └── ... many record-related methods
│
├── For Record schemas:
│   ├── getSimpleValue(key: string)
│   ├── setSimpleValue(key: string, value)
│   ├── getNestedRecord(key: string)
│   ├── getAllKeys()
│   └── iterateTopLevelRecord()
│
└── Result: Two parallel APIs in one class

PROBLEMS:
1. Type complexity: Every type helper must handle both Struct and Record cases
2. Runtime branching: Many methods check isTopLevelRecord and throw errors
3. API confusion: Methods like getFromRecord() vs getNestedRecord() - which to use?
4. Maintenance burden: Changes to Struct logic can accidentally break Record logic
5. Type errors: Hard to get TypeScript to understand which methods work when
6. Testing complexity: Must test both pathways for every feature

┌─────────────────────────────────────────────────────────────────────────────┐
│ NEW ARCHITECTURE (Separated Classes)                                        │
└─────────────────────────────────────────────────────────────────────────────┘

TypedYStruct<TSchema extends S.Struct<any>>
├── Always works with Struct schemas
├── Type helpers only for Struct schemas
│
├── Simple field operations:
│   ├── get<SimpleKeys>()
│   ├── set<SimpleKeys>()
│   ├── has<SimpleKeys>()
│   └── delete<SimpleKeys>()
│
├── Nested struct operations:
│   └── getNestedStruct<NestedStructKeys>()
│       → Returns TypedYStruct<FieldSchema>
│
├── Record field operations:
│   └── getRecord<RecordFieldKeys>()
│       → Returns TypedYRecord<FieldSchema>
│
└── Utility:
    ├── toObject()
    ├── getRawYMap()
    └── observe/unobserve()

TypedYRecord<TSchema extends S.Record$<any, any>>
├── Always works with Record schemas
├── Type helpers only for Record schemas
│
├── Basic operations:
│   ├── get(key: string)
│   ├── set(key: string, value)
│   ├── has(key: string)
│   ├── delete(key: string)
│   ├── keys()
│   └── size()
│
├── Creation operations (when value is complex):
│   ├── createStructEntry(key: string)
│   │   → Returns TypedYStruct<ValueSchema>
│   └── createRecordEntry(key: string)
│       → Returns TypedYRecord<ValueSchema>
│
├── Iteration:
│   └── entries()
│       → Generator<[string, Value | TypedYStruct | TypedYRecord]>
│
└── Utility:
    ├── toObject()
    ├── getRawYMap()
    └── observe/unobserve()

BENEFITS:
1. Type simplicity: Each class has focused type helpers
2. No runtime branching: Methods always know their schema type
3. Clear API: Method names and signatures match their purpose
4. Independent evolution: Changes to one class don't affect the other
5. Better type inference: TypeScript understands the structure
6. Simpler testing: Test each class independently

┌─────────────────────────────────────────────────────────────────────────────┐
│ RECURSIVE COMPOSITION                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

Both architectures support recursion, but the new one is cleaner:

OLD WAY:
├── TypedYMap checks schema type in constructor
├── Creates nested TypedYMap instances
├── Each nested instance has its own isTopLevelRecord flag
└── Complex branching logic throughout

NEW WAY:
├── TypedYStruct creates:
│   ├── TypedYStruct for nested Struct fields
│   └── TypedYRecord for Record fields
│
└── TypedYRecord creates:
    ├── TypedYStruct for Struct values
    └── TypedYRecord for Record values

Example schema hierarchy:

S.Struct({
  name: S.String,                    ← TypedYStruct.get()
  
  address: S.Struct({                ← TypedYStruct.getNestedStruct()
    street: S.String,                  → returns TypedYStruct
    city: S.String
  }),
  
  frames: S.Record(                  ← TypedYStruct.getRecord()
    S.String,                          → returns TypedYRecord
    S.Struct({                         
      timestamp: S.Number,               → values accessed as TypedYStruct
      shapes: S.Record(                  ← nested record!
        S.String,                        
        S.Struct({                         → values accessed as TypedYStruct
          x: S.Number,
          y: S.Number
        })
      )
    })
  )
})

Navigation in NEW architecture:
const project = new TypedYStruct(yMap, schema);
const framesRecord = project.getRecord("frames");          // TypedYRecord
const frame1Struct = framesRecord.get("frame-1");          // TypedYStruct
const shapesRecord = frame1Struct.getRecord("shapes");     // TypedYRecord
const shape1Struct = shapesRecord.get("shape-1");          // TypedYStruct
const x = shape1Struct.get("x");                           // number

┌─────────────────────────────────────────────────────────────────────────────┐
│ API COMPARISON BY USE CASE                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

USE CASE 1: Access simple field in Struct
────────────────────────────────────────
OLD: typedYMap.get("name")
NEW: typedYStruct.get("name")
     ✓ Same, but clearer that it's a struct

USE CASE 2: Access nested Struct
────────────────────────────────
OLD: typedYMap.getNestedMap("address")
NEW: typedYStruct.getNestedStruct("address")
     ✓ Better name: "Struct" is more accurate than "Map"

USE CASE 3: Access Record field in Struct
─────────────────────────────────────────
OLD: typedYMap.getFromRecord("frames", "frame-1")
NEW: const framesRecord = typedYStruct.getRecord("frames");
     const frame1 = framesRecord.get("frame-1");
     ✓ More explicit: get the record, then get from it
     ✓ Can reuse framesRecord for multiple operations

USE CASE 4: Iterate over Record field
─────────────────────────────────────
OLD: for (const [id, nested] of typedYMap.iterateRecord("frames")) { }
NEW: const framesRecord = typedYStruct.getRecord("frames");
     for (const [id, frame] of framesRecord.entries()) { }
     ✓ Standard iteration pattern
     ✓ Clearer that we're iterating the record itself

USE CASE 5: Top-level Record
───────────────────────────
OLD: const framesMap = new TypedYMap(yMap, RecordSchema);
     framesMap.getSimpleValue("frame-1");
     framesMap.getNestedRecord("frame-1");
     // Different methods based on value type!
     
NEW: const framesMap = new TypedYRecord(yMap, valueSchema);
     framesMap.get("frame-1");
     // Same method regardless of value type!
     // Returns appropriate type based on schema

USE CASE 6: Create entry in Record
──────────────────────────────────
OLD: // Must manually create Y.Map, then wrap
     const newYMap = new Y.Map();
     recordMap.set("frame-1", newYMap);
     const frame1 = new TypedYMap(newYMap, FrameSchema);
     
NEW: const frame1 = framesRecord.createStructEntry("frame-1");
     // All in one step, properly initialized

USE CASE 7: Doubly nested Record
────────────────────────────────
OLD: typedYMap.getFromNestedRecord("framesToShapes", "frame-1", "shape-1");
     typedYMap.setInNestedRecord("framesToShapes", "frame-1", "shape-1", value);
     // Special methods for this specific nesting pattern
     
NEW: const framesToShapes = layer.getRecord("framesToShapes");
     const frame1Shapes = framesToShapes.get("frame-1");
     const shape1 = frame1Shapes.get("shape-1");
     // Generic composition, works for any nesting depth

┌─────────────────────────────────────────────────────────────────────────────┐
│ MIGRATION STRATEGY                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

The new architecture is mostly a drop-in replacement with some method renames:

1. DIRECT REPLACEMENTS:
   TypedYMap → TypedYStruct (when schema is S.Struct)
   TypedYMap → TypedYRecord (when schema is S.Record)
   
2. METHOD RENAMES:
   getNestedMap() → getNestedStruct()
   getFromRecord() → getRecord().get()
   iterateRecord() → getRecord().entries()
   
3. REMOVED METHODS (now unnecessary):
   getFromNestedRecord() → Chain getRecord().get().get()
   setInNestedRecord() → Chain getRecord().get().set()
   iterateNestedRecord() → Chain getRecord().entries() in nested loop
   
   These special-case methods are no longer needed because the
   composition pattern handles arbitrary nesting naturally.

4. NEW METHODS:
   createStructEntry() → Create new Struct entry in Record
   createRecordEntry() → Create new Record entry in Record

5. FACTORY FUNCTION:
   createTypedYMap() → Auto-detects schema type and creates appropriate class

┌─────────────────────────────────────────────────────────────────────────────┐
│ FINAL RECOMMENDATION                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

The separated architecture is superior because:

1. ✓ Simpler implementation - each class has one job
2. ✓ Clearer API - method names match their purpose
3. ✓ Better types - no complex conditional types
4. ✓ Easier maintenance - changes are localized
5. ✓ Natural composition - recursive nesting "just works"
6. ✓ More testable - independent class testing
7. ✓ Extensible - add features without affecting other class

The initial effort to separate the classes pays off immediately in
code clarity and will continue to pay dividends in maintainability.
*/
