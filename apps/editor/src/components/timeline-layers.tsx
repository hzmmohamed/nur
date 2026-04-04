import { useState, useCallback, useMemo } from "react"
import { Atom, Result } from "@effect-atom/atom"
import { useAtom, useAtomValue, useAtomSet } from "@effect-atom/atom-react/Hooks"
import { BrowserKeyValueStore } from "@effect/platform-browser"
import * as S from "effect/Schema"
import { TreeView } from "@/components/tree-view"
import type { TreeNodeNested, TreeNodeRenderProps } from "@/lib/tree-types"
import type { Layer, LayerGroup } from "@nur/core"
import { appRegistry } from "../lib/atom-registry"
import {
  layersAtom,
  layerGroupsAtom,
  activeLayerIdAtom,
  setActiveLayerIdAtom,
  renameLayerAtom,
  duplicateLayerAtom,
  deleteLayerAtom,
  reorderLayersAtom,
  createLayerAtom,
  createLayerGroupAtom,
  deleteLayerGroupAtom,
} from "../lib/layer-atoms"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayerNodeData {
  name: string
  color: string | null // null for groups
  type: "layer" | "group"
  layerId: string // actual layer/group ID (without "group-" prefix)
}

interface TimelineLayersProps {
  headerHeight: number
  scrollRef?: React.RefObject<HTMLDivElement | null>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_H = 28 // must match timeline grid row height

/** Shared expanded group IDs — read by Timeline for SVG row positioning */
export const expandedGroupIdsAtom = Atom.make<string[]>([])

const visibilityRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage)

/** Layer/group visibility — persisted to localStorage.
 *  Record<id, visible>. Missing entries default to true (visible).
 *  When a group is hidden, all child layers are also hidden. */
export const layerVisibilityAtom = Atom.kvs({
  runtime: visibilityRuntime,
  key: "nur-layer-visibility",
  schema: S.Record({ key: S.String, value: S.Boolean }),
  defaultValue: () => ({} as Record<string, boolean>),
}).pipe(Atom.keepAlive)

function toggleVisibility(id: string) {
  const current = appRegistry.get(layerVisibilityAtom)
  const isVisible = current[id] ?? true
  appRegistry.set(layerVisibilityAtom, { ...current, [id]: !isVisible })
}

/** Check if a node is effectively visible (own visibility AND parent group visibility) */
export function isEffectivelyVisible(
  id: string,
  parentGroupId: string | null,
  visibility: Record<string, boolean>,
): boolean {
  const own = visibility[id] ?? true
  if (!own) return false
  if (parentGroupId) {
    const groupVisible = visibility[parentGroupId] ?? true
    if (!groupVisible) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Tree helpers (pure functions, no atoms/hooks)
// ---------------------------------------------------------------------------

/** Converts flat layers + groups into nested TreeNodeNested for the tree view. */
export function buildTree(
  layers: Array<Layer & { id: string }>,
  groups: Array<LayerGroup & { id: string }>,
): TreeNodeNested<LayerNodeData>[] {
  const groupMap = new Map<string, TreeNodeNested<LayerNodeData>>()

  // Create group nodes
  for (const group of groups) {
    groupMap.set(group.id, {
      id: `group-${group.id}`,
      isGroup: true,
      data: {
        name: group.name,
        color: null,
        type: "group",
        layerId: group.id,
      },
      children: [],
    })
  }

  const rootNodes: TreeNodeNested<LayerNodeData>[] = []

  // Place layers into their group or at root level
  for (const layer of layers) {
    const layerNode: TreeNodeNested<LayerNodeData> = {
      id: layer.id,
      data: {
        name: layer.name,
        color: layer.color,
        type: "layer",
        layerId: layer.id,
      },
    }

    if (layer.groupId && groupMap.has(layer.groupId)) {
      groupMap.get(layer.groupId)!.children!.push(layerNode)
    } else {
      rootNodes.push(layerNode)
    }
  }

  // Interleave groups into root based on their index relative to ungrouped layers
  // Groups are sorted by their own index; we insert them among root nodes.
  // Strategy: build a combined list ordered by the original index values.
  const combined: Array<{ sortKey: number; node: TreeNodeNested<LayerNodeData> }> = []

  for (const node of rootNodes) {
    const layer = layers.find((l) => l.id === node.id)
    combined.push({ sortKey: layer?.index ?? 0, node })
  }

  for (const group of groups) {
    const groupNode = groupMap.get(group.id)!
    combined.push({ sortKey: group.index, node: groupNode })
  }

  combined.sort((a, b) => a.sortKey - b.sortKey)
  return combined.map((c) => c.node)
}

/**
 * Extracts a flat ordered list of { id, groupId } from the tree structure
 * for Y.Doc reorder updates via reorderLayersAtom.
 */
function flattenTree(
  items: TreeNodeNested<LayerNodeData>[],
): Array<{ id: string; groupId: string | null }> {
  const result: Array<{ id: string; groupId: string | null }> = []

  function walk(nodes: TreeNodeNested<LayerNodeData>[], parentGroupId: string | null) {
    for (const node of nodes) {
      if (node.data.type === "layer") {
        result.push({ id: node.data.layerId, groupId: parentGroupId })
      }
      if (node.children) {
        const gid = node.data.type === "group" ? node.data.layerId : parentGroupId
        walk(node.children, gid)
      }
    }
  }

  walk(items, null)
  return result
}

// ---------------------------------------------------------------------------
// Inline SVG icons (no icon library dependency)
// ---------------------------------------------------------------------------

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function FolderPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  )
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// LayerNode renderer (used by TreeView renderNode)
// ---------------------------------------------------------------------------

interface LayerNodeRendererProps {
  renderProps: TreeNodeRenderProps<LayerNodeData>
  editingId: string | null
  editingName: string
  hoveredId: string | null
  isVisible: boolean
  isActiveForEditing: boolean
  onToggleVisibility: (id: string) => void
  onStartEdit: (id: string, name: string) => void
  onEditChange: (name: string) => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onHover: (id: string | null) => void
  onEdit: (layerId: string) => void
  onDuplicate: (layerId: string) => void
  onDelete: (id: string, type: "layer" | "group") => void
}

function LayerNodeRenderer({
  renderProps,
  editingId,
  editingName,
  hoveredId,
  isVisible,
  isActiveForEditing,
  onToggleVisibility,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onHover,
  onEdit,
  onDuplicate,
  onDelete,
}: LayerNodeRendererProps) {
  const { node, isExpanded, isSelected, toggle, select } = renderProps
  const { data, depth } = node
  const isEditing = editingId === node.id
  const isHovered = hoveredId === node.id

  return (
    <div
      className={`flex items-center gap-1 pr-1 cursor-pointer select-none transition-colors ${
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      }${!isVisible ? " opacity-40" : ""}`}
      style={{ height: ROW_H, paddingLeft: depth * 16 + 4 }}
      onClick={(e) => {
        e.stopPropagation()
        if (data.type === "layer") {
          select(e)
        }
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Expand/collapse toggle for groups */}
      {data.type === "group" ? (
        <button
          className="flex items-center justify-center size-4 flex-shrink-0 rounded hover:bg-accent/80 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          aria-label={isExpanded ? "Collapse group" : "Expand group"}
        >
          <ChevronRightIcon
            className={`size-3 text-muted-foreground transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        </button>
      ) : (
        <span className="size-4 flex-shrink-0" />
      )}

      {/* Visibility toggle */}
      <button
        className={`flex items-center justify-center size-4 flex-shrink-0 rounded transition-colors ${
          isVisible ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 hover:text-muted-foreground"
        }`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleVisibility(data.layerId)
        }}
        title={isVisible ? "Hide" : "Show"}
      >
        {isVisible ? <EyeIcon className="size-3" /> : <EyeOffIcon className="size-3" />}
      </button>

      {/* Color swatch or folder icon */}
      {data.type === "layer" && data.color ? (
        <div
          className="size-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: data.color }}
        />
      ) : (
        <FolderIcon className="size-3 flex-shrink-0 text-muted-foreground" />
      )}

      {/* Name (inline editable) */}
      {isEditing ? (
        <input
          className="flex-1 min-w-0 bg-transparent text-xs outline-none border-b border-accent-foreground/40 px-0.5"
          value={editingName}
          autoFocus
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onCommitEdit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              onCancelEdit()
            }
          }}
          onBlur={onCommitEdit}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="text-xs truncate flex-1 min-w-0"
          onDoubleClick={(e) => {
            e.stopPropagation()
            if (data.type === "layer") {
              onStartEdit(node.id, data.name)
            }
          }}
        >
          {data.name}
        </span>
      )}

      {/* Edit button — always visible for layers */}
      {data.type === "layer" && (
        <button
          className={`flex items-center justify-center size-4 flex-shrink-0 rounded transition-colors ${
            isActiveForEditing
              ? "text-foreground bg-accent"
              : "text-muted-foreground/40 hover:text-foreground"
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onEdit(data.layerId)
          }}
          title={isActiveForEditing ? "Currently editing" : "Edit layer"}
        >
          <PencilIcon className="size-2.5" />
        </button>
      )}

      {/* Hover action buttons */}
      {isHovered && !isEditing && (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {data.type === "layer" && (
            <button
              className="flex items-center justify-center size-5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate(data.layerId)
              }}
              aria-label={`Duplicate ${data.name}`}
              title="Duplicate"
            >
              <CopyIcon className="size-3" />
            </button>
          )}
          <button
            className="flex items-center justify-center size-5 rounded hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(data.layerId, data.type)
            }}
            aria-label={`Delete ${data.name}`}
            title="Delete"
          >
            <TrashIcon className="size-3" />
          </button>
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TimelineLayers component
// ---------------------------------------------------------------------------

export function TimelineLayers({ headerHeight, scrollRef }: TimelineLayersProps) {
  // -- Atom reads (reactive) --
  const layersResult = useAtomValue(layersAtom)
  const layers = Result.isSuccess(layersResult) ? layersResult.value : []
  const groupsResult = useAtomValue(layerGroupsAtom)
  const groups = Result.isSuccess(groupsResult) ? groupsResult.value : []
  const activeLayerIdResult = useAtomValue(activeLayerIdAtom)
  const activeLayerId = Result.isSuccess(activeLayerIdResult) ? activeLayerIdResult.value : null
  const [expandedIds, setExpandedIds] = useAtom(expandedGroupIdsAtom)
  const [visibilityMap] = useAtom(layerVisibilityAtom)

  // Auto-expand new groups
  const allGroupTreeIds = useMemo(() => groups.map((g) => `group-${g.id}`), [groups])
  const prevGroupCountRef = useMemo(() => ({ current: groups.length }), [])
  useMemo(() => {
    // On first render or when groups are added, expand all
    if (expandedIds.length === 0 && allGroupTreeIds.length > 0) {
      setExpandedIds(allGroupTreeIds)
    } else if (allGroupTreeIds.length > prevGroupCountRef.current) {
      // New group added — expand it
      const newIds = allGroupTreeIds.filter((id) => !expandedIds.includes(id))
      if (newIds.length > 0) setExpandedIds([...expandedIds, ...newIds])
    }
    prevGroupCountRef.current = groups.length
  }, [allGroupTreeIds])

  // -- Atom setters --
  const setActiveLayerId = useAtomSet(setActiveLayerIdAtom)
  const renameLayer = useAtomSet(renameLayerAtom)
  const duplicateLayer = useAtomSet(duplicateLayerAtom)
  const deleteLayer = useAtomSet(deleteLayerAtom)
  const reorderLayers = useAtomSet(reorderLayersAtom)
  const createLayer = useAtomSet(createLayerAtom)
  const createLayerGroup = useAtomSet(createLayerGroupAtom)
  const deleteLayerGroup = useAtomSet(deleteLayerGroupAtom)

  // -- Local UI state --
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // -- Derived tree data --
  const treeItems = useMemo(() => buildTree(layers, groups), [layers, groups])

  // -- Selection (maps activeLayerIdAtom to TreeView selectedIds) --
  const selectedIds = useMemo(
    () => (activeLayerId ? [activeLayerId] : []),
    [activeLayerId],
  )

  const handleSelectedIdsChange = useCallback(
    (ids: string[]) => {
      // Only select layer nodes, not group nodes
      const layerId = ids.find((id) => !id.startsWith("group-")) ?? null
      setActiveLayerId(layerId)
    },
    [setActiveLayerId],
  )

  // -- Inline rename --
  const handleStartEdit = useCallback((id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
  }, [])

  const handleCommitEdit = useCallback(() => {
    if (!editingId) return
    const trimmed = editingName.trim()
    if (trimmed) {
      // Determine if it's a layer or group node based on the id prefix
      if (editingId.startsWith("group-")) {
        // Group rename not implemented yet — could be added in future
      } else {
        renameLayer({ layerId: editingId, name: trimmed })
      }
    }
    setEditingId(null)
    setEditingName("")
  }, [editingId, editingName, renameLayer])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingName("")
  }, [])

  // -- Actions --
  const handleDuplicate = useCallback(
    (layerId: string) => {
      duplicateLayer(layerId)
    },
    [duplicateLayer],
  )

  const handleDelete = useCallback(
    (id: string, type: "layer" | "group") => {
      if (type === "group") {
        deleteLayerGroup(id)
      } else {
        deleteLayer(id)
      }
    },
    [deleteLayer, deleteLayerGroup],
  )

  // -- Drag-and-drop reorder --
  const handleItemsChange = useCallback(
    (newItems: TreeNodeNested<LayerNodeData>[]) => {
      const order = flattenTree(newItems)
      reorderLayers(order)
    },
    [reorderLayers],
  )

  // -- Render node callback --
  const renderNode = useCallback(
    (props: TreeNodeRenderProps<LayerNodeData>) => {
      const parentGroupId = props.node.parentId?.startsWith("group-")
        ? props.node.parentId.slice(6)
        : null
      const nodeVisibility = isEffectivelyVisible(
        props.node.data.layerId,
        parentGroupId,
        visibilityMap,
      )
      return (
        <LayerNodeRenderer
          renderProps={props}
          editingId={editingId}
          editingName={editingName}
          hoveredId={hoveredId}
          isVisible={nodeVisibility}
          isActiveForEditing={props.node.data.layerId === activeLayerId}
          onToggleVisibility={(id) => toggleVisibility(id)}
          onStartEdit={handleStartEdit}
          onEditChange={setEditingName}
          onCommitEdit={handleCommitEdit}
          onCancelEdit={handleCancelEdit}
          onHover={setHoveredId}
          onEdit={(id) => setActiveLayerId(id)}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      )
    },
    [
      editingId,
      editingName,
      hoveredId,
      visibilityMap,
      activeLayerId,
      setActiveLayerId,
      handleStartEdit,
      handleCommitEdit,
      handleCancelEdit,
      handleDuplicate,
      handleDelete,
    ],
  )

  return (
    <div className="flex flex-col h-full bg-neutral-900">
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 border-b border-border flex-shrink-0"
        style={{ height: headerHeight }}
      >
        <span className="text-xs font-semibold text-muted-foreground">Layers</span>
        <span className="flex items-center gap-0.5">
          <button
            className="flex items-center justify-center size-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => createLayer(`Layer ${layers.length + 1}`)}
            aria-label="Add layer"
            title="Add layer"
          >
            <PlusIcon className="size-3.5" />
          </button>
          <button
            className="flex items-center justify-center size-5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => createLayerGroup(`Group ${groups.length + 1}`)}
            aria-label="Add group"
            title="Add group"
          >
            <FolderPlusIcon className="size-3.5" />
          </button>
        </span>
      </div>

      {/* Tree (scrollable, syncs with timeline grid) */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin"
      >
        {layers.length === 0 && groups.length === 0 ? (
          <div
            className="flex items-center px-2 text-xs text-muted-foreground"
            style={{ height: ROW_H }}
          >
            No layers
          </div>
        ) : (
          <TreeView<LayerNodeData>
            items={treeItems}
            renderNode={renderNode}
            onItemsChange={handleItemsChange}
            selectionMode="single"
            selectedIds={selectedIds}
            onSelectedIdsChange={handleSelectedIdsChange}
            expandedIds={expandedIds}
            onExpandedIdsChange={(ids) => setExpandedIds(ids)}
            draggable
            droppable
            showGuideLines={false}
            indentationWidth={16}
          />
        )}
      </div>
    </div>
  )
}
