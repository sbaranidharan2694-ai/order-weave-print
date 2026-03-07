import { cn } from "@/lib/utils";
import { SOURCE_COLORS } from "@/lib/constants";
import { MessageCircle, Mail, Edit3, FileText, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  email: Mail,
  manual: Edit3,
  purchase_order: FileText,
};

const labels: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  manual: "Manual",
  purchase_order: "From PO",
};

export function SourceBadge({ source }: { source: string }) {
  const Icon = icons[source] || Edit3;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-primary-foreground",
      SOURCE_COLORS[source] || "bg-muted text-muted-foreground"
    )}>
      <Icon className="h-3 w-3" />
      {labels[source] || source}
    </span>
  );
}
