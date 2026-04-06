import { Separator } from "@/components/ui/separator";
import { HAInstances } from "@/components/settings/ha-instances";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your Home Assistant connections and preferences.
        </p>
      </div>
      <Separator />
      <HAInstances />
    </div>
  );
}
