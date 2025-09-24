import React, { useState, useCallback, useMemo } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  Link,
  Folder,
  Square,
} from "lucide-react";
import { Input } from "./ui/input";
import type { Layer } from "@/lib/data-model/types";
import { useAllLayers, useLayerManager } from "@/lib/data-model/hooks";
import type { VideoEditingProject } from "@/lib/data-model/impl-yjs";

interface SortableLayerItemProps {
  layer: Layer;
  isSelected?: boolean;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}

function SortableLayerItem({
  layer,
  isSelected = false,
  onToggleVisibility,
  onToggleLock,
  onRename,
  onDelete,
  onSelect,
}: SortableLayerItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
          isDragging
            ? "opacity-50 bg-primary/20"
            : "hover:bg-accent"
        } ${layer.locked ? "bg-destructive/10" : ""} ${
          isSelected ? "bg-primary/30" : ""
        }`}
        onClick={() => onSelect(layer.id)}
      >
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

        {/* Link/Chain Icon (placeholder for layer linking) */}
        {/* <div className="w-5 flex justify-center opacity-0 group-hover:opacity-60">
          <Link className="h-3 w-3" />
        </div> */}

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
            <span className="block truncate font-normal">
              {layer.name}
            </span>
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
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="w-3 flex justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 ml-1"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" />
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Layer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{layer.name}"? This action cannot
              be undone and will remove all associated masks and animations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(layer.id);
                setShowDeleteDialog(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface LayersPanelProps {
  project: VideoEditingProject | null;
  className?: string;
  selectedLayerId?: string | null;
  onLayerSelect?: (layerId: string | null) => void;
}

export default function LayersPanel({
  project,
  className = "",
  selectedLayerId = null,
  onLayerSelect,
}: LayersPanelProps) {
  // Use reactive hook for reading layers
  const {
    layers,
    isLoading,
    error,
    layerCount,
    visibleCount,
  } = useAllLayers(project);

  // Use management hook for layer operations only
  const {
    addLayer,
    removeLayer,
    updateLayer,
  } = useLayerManager(project);

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
        console.log("Layer reordering not fully implemented - needs z-index support");
      }
    },
    [layerIds, sortedLayers]
  );

  const handleToggleVisibility = useCallback(
    async (id: string) => {
      const layer = layers.find((l) => l.id === id);
      if (layer && !layer.locked) {
        await updateLayer(id, { visible: !layer.visible });
      }
    },
    [layers, updateLayer]
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
      if (success && selectedLayerId === id && onLayerSelect) {
        onLayerSelect(null);
      }
    },
    [removeLayer, selectedLayerId, onLayerSelect]
  );

  const handleAddLayer = useCallback(
    async () => {
      await addLayer({
        name: `Layer ${layerCount + 1}`,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
      });
    },
    [addLayer, layerCount]
  );

  const handleLayerSelect = useCallback(
    (layerId: string) => {
      if (onLayerSelect) {
        onLayerSelect(layerId === selectedLayerId ? null : layerId);
      }
    },
    [selectedLayerId, onLayerSelect]
  );

  // Show loading state
  if (isLoading) {
    return (
      <div className={`bg-sidebar text-sidebar-foreground text-xs ${className}`}>
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
      <div className={`bg-sidebar text-sidebar-foreground text-xs ${className}`}>
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
            size="sm"
            disabled
            variant="ghost"
            className="h-6 w-6 p-0 text-sidebar-foreground hover:bg-sidebar-accent"
            title="New Group"
          >
            <Folder className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            disabled
            variant="ghost"
            className="h-6 w-6 p-0 text-sidebar-foreground hover:bg-sidebar-accent"
            title="Add Mask"
          >
            <Square className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => selectedLayerId && handleDelete(selectedLayerId)}
            disabled={!selectedLayerId}
            title="Delete Layer"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Blend Mode and Opacity Controls */}
      <div className="p-2 border-b border-sidebar-border space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-16 text-muted-foreground">Mode:</span>
          <select className="flex-1 bg-sidebar-accent border border-sidebar-border rounded px-2 py-1 text-xs">
            <option>Normal</option>
            <option>Multiply</option>
            <option>Screen</option>
            <option>Overlay</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-16 text-muted-foreground">Opacity:</span>
          <input
            type="range"
            min="0"
            max="100"
            defaultValue="100"
            className="flex-1 h-1"
          />
          <span className="w-8 text-right">100%</span>
        </div>
      </div>

      {/* Layers List */}
      <div className="min-h-[200px] max-h-[400px] overflow-y-auto">
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
              </div>
            ) : (
              sortedLayers.map((layer) => (
                <SortableLayerItem
                  key={layer.id}
                  layer={layer}
                  isSelected={selectedLayerId === layer.id}
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
        <div className="p-2 border-t border-sidebar-border text-muted-foreground text-[10px]">
          {visibleCount}/{layerCount} visible
        </div>
      )}
    </div>
  );
}