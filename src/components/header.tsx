import { PerfMonitor } from "./perf-monitor";

export const Header = () => {
  return (
    <header className="text-foreground text-sm font-bold w-full h-12 flex justify-between items-center px-6  border-b-accent border-b-2">
      Nur (Alpha)
      <PerfMonitor />
    </header>
  );
};
