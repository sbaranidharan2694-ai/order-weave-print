import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_EMOJIS } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-primary-foreground",
      STATUS_COLORS[status] || "bg-muted text-muted-foreground"
    )}>
      <span>{STATUS_EMOJIS[status] || ""}</span>
      {status}
    </span>
  );
}
