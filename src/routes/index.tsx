import { createFileRoute } from "@tanstack/react-router";
import { CreateProjectDialog } from "@/components/create-project-dialog-simple";
import { Button } from "@/components/ui/button";
import { ProjectList } from "@/components/project-list";
import { CURRENT_USER_ID } from "@/lib/constants";

export const Route = createFileRoute("/")({
  component: Index,
});

// Main App component which acts as the Home Page
export default function Index() {
  return (
    <div className="p-8 px-36 text-foreground">
      {/* Header section with title and button */}
      <div className="flex justify-between items-center mb-8 pb-4 border-b-foreground">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          My Projects
        </h1>
        <CreateProjectDialog userId={CURRENT_USER_ID}>
          <Button variant="default">Create New Project</Button>
        </CreateProjectDialog>
      </div>
      <ProjectList />
    </div>
  );
}
