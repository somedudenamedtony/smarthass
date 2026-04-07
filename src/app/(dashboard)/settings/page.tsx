import { Separator } from "@/components/ui/separator";
import { HAInstances } from "@/components/settings/ha-instances";
import { AnalysisSettings } from "@/components/settings/analysis-settings";
import { ApiKeySettings } from "@/components/settings/api-key-settings";
import { isHomeAssistant } from "@/lib/config";

export default function SettingsPage() {
  const haMode = isHomeAssistant();

  return (
    <div className="max-w-3xl space-y-8 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gradient">Settings</h1>
        <p className="text-muted-foreground">
          Manage your Home Assistant connections and preferences.
        </p>
      </div>
      <Separator />
      <HAInstances />
      {!haMode && (
        <>
          <Separator />
          <ApiKeySettings />
        </>
      )}
      <Separator />
      <AnalysisSettings />
    </div>
  );
}
