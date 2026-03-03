import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { VideoEditingProject } from "../lib/data-model/impl-yjs-v2";

import {
  useUndoRedoState,
  useUndoDescriptions,
  useUndoKeyboardShortcuts,
} from "../lib/data-model/undo-hooks";
import { Undo2, Redo2, ChevronDown, Trash2 } from "lucide-react";

interface UndoWidgetProps {
  project: VideoEditingProject;
  className?: string;
}

export function UndoWidget({ project, className = "" }: UndoWidgetProps) {
  const [undoOpen, setUndoOpen] = useState(false);
  const [redoOpen, setRedoOpen] = useState(false);
  const [hoveredUndoIndex, setHoveredUndoIndex] = useState<number | null>(null);
  const [hoveredRedoIndex, setHoveredRedoIndex] = useState<number | null>(null);

  const { state, undo, redo, clearHistory } = useUndoRedoState(project);
  const descriptions = useUndoDescriptions(project);

  // Enable keyboard shortcuts
  useUndoKeyboardShortcuts(project);

  const handleUndoToIndex = (targetIndex: number) => {
    project.undoToIndex(targetIndex);
    setUndoOpen(false);
    setHoveredUndoIndex(null);
  };

  const handleRedoToIndex = (targetIndex: number) => {
    // Perform multiple redo operations
    for (let i = 0; i <= targetIndex; i++) {
      if (!project.redo()) break;
    }
    setRedoOpen(false);
    setHoveredRedoIndex(null);
  };

  const getUndoPreviewText = () => {
    if (hoveredUndoIndex === null || hoveredUndoIndex >= descriptions.length) {
      return `Undo ${state.undoStackSize} action${
        state.undoStackSize !== 1 ? "s" : ""
      }`;
    }

    const selectedCount = hoveredUndoIndex + 1;
    return `Undo ${selectedCount} action${selectedCount !== 1 ? "s" : ""}`;
  };

  const getRedoPreviewText = () => {
    if (hoveredRedoIndex === null) {
      return `Redo ${state.redoStackSize} action${
        state.redoStackSize !== 1 ? "s" : ""
      }`;
    }

    const selectedCount = hoveredRedoIndex + 1;
    return `Redo ${selectedCount} action${selectedCount !== 1 ? "s" : ""}`;
  };

  const truncateText = (text: string, maxLength: number = 30) => {
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  };

  // Mock redo history - in real implementation, you'd get this from the project
  const redoDescriptions = Array.from(
    { length: state.redoStackSize },
    (_, i) => ({
      index: i,
      description: `Redo action ${i + 1}`,
      type: "unknown",
      targetName: null,
      timestamp: Date.now() - i * 1000,
      relativeTime: `${i + 1}s ago`,
      icon: "🔄",
    })
  );

  return (
    <div className={`relative inline-flex gap-1 ${className}`}>
      {/* Undo Button Group */}
      <div className="flex">
        <Button
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={!state.canUndo}
          className="rounded-r-none border-r-0 px-2 py-1.5 h-8"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3 w-3" />
        </Button>

        {
          <Popover open={undoOpen} onOpenChange={setUndoOpen}>
            <PopoverTrigger asChild disabled={!state.canUndo}>
              <Button
                variant="ghost"
                size="xs"
                className="rounded-l-none px-1.5 py-1.5 h-8"
                title="Undo History"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              {/* Header */}
              <div className="p-3 border-b bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    {getUndoPreviewText()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearHistory}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    title="Clear History"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>

              {/* History List */}
              <ScrollArea className="h-64">
                {descriptions.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    No undo history available
                  </div>
                ) : (
                  <div className="p-0">
                    {descriptions.map((item, index) => (
                      <div
                        key={`undo-${item.timestamp}-${index}`}
                        className="relative"
                      >
                        <button
                          onClick={() => handleUndoToIndex(index)}
                          onMouseEnter={() => setHoveredUndoIndex(index)}
                          onMouseLeave={() => setHoveredUndoIndex(null)}
                          className={`
                            w-full text-left px-3 py-2 text-xs border-b border-border/50 last:border-b-0
                            transition-colors hover:bg-muted focus:bg-muted focus:ghost-none
                            ${
                              hoveredUndoIndex !== null &&
                              index <= hoveredUndoIndex
                                ? "bg-primary/10 text-primary-foreground"
                                : "text-foreground hover:text-foreground"
                            }
                          `}
                          title={`${item.description} (${item.relativeTime})${
                            item.targetName
                              ? ` - Target: ${item.targetName}`
                              : ""
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2 min-w-0 flex-1">
                              <span className="text-xs leading-none mt-0.5 flex-shrink-0">
                                {item.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate text-xs">
                                  {truncateText(item.description, 35)}
                                </div>
                                {item.targetName && (
                                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {truncateText(item.targetName, 25)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                              {item.relativeTime}
                            </div>
                          </div>
                        </button>
                        {index < descriptions.length - 1 && (
                          <Separator className="mx-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Footer */}
              <div className="p-2 border-t bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Undo: {state.undoStackSize} actions
                  </div>
                  {state.undoStackSize > 0 && (
                    <Badge variant="secondary" className="text-xs h-4 px-1">
                      {state.undoStackSize}
                    </Badge>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        }

        {/* Status Badge for Undo */}
        {state.undoStackSize > 0 && (
          <Badge
            variant="default"
            className="absolute -top-1 -left-1 h-4 w-4 p-0 text-xs flex items-center justify-center rounded-full"
          >
            {state.undoStackSize > 99 ? "99+" : state.undoStackSize}
          </Badge>
        )}
      </div>

      {/* Redo Button Group */}
      <div className="flex relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={redo}
          disabled={!state.canRedo}
          className="rounded-r-none border-r-0 px-2 py-1.5 h-8"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3 w-3" />
        </Button>

        {
          <Popover open={redoOpen} onOpenChange={setRedoOpen}>
            <PopoverTrigger asChild disabled={!state.canRedo}>
              <Button
                variant="ghost"
                size="xs"
                className="rounded-l-none px-1.5 py-1.5 h-8"
                title="Redo History"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              {/* Header */}
              <div className="p-3 border-b bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    {getRedoPreviewText()}
                  </span>
                </div>
              </div>

              {/* Redo History List */}
              <ScrollArea className="h-64">
                {state.redoStackSize === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    No redo history available
                  </div>
                ) : (
                  <div className="p-0">
                    {redoDescriptions.map((item, index) => (
                      <div
                        key={`redo-${item.timestamp}-${index}`}
                        className="relative"
                      >
                        <button
                          onClick={() => handleRedoToIndex(index)}
                          onMouseEnter={() => setHoveredRedoIndex(index)}
                          onMouseLeave={() => setHoveredRedoIndex(null)}
                          className={`
                            w-full text-left px-3 py-2 text-xs border-b border-border/50 last:border-b-0
                            transition-colors hover:bg-muted focus:bg-muted focus:ghost-none
                            ${
                              hoveredRedoIndex !== null &&
                              index <= hoveredRedoIndex
                                ? "bg-primary/10 text-primary-foreground"
                                : "text-foreground hover:text-foreground"
                            }
                          `}
                          title={`${item.description} (${item.relativeTime})`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2 min-w-0 flex-1">
                              <span className="text-xs leading-none mt-0.5 flex-shrink-0">
                                {item.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate text-xs">
                                  {truncateText(item.description, 35)}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                              {item.relativeTime}
                            </div>
                          </div>
                        </button>
                        {index < redoDescriptions.length - 1 && (
                          <Separator className="mx-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Footer */}
              <div className="p-2 border-t bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Redo: {state.redoStackSize} actions
                  </div>
                  {state.redoStackSize > 0 && (
                    <Badge variant="secondary" className="text-xs h-4 px-1">
                      {state.redoStackSize}
                    </Badge>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        }

        {/* Status Badge for Redo */}
        {state.redoStackSize > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-1 -left-1 h-4 w-4 p-0 text-xs flex items-center justify-center rounded-full"
          >
            {state.redoStackSize > 99 ? "99+" : state.redoStackSize}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default UndoWidget;
