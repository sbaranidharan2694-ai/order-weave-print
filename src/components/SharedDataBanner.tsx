import { AlertTriangle, CloudOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Props = {
  /** When true, show banner: data is stored only on this device */
  useLocalStorage: boolean;
  /** Optional: which feature (e.g. "Bank Analyser", "Attendance") */
  feature?: string;
};

export function SharedDataBanner({ useLocalStorage, feature }: Props) {
  if (!useLocalStorage) return null;

  return (
    <Alert className="rounded-xl border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
      <CloudOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        Data is only on this device — others cannot see it
      </AlertTitle>
      <AlertDescription>
        {feature && <span className="font-medium">{feature}: </span>}
        Uploads are saved in this browser only. To share with your team, run the <strong>Supabase migrations</strong> so
        data is stored in the cloud. See the project README: &quot;Automatic migrations on deploy (Lovable)&quot; —
        add <code className="rounded bg-amber-200/50 px-1 text-xs dark:bg-amber-900/50">SUPABASE_ACCESS_TOKEN</code> and{" "}
        <code className="rounded bg-amber-200/50 px-1 text-xs dark:bg-amber-900/50">SUPABASE_PROJECT_REF</code> in
        GitHub Secrets, then push to main. After migrations run, everyone using this app will see the same data.
      </AlertDescription>
    </Alert>
  );
}
