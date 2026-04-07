"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export interface SyncResult {
  success: boolean;
  entitiesSynced?: number;
  statsSynced?: number;
  automationsSynced?: number;
  error?: string;
}

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncing: boolean;
  syncResult: SyncResult | null;
}

export function SyncDialog({ open, onOpenChange, syncing, syncResult }: SyncDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!syncing) onOpenChange(o);
      }}
    >
      <DialogContent showCloseButton={!syncing} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {syncResult === null
              ? "Syncing with Home Assistant"
              : syncResult.success
                ? "Sync Complete"
                : "Sync Failed"}
          </DialogTitle>
          <DialogDescription>
            {syncResult === null
              ? "Fetching latest data from your Home Assistant instance…"
              : syncResult.success
                ? "Your data has been synced successfully."
                : syncResult.error}
          </DialogDescription>
        </DialogHeader>

        {/* Processing state */}
        {syncResult === null && (
          <div className="space-y-3 py-2">
            {["Entities", "Daily Statistics", "Automations"].map((label) => (
              <div key={label} className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Success state */}
        {syncResult?.success && (
          <div className="space-y-3 py-2">
            {[
              { label: "Entities", count: syncResult.entitiesSynced },
              { label: "Daily Statistics", count: syncResult.statsSynced },
              { label: "Automations", count: syncResult.automationsSynced },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.count != null && (
                  <Badge variant="secondary">{item.count}</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {syncResult && !syncResult.success && (
          <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 text-sm">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <span>{syncResult.error}</span>
          </div>
        )}

        {syncResult !== null && (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>
              {syncResult.success ? "Done" : "Close"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
