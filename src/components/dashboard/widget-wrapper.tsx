"use client";

import { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWidgets, Widget, WIDGET_DEFINITIONS } from "./widget-context";
import {
  GripVertical,
  X,
  Maximize2,
  Minimize2,
  Settings,
} from "lucide-react";

interface WidgetWrapperProps {
  widget: Widget;
  children: ReactNode;
  loading?: boolean;
  error?: string | null;
}

export function WidgetWrapper({
  widget,
  children,
  loading = false,
  error = null,
}: WidgetWrapperProps) {
  const { isEditing, removeWidget, updateWidget } = useWidgets();
  const def = WIDGET_DEFINITIONS[widget.type];

  const canExpand = widget.width < def.maxWidth || widget.height < def.maxHeight;
  const canShrink = widget.width > def.minWidth || widget.height > def.minHeight;

  const handleExpand = () => {
    updateWidget(widget.id, {
      width: Math.min(widget.width + 1, def.maxWidth),
      height: Math.min(widget.height + 1, def.maxHeight),
    });
  };

  const handleShrink = () => {
    updateWidget(widget.id, {
      width: Math.max(widget.width - 1, def.minWidth),
      height: Math.max(widget.height - 1, def.minHeight),
    });
  };

  // Calculate grid span classes
  const widthClass = `col-span-${widget.width}`;
  const heightClass = widget.height > 1 ? `row-span-${widget.height}` : "";

  return (
    <Card
      className={`relative transition-all duration-200 ${widthClass} ${heightClass} ${
        isEditing ? "ring-2 ring-primary/50 ring-dashed" : ""
      }`}
      style={{
        gridColumn: `span ${widget.width}`,
        gridRow: `span ${widget.height}`,
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {isEditing && (
            <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
              <GripVertical className="h-4 w-4" />
            </div>
          )}
          <CardTitle className="text-sm font-medium">
            {widget.title || def.label}
          </CardTitle>
        </div>
        {isEditing && (
          <CardAction>
            <div className="flex items-center gap-1">
              {canShrink && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleShrink}
                  title="Shrink"
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
              )}
              {canExpand && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleExpand}
                  title="Expand"
                >
                  <Maximize2 className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                onClick={() => removeWidget(widget.id)}
                title="Remove"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[100px]">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full min-h-[100px] text-destructive text-sm">
            {error}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

// Grid container for widgets
export function WidgetGrid({ children }: { children: ReactNode }) {
  const { isEditing } = useWidgets();
  
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-min ${
        isEditing ? "min-h-[400px]" : ""
      }`}
    >
      {children}
    </div>
  );
}
