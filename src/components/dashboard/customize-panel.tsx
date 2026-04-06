"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { WIDGET_LABELS } from "@/app/(dashboard)/dashboard/page";

interface DashboardPreferences {
  widgetOrder?: string[];
  hiddenWidgets?: string[];
  pinnedEntityIds?: string[];
}

const ALL_WIDGETS = [
  "instance-health",
  "key-metrics",
  "charts",
  "recent-activity",
];

interface CustomizePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: DashboardPreferences;
  onSave: (prefs: DashboardPreferences) => void;
}

export function CustomizePanel({
  open,
  onOpenChange,
  preferences,
  onSave,
}: CustomizePanelProps) {
  const [order, setOrder] = useState<string[]>(
    preferences.widgetOrder ?? ALL_WIDGETS
  );
  const [hidden, setHidden] = useState<Set<string>>(
    new Set(preferences.hiddenWidgets ?? [])
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  function toggleVisibility(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSave() {
    onSave({
      ...preferences,
      widgetOrder: order,
      hiddenWidgets: Array.from(hidden),
    });
    onOpenChange(false);
  }

  function handleReset() {
    setOrder(ALL_WIDGETS);
    setHidden(new Set());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Dashboard</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Drag to reorder. Click the eye icon to show/hide widgets.
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {order.map((id) => (
                <SortableWidget
                  key={id}
                  id={id}
                  isHidden={hidden.has(id)}
                  onToggle={() => toggleVisibility(id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to default
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortableWidget({
  id,
  isHidden,
  onToggle,
}: {
  id: string;
  isHidden: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
        isHidden ? "opacity-50 bg-muted/30" : "bg-card"
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium">
        {WIDGET_LABELS[id] ?? id}
      </span>
      <button
        onClick={onToggle}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {isHidden ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
