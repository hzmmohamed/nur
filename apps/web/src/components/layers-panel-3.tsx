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
} from "lucide-react";
import { Input } from "./ui/input";
import type { Layer } from "@/lib/data-model/types";
import { useAllLayers, useLayerManager } from "@/lib/data-model/hooks";
import type { VideoEditingProject } from "@/lib/data-model/impl-yjs";

// Default layer icon and color
const DEFAULT_LAYER_ICON = Video;
const DEFAULT_LAYER_COLOR = "bg-gray-100";

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

  // Get layer type from metadata if available, fallback to default
  const IconComponent = DEFAULT_LAYER_ICON;
  const typeColor = DEFAULT_LAYER_COLOR;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`border-b border-gray-100 transition-all duration-200 cursor-pointer ${
          isDragging
            ? "opacity-50 scale-105 shadow-lg bg-blue-50"
            : "hover:bg-gray-50"
        } ${layer.locked ? "bg-amber-50 border-amber-200" : ""} ${
          isSelected ? "bg-blue-100 border-blue-300" : ""
        }`}
        onClick={() => onSelect(layer.id)}
      >
        <div className="flex items-center gap-2 px-2 py-1.5">
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-gray-200 rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3 text-gray-400" />
          </div>

          {/* Layer Type Icon */}
          <div className={`p-1 rounded ${typeColor} bg-opacity-20`}>
            <IconComponent className={`h-3 w-3 text-gray-700`} />
          </div>

          {/* Layer Name */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRename}
                onKeyDown={handleKeyPress}
                className="h-6 text-xs px-1"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="font-medium text-xs truncate block">
                {layer.name}
              </span>
            )}
          </div>

          {/* Layer Controls */}
          <div className="flex items-center gap-0.5">
            {/* Visibility Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(layer.id);
              }}
              disabled={layer.locked}
            >
              {layer.visible ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3 text-gray-400" />
              )}
            </Button>

            {/* Lock Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(layer.id);
              }}
            >
              {layer.locked ? (
                <Lock className="h-3 w-3 text-amber-500" />
              ) : (
                <Unlock className="h-3 w-3" />
              )}
            </Button>

            {/* More Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit3 className="mr-2 h-3 w-3" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-3 w-3" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Opacity indicator */}
        {layer.opacity < 1 && (
          <div className="px-2 pb-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-0.5">
                <div
                  className="bg-blue-500 h-0.5 rounded-full transition-all duration-200"
                  style={{ width: `${layer.opacity * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 text-[10px]">
                {Math.round(layer.opacity * 100)}%
              </span>
            </div>
          </div>
        )}
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
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface AddLayerButtonProps {
  onAddLayer: () => void;
}

function AddLayerButton({ onAddLayer }: AddLayerButtonProps) {
  return (
    <Button className="w-full mb-4" onClick={onAddLayer}>
      <Plus className="mr-2 h-4 w-4" />
      Add Layer
    </Button>
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
    getVisibleLayers,
    layerCount,
    visibleCount,
    lockedCount,
  } = useAllLayers(project);

  // Use management hook for layer operations only
  const { addLayer, removeLayer, updateLayer } = useLayerManager(project);

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
        // This would require extending the ILayerManager interface
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
        // Use the updateLayer method from the hook
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

  const handleAddLayer = useCallback(async () => {
    await addLayer({
      name: `Layer ${layerCount + 1}`,
      id: `Layer ${layerCount + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
    });
  }, [addLayer, layerCount]);

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
      <div className={`bg-white rounded-lg border p-4 ${className}`}>
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Layers</h2>
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className={`bg-white rounded-lg border p-4 ${className}`}>
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Layers</h2>
          <p className="text-sm text-red-500">Error: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border p-4 ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Layers</h2>
        <p className="text-sm text-gray-500">
          {layerCount} layer{layerCount !== 1 ? "s" : ""}
        </p>
      </div>

      <AddLayerButton onAddLayer={handleAddLayer} />

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
          <div className="space-y-0">
            {sortedLayers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Video className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No layers yet</p>
                <p className="text-xs">Add your first layer to get started</p>
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
          </div>
        </SortableContext>
      </DndContext>

      {layerCount > 0 && (
        <div className="mt-4 pt-3 border-t">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Drag to reorder • Higher layers appear on top</span>
            <span>
              {visibleCount}/{layerCount} visible
              {lockedCount > 0 && ` • ${lockedCount} locked`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
