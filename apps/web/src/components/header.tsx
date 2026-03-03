import { Link } from "@tanstack/react-router";
import { Breadcrumbs } from "./breadcrumbs";
import { PerfMonitor } from "./perf-monitor";
import { Badge } from "./ui/badge";

export const Header = () => {
  return (
    <header className="text-foreground text-sm font-bold w-full h-12 flex justify-between items-center px-6  border-b-accent border-b-2">
      <div className="flex gap-4 items-center">
        <div className="pr-4 border-r border-muted-foreground">
          <Link to="/" className="flex gap-1 items-baseline">
            Nur
            <Badge variant={"outline"} className="text-xs h-4">
              Alpha
            </Badge>
          </Link>
        </div>

        <Breadcrumbs />
      </div>
      <PerfMonitor />
    </header>
  );
};
