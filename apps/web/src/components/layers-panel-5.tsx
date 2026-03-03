import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";

import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  MoreVertical,
  Edit3,
  Plus,
  GripVertical,
  Video,
  Folder,
  Square,
  Shapes,
} from "lucide-react";
import { Input } from "./ui/input";
import type { Layer } from "@/lib/data-model/types";
import { useLayerManager, useLayerSelection } from "@/lib/data-model/hooks";
import type { BezierSyncEngine } from "@/lib/sync-engine/engine";

interface SortableLayerItemProps {
  layer: Layer;
  isSelected?: boolean;
  maskCount?: number;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

function SortableLayerItem({
  layer,
  isSelected = false,
  maskCount = 0,
  onToggleVisibility,
  onToggleLock,
  onRename,
  onDelete,
  onSelect,
}: SortableLayerItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleRename = useCallback(() => {
    if (editName.trim() && editName !== layer.name) {
      onRename(layer.id, editName.trim());
    }
    setIsEditing(false);
  }, [editName, layer.id, layer.name, onRename]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRename();
      } else if (e.key === "Escape") {
        setEditName(layer.name);
        setIsEditing(false);
      }
    },
    [handleRename, layer.name]
  );

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`group flex items-center h-8 text-xs cursor-pointer transition-colors ${
          isDragging ? "opacity-50 bg-primary/20" : "hover:bg-accent"
        } ${layer.locked ? "bg-destructive/10" : ""} ${
          isSelected ? "bg-primary/30 hover:bg-primary/30" : ""
        }`}
        onClick={() => onSelect(layer.id)}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="w-3 flex justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 ml-1"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" />
        </div>

        {/* Visibility Toggle */}
        <div className="w-6 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(layer.id);
            }}
            disabled={layer.locked}
          >
            {layer.visible ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Layer Thumbnail/Icon */}
        <div className="w-12 h-6 bg-muted border border-border flex items-center justify-center mr-2 ml-1">
          <Video className="h-3 w-3 text-muted-foreground" />
        </div>

        {/* Layer Name */}
        <div className="flex-1 min-w-0 pr-1">
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyPress}
              className="h-5 text-xs px-1 border-0 bg-background"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-1">
              <span className="block truncate font-normal">{layer.name}</span>
              {maskCount > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Shapes className="h-2.5 w-2.5" />
                  {maskCount}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Lock Icon */}
        <div className="w-6 flex justify-center">
          {layer.locked ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(layer.id);
              }}
            >
              <Lock className="h-3 w-3 text-destructive" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 opacity-0 group-hover:opacity-60"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(layer.id);
              }}
            >
              <Unlock className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* More Actions Menu */}
        <div className="w-4 flex justify-center opacity-0 group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Edit3 className="mr-2 h-3 w-3" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(layer.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}

interface LayersPanelProps {
  syncEngine: BezierSyncEngine | null;
  userId?: string;
  className?: string;
}

export default function LayersPanel({
  syncEngine,
  className = "",
  userId = "default-user",
}: LayersPanelProps) {
  // Get project and current frame from sync engine
  const project = syncEngine?.getProject() || null;
  const currentFrameId = syncEngine?.getCurrentContext()?.getFrameId() || null;

  // Layer management hooks
  const {
    layers,
    isLoading,
    error,
    layerCount,
    visibleCount,
    addLayer,
    removeLayer,
    updateLayer,
  } = useLayerManager(project);

  const { selectedLayerId, setSelectedLayer } = useLayerSelection(
    project,
    userId
  );

  // Track mask counts per layer for current frame
  const [layerMaskCounts, setLayerMaskCounts] = useState<
    Record<string, number>
  >({});

  // Update mask counts when layers, frame, or project changes
  useEffect(() => {
    if (!project || !currentFrameId) {
      setLayerMaskCounts({});
      return;
    }

    const counts: Record<string, number> = {};

    for (const layer of layers) {
      const masks = project.getAllMasksForLayer(layer.id);
      const frameMask = masks.find((m) => m.frameId === currentFrameId);
      counts[layer.id] = frameMask?.paths.length || 0;
    }

    setLayerMaskCounts(counts);

    // Subscribe to mask changes
    const layerFrameMasks = project.ydoc.getArray("layerFrameMasks");
    const observer = () => {
      const newCounts: Record<string, number> = {};
      for (const layer of layers) {
        const masks = project.getAllMasksForLayer(layer.id);
        const frameMask = masks.find((m) => m.frameId === currentFrameId);
        newCounts[layer.id] = frameMask?.paths.length || 0;
      }
      setLayerMaskCounts(newCounts);
    };

    layerFrameMasks.observeDeep(observer);

    return () => {
      layerFrameMasks.unobserveDeep(observer);
    };
  }, [project, layers, currentFrameId]);

  // Sync engine context when layer selection changes
  useEffect(() => {
    if (!syncEngine || !selectedLayerId || !currentFrameId) return;

    try {
      syncEngine.setActiveLayerFrame(selectedLayerId, currentFrameId);
    } catch (error) {
      console.error("Failed to set active layer-frame:", error);
    }
  }, [syncEngine, selectedLayerId, currentFrameId]);

  // Update layer visibility in sync engine when layer visibility changes
  useEffect(() => {
    if (!syncEngine) return;

    for (const layer of layers) {
      syncEngine.updateLayerVisibility(layer.id, layer.visible);
    }
  }, [syncEngine, layers]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort layers by creation order (reverse to show newest on top)
  const sortedLayers = useMemo(() => {
    return [...layers].reverse();
  }, [layers]);

  const layerIds = useMemo(
    () => sortedLayers.map((layer) => layer.id),
    [sortedLayers]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = layerIds.indexOf(active.id as string);
        const newIndex = layerIds.indexOf(over.id as string);

        // Reorder the layers array
        const reorderedLayers = arrayMove(sortedLayers, oldIndex, newIndex);

        // Note: In a real implementation, you'd want to update the layer order
        // in the data model by updating z-index or order properties
        console.log(
          "Layer reordering not fully implemented - needs z-index support"
        );
      }
    },
    [layerIds, sortedLayers]
  );

  const handleToggleVisibility = useCallback(
    async (id: string) => {
      const layer = layers.find((l) => l.id === id);
      if (layer && !layer.locked) {
        await updateLayer(id, { visible: !layer.visible });

        // Update sync engine visibility
        if (syncEngine) {
          syncEngine.updateLayerVisibility(id, !layer.visible);
        }
      }
    },
    [layers, updateLayer, syncEngine]
  );

  const handleToggleLock = useCallback(
    async (id: string) => {
      const layer = layers.find((l) => l.id === id);
      if (layer) {
        await updateLayer(id, { locked: !layer.locked });
      }
    },
    [layers, updateLayer]
  );

  const handleRename = useCallback(
    async (id: string, name: string) => {
      await updateLayer(id, { name });
    },
    [updateLayer]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const success = await removeLayer(id);
      if (success) {
        // Clear selection if deleted layer was selected
        if (selectedLayerId === id) {
          setSelectedLayer(null);
        }

        // Remove from sync engine
        if (syncEngine) {
          syncEngine.removeLayerContexts(id);
        }
      }
    },
    [removeLayer, selectedLayerId, setSelectedLayer, syncEngine]
  );

  const handleAddLayer = useCallback(async () => {
    const newLayer = await addLayer({
      name: `Layer ${layerCount + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
    });

    // Auto-select the new layer
    if (newLayer) {
      setSelectedLayer(newLayer.id);
    }
  }, [addLayer, layerCount, setSelectedLayer]);

  const handleLayerSelect = useCallback(
    (layerId: string) => {
      const newSelection = layerId === selectedLayerId ? null : layerId;
      setSelectedLayer(newSelection);
    },
    [selectedLayerId, setSelectedLayer]
  );

  // Show loading state
  if (isLoading) {
    return (
      <div
        className={`bg-sidebar text-sidebar-foreground text-xs ${className}`}
      >
        <div className="p-2 border-b border-sidebar-border">
          <h3 className="font-medium">Layers</h3>
        </div>
        <div className="p-2 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div
        className={`bg-sidebar text-sidebar-foreground text-xs ${className}`}
      >
        <div className="p-2 border-b border-sidebar-border">
          <h3 className="font-medium">Layers</h3>
        </div>
        <div className="p-2 text-destructive">Error: {error.message}</div>
      </div>
    );
  }

  return (
    <div className={`bg-sidebar text-sidebar-foreground text-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-sidebar-border">
        <div className="flex items-center gap-4">
          <span className="font-medium">Layers</span>
          <span className="text-muted-foreground">({layerCount})</span>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleAddLayer}
            title="Add Layer"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            disabled
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-sidebar-foreground hover:bg-sidebar-accent"
            title="New Group"
          >
            <Folder className="h-3 w-3" />
          </Button>
          <Button
            disabled
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-sidebar-foreground hover:bg-sidebar-accent"
            title="Add Mask"
          >
            <Square className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Blend Mode and Opacity Controls */}
      <div className="p-2 border-b border-sidebar-border space-y-2 cursor-not-allowed">
        <div className="flex items-center gap-2">
          <span className="w-16 text-muted-foreground">Mode:</span>
          <select
            disabled
            className="cursor-not-allowed flex-1 text-muted-foreground bg-sidebar-accent border border-sidebar-border rounded px-2 py-1 text-xs"
          >
            <option>Normal</option>
            <option>Multiply</option>
            <option>Screen</option>
            <option>Overlay</option>
          </select>
        </div>
        <div className="cursor-not-allowed flex items-center gap-2">
          <span className="w-16 text-muted-foreground">Opacity:</span>
          <input
            disabled
            type="range"
            min="0"
            max="100"
            defaultValue="100"
            className="cursor-not-allowed flex-1 h-1"
          />
          <span className="w-8 text-right">100%</span>
        </div>
      </div>

      {/* Layers List */}
      <div className="h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar-thumb-[#d2d2d244] scrollbar-track-[#00000000]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={layerIds}
            strategy={verticalListSortingStrategy}
          >
            {sortedLayers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Video className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No layers</p>
                <p className="text-[10px] mt-1">Click + to add a layer</p>
              </div>
            ) : (
              sortedLayers.map((layer) => (
                <SortableLayerItem
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedLayerId === layer.id}
                  maskCount={layerMaskCounts[layer.id] || 0}
                  onToggleVisibility={handleToggleVisibility}
                  onToggleLock={handleToggleLock}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onSelect={handleLayerSelect}
                />
              ))
            )}
          </SortableContext>
        </DndContext>
      </div>

      {/* Footer Info */}
      {layerCount > 0 && (
        <div className="p-2 border-t border-sidebar-border text-muted-foreground text-[10px] space-y-0.5">
          <div>
            {visibleCount}/{layerCount} visible
          </div>
          {selectedLayerId && currentFrameId && (
            <div className="flex items-center gap-1">
              <Shapes className="h-2.5 w-2.5" />
              <span>
                {layerMaskCounts[selectedLayerId] || 0} mask
                {layerMaskCounts[selectedLayerId] === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
