import { createFileRoute } from "@tanstack/react-router";
import { NewSceneDialogContent } from "@/components/create-project-dialog-simple";
import { useState } from "react";
import { ProjectCard } from "@/components/project-card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { myStore, MyStoreReact } from "@/lib/store";

export const Route = createFileRoute("/")({
  component: Index,
});

// Main App component which acts as the Home Page
export default function Index() {
  const [isOpen, setIsOpen] = useState(false);
  const sceneIds = MyStoreReact.useRowIds("scenes", myStore);
  return (
    <div className="p-8 px-36 text-foreground">
      {/* Header section with title and button */}
      <div className="flex justify-between items-center mb-8 pb-4 border-b-foreground">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Scenes
        </h1>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="default">Create New Project</Button>
          </DialogTrigger>
          <DialogContent className="h-3/4 max-w-md text-card-foreground bg-card overflow-y-auto scrollbar-thin scrollbar-thumb-rounded-full scrollbar-track-rounded-full  scrollbar-thumb-[#d2d2d244] scrollbar-track-[#00000000] ">
            <NewSceneDialogContent />
          </DialogContent>
        </Dialog>
      </div>

      {/* Project Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {sceneIds.map((id) => (
          <ProjectCard key={id} sceneId={id} />
        ))}
      </div>
    </div>
  );
}
