import { Label } from "@/components/ui/label";
import { Unlock, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "@tanstack/react-form";
import { Input } from "./ui/input";
import { z } from "zod";
import { useCreateProject } from "../hooks/useProjects";
import { type CreateProjectData } from "../types/project";

const defaultValues: {
  height: number;
  width: number;
  fps: number;
  name: string;
  description: string;
} = {
  fps: 24,
  height: 1080,
  width: 1920,
  name: "",
  description: "",
};

interface CreateProjectDialogContentProps {
  onSuccess?: (projectId: string) => void;
  onClose?: () => void;
  userId: string;
}

export function CreateProjectDialogContent({ 
  onSuccess, 
  onClose,
  userId 
}: CreateProjectDialogContentProps) {
  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  
  const createProjectMutation = useCreateProject();

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const projectData: CreateProjectData = {
        name: value.name,
        description: value.description.trim() || undefined,
        ownerId: userId,
        canvasWidth: value.width,
        canvasHeight: value.height,
        fps: value.fps,
        settings: {
          isPublic: false,
          allowComments: true,
        },
      };

      try {
        const newProject = await createProjectMutation.mutateAsync(projectData);
        onSuccess?.(newProject.id);
        onClose?.();
      } catch (error) {
        console.error('Failed to create project:', error);
        // Error is handled by the mutation's onError callback
      }
    },
  });

  const toggleAspectRatioLock = () => {
    const {
      state: { values },
    } = form;

    setIsAspectRatioLocked(!isAspectRatioLocked);
    if (!isAspectRatioLocked) {
      setAspectRatio(values.width / values.height);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex-col justify-between gap-6 flex h-full"
    >
      <div className="flex flex-col gap-6">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-2xl text-foreground font-bold">
            New Project
          </DialogTitle>
        </DialogHeader>

        {/* Project Name */}
        <div className="flex flex-col gap-4">
          <form.Field
            name="name"
            validators={{
              onBlur: z.string().min(1, "Project name cannot be empty").max(100, "Project name too long"),
              onChange: z
                .string()
                .regex(
                  /^(?:[a-zA-Z0-9\s]*)?$/,
                  "Project name must contain only alphanumeric characters."
                ),
            }}
            children={(field) => (
              <>
                <Label htmlFor="name" className="text-sm font-semibold text-foreground">
                  Project Name
                </Label>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  type="text"
                  placeholder="My Project"
                  className={`text-foreground ${
                    field.state.meta.isValid ? "" : "border-destructive"
                  }`}
                />
                <div className="flex flex-col gap-2">
                  {field.state.meta.errors.map((error, i) => (
                    <p key={i} className="text-destructive text-xs">
                      {error?.message}
                    </p>
                  ))}
                </div>
              </>
            )}
          />
        </div>

        {/* Project Description */}
        <div className="flex flex-col gap-4">
          <form.Field
            name="description"
            validators={{
              onChange: z.string().max(500, "Description too long").optional(),
            }}
            children={(field) => (
              <>
                <Label htmlFor="description" className="text-sm font-semibold text-foreground">
                  Description (Optional)
                </Label>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  type="text"
                  placeholder="Project description..."
                  className={`text-foreground ${
                    field.state.meta.isValid ? "" : "border-destructive"
                  }`}
                />
                <div className="flex flex-col gap-2">
                  {field.state.meta.errors.map((error, i) => (
                    <p key={i} className="text-destructive text-xs">
                      {error?.message}
                    </p>
                  ))}
                </div>
              </>
            )}
          />
        </div>

        {/* Canvas Dimensions */}
        <div className="flex flex-col gap-4">
          <Label htmlFor="canvas-dimensions" className="text-sm font-semibold text-foreground">
            Canvas Dimensions
          </Label>
          <div className="flex items-center space-x-2">
            <form.Field
              name="width"
              validators={{
                onChange: z.number().int().positive().min(1).max(7680),
              }}
              listeners={{
                onChange: () => {
                  if (isAspectRatioLocked) {
                    const newHeight = Math.round(
                      form.state.values.width / aspectRatio
                    );
                    form.setFieldValue("height", newHeight);
                  }
                },
              }}
              children={(field) => (
                <div className="flex-1">
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                    onBlur={field.handleBlur}
                    type="number"
                    placeholder="Width"
                    min={1}
                    max={7680}
                    className={`text-foreground ${
                      field.state.meta.isValid ? "" : "border-destructive"
                    }`}
                  />
                  {field.state.meta.errors.map((error, i) => (
                    <p key={i} className="text-destructive text-xs mt-1">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            />
            <span className="text-muted-foreground">x</span>
            <form.Field
              name="height"
              validators={{
                onChange: z.number().int().positive().min(1).max(4320),
              }}
              listeners={{
                onChange: () => {
                  if (isAspectRatioLocked) {
                    const newWidth = Math.round(
                      form.state.values.height * aspectRatio
                    );
                    form.setFieldValue("width", newWidth);
                  }
                },
              }}
              children={(field) => (
                <div className="flex-1">
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                    onBlur={field.handleBlur}
                    type="number"
                    placeholder="Height"
                    min={1}
                    max={4320}
                    className={`text-foreground ${
                      field.state.meta.isValid ? "" : "border-destructive"
                    }`}
                  />
                  {field.state.meta.errors.map((error, i) => (
                    <p key={i} className="text-destructive text-xs mt-1">
                      {error?.message}
                    </p>
                  ))}
                </div>
              )}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleAspectRatioLock}
              className="flex-shrink-0"
              title={
                isAspectRatioLocked
                  ? "Unlock aspect ratio"
                  : "Lock aspect ratio"
              }
            >
              {isAspectRatioLocked ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </Button>
          </div>
          {isAspectRatioLocked && (
            <p className="text-xs text-muted-foreground mt-1">
              Aspect ratio is locked at {aspectRatio.toFixed(2)}:1
            </p>
          )}
        </div>

        {/* FPS */}
        <div className="flex flex-col gap-4">
          <form.Field
            name="fps"
            validators={{
              onChange: z.number().int().positive().min(1).max(120),
            }}
            children={(field) => (
              <>
                <Label htmlFor="fps" className="text-sm font-semibold text-foreground">
                  Frames Per Second (FPS)
                </Label>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                  onBlur={field.handleBlur}
                  type="number"
                  placeholder="FPS"
                  min={1}
                  max={120}
                  className={`text-foreground ${
                    field.state.meta.isValid ? "" : "border-destructive"
                  }`}
                />
                <div className="flex flex-col gap-2">
                  {field.state.meta.errors.map((error, i) => (
                    <p key={i} className="text-destructive text-xs">
                      {error?.message}
                    </p>
                  ))}
                </div>
              </>
            )}
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-3 bottom-0 w-full self-end">
          {onClose && (
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={createProjectMutation.isPending}
            >
              Cancel
            </Button>
          )}
          <form.Subscribe
            selector={({ isPristine, fieldMeta, canSubmit, isSubmitting }) => ({
              isPristine,
              fieldMeta,
              canSubmit,
              isSubmitting,
            })}
            children={({ canSubmit, isSubmitting, isPristine }) => (
              <Button 
                type="submit" 
                disabled={isPristine || !canSubmit || createProjectMutation.isPending}
              >
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            )}
          />
        </div>

        {/* Error Display */}
        {createProjectMutation.isError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-destructive text-sm">
              Failed to create project. Please try again.
            </p>
          </div>
        )}
      </div>
    </form>
  );
}

// Example usage component that wraps the dialog
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface CreateProjectDialogProps {
  children: React.ReactNode;
  userId: string;
  onProjectCreated?: (projectId: string) => void;
}

export function CreateProjectDialog({ 
  children, 
  userId, 
  onProjectCreated 
}: CreateProjectDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSuccess = (projectId: string) => {
    setOpen(false);
    onProjectCreated?.(projectId);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <CreateProjectDialogContent
          userId={userId}
          onSuccess={handleSuccess}
          onClose={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}