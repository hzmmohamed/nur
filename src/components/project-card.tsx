import { Play } from "lucide-react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
  CardFooter,
} from "./ui/card";
import { formatDate } from "@/lib/utils";
import { Link, useRouteContext } from "@tanstack/react-router";
import { MyStoreReact } from "@/lib/store";

export const ProjectCard = ({ sceneId }: { sceneId: string }) => {
  const { store } = useRouteContext({ from: "__root__" });
  const { canvasHeight, canvasWidth, fps, lastUpdatedAt, name } =
    MyStoreReact.useRow("scenes", sceneId, store);
  return (
    <Link to="/scenes/$id" params={{ id: sceneId as string }}>
      <Card className="overflow-hidden shadow-md transition-transform hover:scale-105">
        {/* <img
        src={project.thumbnailBase64}
        alt={`Thumbnail for ${project.name}`}
        className="w-full h-auto object-cover aspect-video"
      /> */}
        <CardContent className="p-4">
          <CardTitle className="text-lg font-semibold">{name}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            {canvasWidth} x {canvasHeight} | {fps} FPS
          </CardDescription>
        </CardContent>
        <CardFooter className="flex justify-between items-center p-4 pt-0 text-xs text-muted-foreground">
          <span>Last updated: {formatDate(new Date(lastUpdatedAt || 0))}</span>
          <Button variant="ghost" size="icon" title="Open Project">
            <Play className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
};
