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
  Image,
  Type,
  Square,
  Sliders,
} from "lucide-react";
import { Input } from "./ui/input";
import type { IVideoEditingProject } from "@/lib/data-model/interface";
import type { Layer } from "@/lib/data-model/types";

interface SortableLayerItemProps {
  layer: Layer;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function SortableLayerItem({
  layer,
  onToggleVisibility,
  onToggleLock,
  onRename,
  onDelete,
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

  const IconComponent = LAYER_TYPE_ICONS[layer.type];
  const typeColor = LAYER_TYPE_COLORS[layer.type];

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`border-b border-gray-100 transition-all duration-200 ${
          isDragging
            ? "opacity-50 scale-105 shadow-lg bg-blue-50"
            : "hover:bg-gray-50"
        } ${layer.locked ? "bg-amber-50 border-amber-200" : ""}`}
      >
        <div className="flex items-center gap-2 px-2 py-1.5">
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-gray-200 rounded"
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
              onClick={() => onToggleVisibility(layer.id)}
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
              onClick={() => onToggleLock(layer.id)}
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
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
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

interface AddLayerMenuProps {
  onAddLayer: (type: Layer["type"]) => void;
}

function AddLayerMenu({ onAddLayer }: AddLayerMenuProps) {
  const layerTypes: { type: Layer["type"]; label: string; icon: any }[] = [
    { type: "video", label: "Video Layer", icon: Video },
    { type: "image", label: "Image Layer", icon: Image },
    { type: "text", label: "Text Layer", icon: Type },
    { type: "shape", label: "Shape Layer", icon: Square },
    { type: "adjustment", label: "Adjustment Layer", icon: Sliders },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="w-full mb-4">
          <Plus className="mr-2 h-4 w-4" />
          Add Layer
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {layerTypes.map(({ type, label, icon: Icon }) => (
          <DropdownMenuItem key={type} onClick={() => onAddLayer(type)}>
            <Icon className="mr-2 h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface LayersPanelProps {
  project: IVideoEditingProject;
  className?: string;
}

export default function LayersPanel({
  project,
  className = "",
}: LayersPanelProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Convert Yjs data to plain objects for React state
  const [layers, setLayers] = useState<Layer[]>(() => {
    return project.getAllLayers();
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort layers by zIndex (higher zIndex = top of list)
  const sortedLayers = useMemo(() => {
    return [...layers].sort((a, b) => b.zIndex - a.zIndex);
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

        const reorderedIds = arrayMove(layerIds, oldIndex, newIndex);

        // Update zIndex for each layer based on new order
        const updatedLayers = sortedLayers.map((layer, index) => {
          const newZIndex =
            reorderedIds.length - reorderedIds.indexOf(layer.id) - 1;
          project.updateLayer(layer.id, { zIndex: newZIndex });
          return { ...layer, zIndex: newZIndex };
        });

        setLayers(updatedLayers);
      }
    },
    [layerIds, sortedLayers, project]
  );

  const handleToggleVisibility = useCallback(
    (id: string) => {
      const layer = layers.find((l) => l.id === id);
      if (layer && !layer.isLocked) {
        project.updateLayer(id, { isVisible: !layer.isVisible });
        setLayers((prev) =>
          prev.map((l) => (l.id === id ? { ...l, isVisible: !l.isVisible } : l))
        );
      }
    },
    [layers, project]
  );

  const handleToggleLock = useCallback(
    (id: string) => {
      const layer = layers.find((l) => l.id === id);
      if (layer) {
        project.updateLayer(id, { isLocked: !layer.isLocked });
        setLayers((prev) =>
          prev.map((l) => (l.id === id ? { ...l, isLocked: !l.isLocked } : l))
        );
      }
    },
    [layers, project]
  );

  const handleRename = useCallback(
    (id: string, name: string) => {
      project.updateLayer(id, { name });
      setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    },
    [project]
  );

  const handleDelete = useCallback(
    (id: string) => {
      project.removeLayer(id);
      setLayers((prev) => prev.filter((l) => l.id !== id));
    },
    [project]
  );

  const handleAddLayer = useCallback(
    (type: Layer["type"]) => {
      const layerId = project.addLayer({
        name: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Layer`,
        type,
        isVisible: true,
        isLocked: false,
        opacity: 1,
        blendMode: "normal",
        zIndex: Math.max(...layers.map((l) => l.zIndex), -1) + 1,
      });

      // Get the newly created layer from the project
      const newLayers = project
        .getAllLayers()
        .map((layer) => layer.toObject() as Layer);
      setLayers(newLayers);
    },
    [project, layers]
  );

  return (
    <div className={`bg-white rounded-lg border p-4 ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Layers</h2>
        <p className="text-sm text-gray-500">
          {layers.length} layer{layers.length !== 1 ? "s" : ""}
        </p>
      </div>

      <AddLayerMenu onAddLayer={handleAddLayer} />

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
                  onSelect={() => {}}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {layers.length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Drag to reorder • Higher layers appear on top</span>
            <span>
              {layers.filter((l) => l.isVisible).length}/{layers.length} visible
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
