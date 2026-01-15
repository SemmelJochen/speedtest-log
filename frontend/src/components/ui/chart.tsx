import * as React from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  TooltipProps,
} from "recharts";
import { cn } from "@/lib/utils";

// Chart container with responsive wrapper
interface ChartContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function ChartContainer({ children, className }: ChartContainerProps) {
  return (
    <div className={cn("w-full h-[300px]", className)}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

// Custom tooltip component for shadcn style
interface ChartTooltipContentProps extends TooltipProps<number, string> {
  hideLabel?: boolean;
  indicator?: "line" | "dot" | "dashed";
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  indicator = "dot",
}: ChartTooltipContentProps) {
  if (!active || !payload) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm">
      {!hideLabel && (
        <div className="mb-1 text-sm font-medium text-foreground">{label}</div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            {indicator === "dot" && (
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
            )}
            {indicator === "line" && (
              <div
                className="h-0.5 w-3"
                style={{ backgroundColor: entry.color }}
              />
            )}
            {indicator === "dashed" && (
              <div
                className="h-0.5 w-3 border-t-2 border-dashed"
                style={{ borderColor: entry.color }}
              />
            )}
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Export recharts components for easy use
export {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
};
