import * as Y from 'yjs';

// Test 1: Can we add the same Y.Map to multiple locations in same doc?
console.log('=== Test 1: Adding Y.Map to multiple locations (same doc) ===');
const doc1 = new Y.Doc();
const ymap = new Y.Map();

// Attach to first location
const entities = doc1.getMap('_entities');
entities.set('entity1', ymap);
entities.set('entity2', ymap.clone())
console.log("test", ymap.parent)


// // Set some data
// ymap.set('name', 'Test Entity');
// console.log('After attaching to _entities:', ymap.get('name')); // Should work

// // Try to add to second location (frames array in a project)
// const projects = doc1.getMap('projects');
// const projectYmap = new Y.Map();
// projects.set('project1', projectYmap);

// const framesArray = new Y.Array();
// projectYmap.set('frames', framesArray);

// // Can we push the same ymap to the frames array?
// try {
//   console.log(".//////")
//   console.log(typeof(ymap.parent))
//   framesArray.push([ymap]);
//   console.log(typeof(ymap.parent))

//   console.log('✓ Successfully added same Y.Map to frames array');
//   console.log('  Reading from frames array:', framesArray.get(0).get('name'));
// } catch (e) {
//   console.log('✗ Failed to add same Y.Map to frames array:', e.message);
// }
// // Test 2: What happens when we read from both locations?
// console.log('\n=== Test 2: Reading from both locations ===');
// console.log('From _entities:', entities.get('entity1').get('name'));
// console.log('From frames array:', framesArray.get(0).get('name'));

// // Test 3: What happens when we modify through one location?
// console.log('\n=== Test 3: Modification through different references ===');
// entities.get('entity1').set('name', 'Modified Name');
// console.log('After modifying via _entities:');
// console.log('  From _entities:', entities.get('entity1').get('name'));
// console.log('  From frames array:', framesArray.get(0).get('name'));
// console.log('  From original reference:', ymap.get('name'));

// // Test 4: Can we remove from one location and still access from another?
// console.log('\n=== Test 4: Removing from one location ===');
// entities.delete('entity1');
// console.log('After deleting from _entities:');
// console.log('  entities.has("entity1"):', entities.has('entity1'));
// console.log('  Can still read from frames array:', framesArray.get(0).get('name'));
// console.log('  Can still read from original reference:', ymap.get('name'));

// // Test 5: Creating detached then attaching
// console.log('\n=== Test 5: Creating detached Y.Map ===');
// const detachedMap = new Y.Map();
// try {
//   detachedMap.set('foo', 'bar');
//   console.log('✓ Can set on detached Y.Map (no error)');
//   const value = detachedMap.get('foo');
//   console.log('✓ Can get from detached Y.Map:', value);
// } catch (e) {
//   console.log('✗ Error with detached Y.Map:', e.message);
// }

// // Test 6: Moving Y.Map between different Y.Docs
// console.log('\n=== Test 6: Moving Y.Map between different documents ===');
// const doc2 = new Y.Doc();
// const doc3 = new Y.Doc();

// const ymapInDoc2 = new Y.Map();
// doc2.getMap('entities').set('entity1', ymapInDoc2);
// ymapInDoc2.set('name', 'Entity in Doc2');
// console.log('Created Y.Map in doc2:', ymapInDoc2.get('name'));

// // Try to add the same Y.Map to doc3
// try {
//   doc3.getMap('entities').set('entity1', ymapInDoc2);
//   console.log('✓ Successfully added Y.Map from doc2 to doc3');
//   console.log('  Reading from doc3:', doc3.getMap('entities').get('entity1').get('name'));
// } catch (e) {
//   console.log('✗ Cannot add Y.Map from doc2 to doc3:', e.message);
// }

// // Test 7: Alternative - can we create a Y.Map detached then add to doc later?
// console.log('\n=== Test 7: Detached Y.Map behavior with transactions ===');
// const doc4 = new Y.Doc({guid: "asdf"});
// const detachedMap2 = new Y.Map();

// // Try setting data before attaching
// doc4.transact(() => {
//   try {
//     console.log(detachedMap2.doc?.guid)
//     detachedMap2.set('before', 'value');
//     console.log(detachedMap2.doc?.guid)
//     console.log('✓ Can set in detached map within doc transaction');
//   } catch (e) {
//     console.log('✗ Cannot set in detached map:', e.message);
//   }
// });


// // Attach to doc
// doc4.getMap('test').set('item', detachedMap2);
// console.log(detachedMap2.doc?.guid)
// // console.log(detachedMap2.parent)
// console.log(detachedMap2.clone().doc?.guid)

// // Try reading
// try {
//   console.log('Reading after attach:', detachedMap2.get('before'));
// } catch (e) {
//   console.log('✗ Cannot read after attach:', e.message);
// }

// console.log('\n=== Summary ===');
// console.log('Y.Maps in Yjs are reference types that can be:');
// console.log('1. Added to multiple locations in the SAME document');
// console.log('2. Accessed and modified through any reference');
// console.log('3. Removed from one location while remaining accessible from others');
// console.log('4. Moved between different Y.Docs? (see test results above)');
