"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface Widget {
  id: string;
  type: WidgetType;
  title?: string;
  position: number;
  width: number; // 1-4 columns
  height: number; // 1-3 rows
  config?: Record<string, unknown>;
  isVisible: boolean;
}

export type WidgetType =
  | "stats"
  | "entity_list"
  | "chart"
  | "insights"
  | "activity"
  | "health"
  | "heatmap"
  | "areas"
  | "quick_actions";

export const WIDGET_DEFINITIONS: Record<WidgetType, {
  label: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  icon: string;
}> = {
  stats: {
    label: "Statistics",
    description: "Key metrics overview",
    defaultWidth: 1,
    defaultHeight: 1,
    minWidth: 1,
    maxWidth: 2,
    minHeight: 1,
    maxHeight: 1,
    icon: "chart-bar",
  },
  entity_list: {
    label: "Entity List",
    description: "Quick view of entities",
    defaultWidth: 2,
    defaultHeight: 2,
    minWidth: 1,
    maxWidth: 4,
    minHeight: 1,
    maxHeight: 3,
    icon: "list",
  },
  chart: {
    label: "Chart",
    description: "Entity activity chart",
    defaultWidth: 2,
    defaultHeight: 2,
    minWidth: 2,
    maxWidth: 4,
    minHeight: 1,
    maxHeight: 2,
    icon: "chart-line",
  },
  insights: {
    label: "AI Insights",
    description: "Recent AI insights feed",
    defaultWidth: 2,
    defaultHeight: 2,
    minWidth: 1,
    maxWidth: 4,
    minHeight: 1,
    maxHeight: 3,
    icon: "lightbulb",
  },
  activity: {
    label: "Recent Activity",
    description: "Recent state changes",
    defaultWidth: 2,
    defaultHeight: 2,
    minWidth: 1,
    maxWidth: 3,
    minHeight: 1,
    maxHeight: 3,
    icon: "activity",
  },
  health: {
    label: "Instance Health",
    description: "HA connection status",
    defaultWidth: 1,
    defaultHeight: 1,
    minWidth: 1,
    maxWidth: 2,
    minHeight: 1,
    maxHeight: 1,
    icon: "heart-pulse",
  },
  heatmap: {
    label: "Activity Heatmap",
    description: "Hourly activity patterns",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    maxWidth: 4,
    minHeight: 1,
    maxHeight: 2,
    icon: "grid",
  },
  areas: {
    label: "Areas",
    description: "Area activity overview",
    defaultWidth: 2,
    defaultHeight: 2,
    minWidth: 1,
    maxWidth: 4,
    minHeight: 1,
    maxHeight: 3,
    icon: "home",
  },
  quick_actions: {
    label: "Quick Actions",
    description: "Quick toggle controls",
    defaultWidth: 1,
    defaultHeight: 1,
    minWidth: 1,
    maxWidth: 2,
    minHeight: 1,
    maxHeight: 2,
    icon: "zap",
  },
};

interface WidgetContextType {
  widgets: Widget[];
  setWidgets: (widgets: Widget[]) => void;
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<Widget>) => void;
  moveWidget: (fromIndex: number, toIndex: number) => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  saveLayout: () => Promise<void>;
  isSaving: boolean;
}

const WidgetContext = createContext<WidgetContextType | undefined>(undefined);

export function WidgetProvider({
  children,
  initialWidgets,
  instanceId,
}: {
  children: ReactNode;
  initialWidgets: Widget[];
  instanceId: string | null;
}) {
  const [widgets, setWidgets] = useState<Widget[]>(initialWidgets);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const addWidget = useCallback((type: WidgetType) => {
    const def = WIDGET_DEFINITIONS[type];
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      type,
      title: def.label,
      position: widgets.length,
      width: def.defaultWidth,
      height: def.defaultHeight,
      config: {},
      isVisible: true,
    };
    setWidgets((prev) => [...prev, newWidget]);
  }, [widgets.length]);

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const updateWidget = useCallback((id: string, updates: Partial<Widget>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
    );
  }, []);

  const moveWidget = useCallback((fromIndex: number, toIndex: number) => {
    setWidgets((prev) => {
      const newWidgets = [...prev];
      const [removed] = newWidgets.splice(fromIndex, 1);
      newWidgets.splice(toIndex, 0, removed);
      // Update positions
      return newWidgets.map((w, i) => ({ ...w, position: i }));
    });
  }, []);

  const saveLayout = useCallback(async () => {
    setIsSaving(true);
    try {
      await fetch("/api/dashboard/widgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId,
          widgets: widgets.map((w) => ({
            id: w.id,
            type: w.type,
            title: w.title,
            position: w.position,
            width: w.width,
            height: w.height,
            config: w.config,
            isVisible: w.isVisible,
          })),
        }),
      });
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  }, [widgets, instanceId]);

  return (
    <WidgetContext.Provider
      value={{
        widgets,
        setWidgets,
        addWidget,
        removeWidget,
        updateWidget,
        moveWidget,
        isEditing,
        setIsEditing,
        saveLayout,
        isSaving,
      }}
    >
      {children}
    </WidgetContext.Provider>
  );
}

export function useWidgets() {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error("useWidgets must be used within a WidgetProvider");
  }
  return context;
}
