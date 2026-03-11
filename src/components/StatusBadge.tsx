import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_EMOJIS, STATUS_BADGE_STYLES } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_BADGE_STYLES[status];
  if (style) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: style.bg, color: style.text }}
      >
        <span>{STATUS_EMOJIS[status] || ""}</span>
        {status}
      </span>
    );
  }
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
