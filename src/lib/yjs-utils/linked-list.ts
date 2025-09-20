import { z, type ZodSchema, ZodError } from "zod";
import * as Y from "yjs";
import {
  TypedYMap,
  TypedYArrayOfMaps,
  TypedYMapValidationError,
} from "./typed-wrappers";

// Schema for linked list node metadata
const linkedListNodeSchema = z.object({
  id: z.string(),
  nextId: z.string().nullable(),
  prevId: z.string().nullable(),
  data: z.any(), // Will be validated by the data schema
});

export type LinkedListNodeMeta = z.infer<typeof linkedListNodeSchema>;

// Schema for the linked list metadata
const linkedListMetaSchema = z.object({
  headId: z.string().nullable(),
  tailId: z.string().nullable(),
  size: z.number().int().min(0),
});

export type LinkedListMeta = z.infer<typeof linkedListMetaSchema>;

// Linked list node wrapper
export class TypedYLinkedListNode<T> {
  constructor(
    public readonly nodeMap: TypedYMap<LinkedListNodeMeta & { data: T }>,
    private readonly dataSchema?: ZodSchema<T>
  ) {}

  get id(): string {
    return this.nodeMap.get("id") || "";
  }

  get nextId(): string | null {
    return this.nodeMap.get("nextId") || null;
  }

  set nextId(value: string | null) {
    this.nodeMap.set("nextId", value);
  }

  get prevId(): string | null {
    return this.nodeMap.get("prevId") || null;
  }

  set prevId(value: string | null) {
    this.nodeMap.set("prevId", value);
  }

  get data(): T | undefined {
    return this.nodeMap.get("data");
  }

  set data(value: T) {
    if (this.dataSchema) {
      try {
        const validated = this.dataSchema.parse(value);
        this.nodeMap.set("data", validated);
      } catch (error) {
        if (error instanceof ZodError) {
          throw new TypedYMapValidationError(
            `Node data validation failed: ${error.issues
              .map((e) => e.message)
              .join(", ")}`,
            error
          );
        }
        throw error;
      }
    } else {
      this.nodeMap.set("data", value);
    }
  }

  // Safe data setter
  setDataSafe(value: T): { success: boolean; errors?: ZodError } {
    try {
      this.data = value;
      return { success: true };
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return { success: false, errors: error.zodError };
      }
      throw error;
    }
  }

  toObject(): LinkedListNodeMeta & { data: T } {
    return this.nodeMap.toObject() as LinkedListNodeMeta & { data: T };
  }

  observe(callback: (event: Y.YMapEvent<any>) => void): void {
    this.nodeMap.observe(callback);
  }

  unobserve(callback: (event: Y.YMapEvent<any>) => void): void {
    this.nodeMap.unobserve(callback);
  }
}

// Main linked list implementation
export class TypedYLinkedList<T> {
  private nodes: TypedYArrayOfMaps<LinkedListNodeMeta & { data: T }>;
  private metaMap: TypedYMap<LinkedListMeta>;
  private nodeIndex: Map<string, number> = new Map(); // Cache for O(1) node lookup

  constructor(
    ydoc: Y.Doc,
    name: string,
    private readonly dataSchema?: ZodSchema<T>
  ) {
    // Create the node storage array
    this.nodes = new TypedYArrayOfMaps<LinkedListNodeMeta & { data: T }>(
      ydoc.getArray(`${name}_nodes`),
      this.createNodeSchema()
    );

    // Create metadata map
    this.metaMap = new TypedYMap<LinkedListMeta>(
      ydoc.getMap(`${name}_meta`),
      linkedListMetaSchema
    );

    // Initialize metadata if empty
    if (!this.metaMap.has("size")) {
      this.metaMap.update({
        headId: null,
        tailId: null,
        size: 0,
      });
    }

    // Build node index cache
    this.rebuildIndex();

    // Listen for changes to rebuild index
    this.nodes.observe(() => {
      this.rebuildIndex();
    });
  }

  private createNodeSchema(): ZodSchema<LinkedListNodeMeta & { data: T }> {
    const baseSchema = linkedListNodeSchema;

    if (this.dataSchema) {
      return baseSchema.extend({
        data: this.dataSchema,
      });
    }

    return baseSchema.extend({
      data: z.any(),
    });
  }

  private rebuildIndex(): void {
    this.nodeIndex.clear();
    this.nodes.toArray().forEach((node, index) => {
      const id = node.get("id");
      if (id) {
        this.nodeIndex.set(id, index);
      }
    });
  }

  private generateId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private findNodeById(id: string): TypedYLinkedListNode<T> | null {
    const index = this.nodeIndex.get(id);
    if (index === undefined) return null;

    const nodeMap = this.nodes.get(index);
    if (!nodeMap) return null;

    return new TypedYLinkedListNode<T>(nodeMap, this.dataSchema);
  }

  private removeNodeFromArray(id: string): boolean {
    const index = this.nodeIndex.get(id);
    if (index === undefined) return false;

    this.nodes.delete(index);
    return true;
  }

  // Public API

  get size(): number {
    return this.metaMap.get("size") || 0;
  }

  get head(): TypedYLinkedListNode<T> | null {
    const headId = this.metaMap.get("headId");
    return headId ? this.findNodeById(headId) : null;
  }

  get tail(): TypedYLinkedListNode<T> | null {
    const tailId = this.metaMap.get("tailId");
    return tailId ? this.findNodeById(tailId) : null;
  }

  get isEmpty(): boolean {
    return this.size === 0;
  }

  // Add element to the end of the list
  append(data: T): TypedYLinkedListNode<T> {
    const id = this.generateId();
    const currentTail = this.tail;

    // Create new node
    const nodeMap = this.nodes.createItem({
      id,
      nextId: null,
      prevId: currentTail?.id || null,
      data,
    });

    // Add to array
    this.nodes.push([nodeMap]);
    const newNode = new TypedYLinkedListNode<T>(nodeMap, this.dataSchema);

    // Update links
    if (currentTail) {
      currentTail.nextId = id;
    } else {
      // First node - set as head
      this.metaMap.set("headId", id);
    }

    // Update tail and size
    this.metaMap.update({
      tailId: id,
      size: this.size + 1,
    });

    return newNode;
  }

  // Add element to the beginning of the list
  prepend(data: T): TypedYLinkedListNode<T> {
    const id = this.generateId();
    const currentHead = this.head;

    // Create new node
    const nodeMap = this.nodes.createItem({
      id,
      nextId: currentHead?.id || null,
      prevId: null,
      data,
    });

    // Add to array
    this.nodes.push([nodeMap]);
    const newNode = new TypedYLinkedListNode<T>(nodeMap, this.dataSchema);

    // Update links
    if (currentHead) {
      currentHead.prevId = id;
    } else {
      // First node - set as tail
      this.metaMap.set("tailId", id);
    }

    // Update head and size
    this.metaMap.update({
      headId: id,
      size: this.size + 1,
    });

    return newNode;
  }

  // Insert after a specific node
  insertAfter(
    targetNode: TypedYLinkedListNode<T>,
    data: T
  ): TypedYLinkedListNode<T> {
    const id = this.generateId();
    const nextNode = targetNode.nextId
      ? this.findNodeById(targetNode.nextId)
      : null;

    // Create new node
    const nodeMap = this.nodes.createItem({
      id,
      nextId: targetNode.nextId,
      prevId: targetNode.id,
      data,
    });

    // Add to array
    this.nodes.push([nodeMap]);
    const newNode = new TypedYLinkedListNode<T>(nodeMap, this.dataSchema);

    // Update links
    targetNode.nextId = id;
    if (nextNode) {
      nextNode.prevId = id;
    } else {
      // New tail
      this.metaMap.set("tailId", id);
    }

    // Update size
    this.metaMap.set("size", this.size + 1);

    return newNode;
  }

  // Insert before a specific node
  insertBefore(
    targetNode: TypedYLinkedListNode<T>,
    data: T
  ): TypedYLinkedListNode<T> {
    const id = this.generateId();
    const prevNode = targetNode.prevId
      ? this.findNodeById(targetNode.prevId)
      : null;

    // Create new node
    const nodeMap = this.nodes.createItem({
      id,
      nextId: targetNode.id,
      prevId: targetNode.prevId,
      data,
    });

    // Add to array
    this.nodes.push([nodeMap]);
    const newNode = new TypedYLinkedListNode<T>(nodeMap, this.dataSchema);

    // Update links
    targetNode.prevId = id;
    if (prevNode) {
      prevNode.nextId = id;
    } else {
      // New head
      this.metaMap.set("headId", id);
    }

    // Update size
    this.metaMap.set("size", this.size + 1);

    return newNode;
  }

  // Remove a specific node
  remove(node: TypedYLinkedListNode<T>): boolean {
    const prevNode = node.prevId ? this.findNodeById(node.prevId) : null;
    const nextNode = node.nextId ? this.findNodeById(node.nextId) : null;

    // Update links
    if (prevNode) {
      prevNode.nextId = node.nextId;
    } else {
      // Removing head
      this.metaMap.set("headId", node.nextId);
    }

    if (nextNode) {
      nextNode.prevId = node.prevId;
    } else {
      // Removing tail
      this.metaMap.set("tailId", node.prevId);
    }

    // Remove from array
    const removed = this.removeNodeFromArray(node.id);
    if (removed) {
      this.metaMap.set("size", this.size - 1);
    }

    return removed;
  }

  // Remove first node
  removeFirst(): TypedYLinkedListNode<T> | null {
    const head = this.head;
    if (!head) return null;

    this.remove(head);
    return head;
  }

  // Remove last node
  removeLast(): TypedYLinkedListNode<T> | null {
    const tail = this.tail;
    if (!tail) return null;

    this.remove(tail);
    return tail;
  }

  // Find node by data predicate
  find(predicate: (data: T) => boolean): TypedYLinkedListNode<T> | null {
    let current = this.head;
    while (current) {
      if (current.data !== undefined && predicate(current.data)) {
        return current;
      }
      current = current.nextId ? this.findNodeById(current.nextId) : null;
    }
    return null;
  }

  // Find node by ID
  findById(id: string): TypedYLinkedListNode<T> | null {
    return this.findNodeById(id);
  }

  // Convert to array (forward direction)
  toArray(): T[] {
    const result: T[] = [];
    let current = this.head;

    while (current) {
      if (current.data !== undefined) {
        result.push(current.data);
      }
      current = current.nextId ? this.findNodeById(current.nextId) : null;
    }

    return result;
  }

  // Convert to array (reverse direction)
  toArrayReverse(): T[] {
    const result: T[] = [];
    let current = this.tail;

    while (current) {
      if (current.data !== undefined) {
        result.push(current.data);
      }
      current = current.prevId ? this.findNodeById(current.prevId) : null;
    }

    return result;
  }

  // Iterator support
  *[Symbol.iterator](): Generator<TypedYLinkedListNode<T>, void, unknown> {
    let current = this.head;
    while (current) {
      yield current;
      current = current.nextId ? this.findNodeById(current.nextId) : null;
    }
  }

  // Reverse iterator
  *reverse(): Generator<TypedYLinkedListNode<T>, void, unknown> {
    let current = this.tail;
    while (current) {
      yield current;
      current = current.prevId ? this.findNodeById(current.prevId) : null;
    }
  }

  // ForEach with node access
  forEach(
    callback: (node: TypedYLinkedListNode<T>, index: number) => void
  ): void {
    let index = 0;
    for (const node of this) {
      callback(node, index++);
    }
  }

  // Map function
  map<U>(callback: (data: T, index: number) => U): U[] {
    const result: U[] = [];
    let index = 0;

    for (const node of this) {
      if (node.data !== undefined) {
        result.push(callback(node.data, index++));
      }
    }

    return result;
  }

  // Filter function
  filter(
    predicate: (data: T, index: number) => boolean
  ): TypedYLinkedListNode<T>[] {
    const result: TypedYLinkedListNode<T>[] = [];
    let index = 0;

    for (const node of this) {
      if (node.data !== undefined && predicate(node.data, index++)) {
        result.push(node);
      }
    }

    return result;
  }

  // Clear all nodes
  clear(): void {
    // Remove all nodes from array
    this.nodes.delete(0, this.nodes.length());

    // Reset metadata
    this.metaMap.update({
      headId: null,
      tailId: null,
      size: 0,
    });

    // Clear index
    this.nodeIndex.clear();
  }

  // Validation methods
  validateStructure(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const visitedIds = new Set<string>();
    let nodeCount = 0;

    // Check forward traversal
    let current = this.head;
    let prevId: string | null = null;

    while (current) {
      nodeCount++;

      if (visitedIds.has(current.id)) {
        errors.push(`Circular reference detected at node ${current.id}`);
        break;
      }
      visitedIds.add(current.id);

      // Check prev link consistency
      if (current.prevId !== prevId) {
        errors.push(`Inconsistent prev link at node ${current.id}`);
      }

      prevId = current.id;
      current = current.nextId ? this.findNodeById(current.nextId) : null;
    }

    // Check size consistency
    if (nodeCount !== this.size) {
      errors.push(`Size mismatch: expected ${this.size}, found ${nodeCount}`);
    }

    // Check tail consistency
    const tail = this.tail;
    if (tail && tail.id !== prevId) {
      errors.push(`Tail mismatch: expected ${prevId}, found ${tail.id}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Safe operations
  appendSafe(data: T): {
    success: boolean;
    node?: TypedYLinkedListNode<T>;
    errors?: ZodError;
  } {
    try {
      const node = this.append(data);
      return { success: true, node };
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return { success: false, errors: error.zodError };
      }
      throw error;
    }
  }

  prependSafe(data: T): {
    success: boolean;
    node?: TypedYLinkedListNode<T>;
    errors?: ZodError;
  } {
    try {
      const node = this.prepend(data);
      return { success: true, node };
    } catch (error) {
      if (error instanceof TypedYMapValidationError) {
        return { success: false, errors: error.zodError };
      }
      throw error;
    }
  }

  // Observe changes
  observe(callback: (event: Y.YArrayEvent<Y.Map<any>>) => void): void {
    this.nodes.observe(callback);
  }

  unobserve(callback: (event: Y.YArrayEvent<Y.Map<any>>) => void): void {
    this.nodes.unobserve(callback);
  }

  observeMeta(callback: (event: Y.YMapEvent<any>) => void): void {
    this.metaMap.observe(callback);
  }

  unobserveMeta(callback: (event: Y.YMapEvent<any>) => void): void {
    this.metaMap.unobserve(callback);
  }

  // Get schema
  getSchema(): ZodSchema<T> | undefined {
    return this.dataSchema;
  }

  // Debug helpers
  debug(): {
    size: number;
    headId: string | null;
    tailId: string | null;
    nodeCount: number;
    nodes: Array<{
      id: string;
      prevId: string | null;
      nextId: string | null;
      data: T;
    }>;
  } {
    return {
      size: this.size,
      headId: this.metaMap.get("headId") || null,
      tailId: this.metaMap.get("tailId") || null,
      nodeCount: this.nodes.length(),
      nodes: this.nodes.toArray().map((node) => ({
        id: node.get("id") || "",
        prevId: node.get("prevId") || null,
        nextId: node.get("nextId") || null,
        data: node.get("data")!,
      })),
    };
  }
}

// Factory function
export function createTypedYLinkedList<T>(
  ydoc: Y.Doc,
  name: string,
  schema?: ZodSchema<T>
): TypedYLinkedList<T> {
  return new TypedYLinkedList<T>(ydoc, name, schema);
}
