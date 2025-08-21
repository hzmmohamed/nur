import { Label } from "@/components/ui/label";
import { Unlock, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "@tanstack/react-form";
import { Input } from "./ui/input";
import { z } from "zod/v3";
import { useNavigate, useRouteContext } from "@tanstack/react-router";

const defaultValues: {
  height: number;
  width: number;
  fps: number;
  name: string;
} = {
  fps: 24,
  height: 1080,
  width: 1920,
  name: "",
};

export function NewSceneDialogContent() {
  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const navigate = useNavigate();
  const { store } = useRouteContext({ from: "__root__" });
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value: { fps, height, name, width } }) => {
      const id = crypto.randomUUID();
      store.setRow("scenes", id, {
        id,
        name,
        lastUpdatedAt: Date.now(),
        canvasHeight: height,
        canvasWidth: width,
        framesCount: 100,
        fps,
      });
      navigate({ to: "/scenes/$id", params: { id } });
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
            New Scene
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <form.Field
            name="name"
            validators={{
              onBlur: z.string().nonempty("Project name cannot be empty"),
              onChange: z
                .string()
                .regex(
                  /^(?:[a-zA-Z0-9\s]*)?$/,
                  "Project name must contain only alphanumeric characters."
                ),
            }}
            children={(field) => (
              <>
                <Label htmlFor="name" className="text-sm font-semibold">
                  Scene Name
                </Label>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  type="text"
                  placeholder="My Scene"
                  className={
                    field.state.meta.isValid ? "" : "border-destructive"
                  }
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
        <div className="flex flex-col gap-4">
          <Label htmlFor="canvas-dimensions" className="text-sm font-semibold">
            Canvas Dimensions
          </Label>
          <div className="flex items-center space-x-2">
            <form.Field
              name="width"
              listeners={{
                onChange: () => {
                  setFrames([]);
                  if (isAspectRatioLocked) {
                    const newHeight = Math.round(
                      form.state.values.width / aspectRatio
                    );
                    form.setFieldValue("height", newHeight);
                  }
                },
              }}
              children={(field) => (
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                  onBlur={field.handleBlur}
                  type="number"
                  placeholder="Width"
                  min={0}
                  max={4000}
                />
              )}
            />
            <span className="text-muted-foreground">x</span>
            <form.Field
              name="height"
              listeners={{
                onChange: () => {
                  setFrames([]);
                  if (isAspectRatioLocked) {
                    const newWidth = Math.round(
                      form.state.values.height * aspectRatio
                    );
                    form.setFieldValue("width", newWidth);
                  }
                },
              }}
              children={(field) => (
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                  onBlur={field.handleBlur}
                  type="number"
                  placeholder="Height"
                  min={0}
                  max={4000}
                />
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

        <div className="flex flex-col gap-4">
          <form.Field
            name="fps"
            // hfahmi: Is there a need for validators whene min and max are set on the input itself
            // validators={{ onChange: z.number().positive().int().max(40) }}
            children={(field) => (
              <>
                <Label htmlFor="fps" className="text-sm font-semibold">
                  Frames Per Second (FPS)
                </Label>
                <Input
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                  onBlur={field.handleBlur}
                  type="number"
                  placeholder="FPS"
                  min={0}
                  max={40}
                />
              </>
            )}
          />
        </div>

        <div className="flex justify-end gap-6 bottom-0 w-full self-end">
          <form.Subscribe
            selector={({ isPristine, fieldMeta, canSubmit, isSubmitting }) => ({
              isPristine,
              fieldMeta,
              canSubmit,
              isSubmitting,
            })}
            children={({ canSubmit, isSubmitting, isPristine }) => (
              <Button type="submit" disabled={isPristine || !canSubmit}>
                {isSubmitting ? "..." : "Create"}
              </Button>
            )}
          />
        </div>
      </div>
    </form>
  );
}
