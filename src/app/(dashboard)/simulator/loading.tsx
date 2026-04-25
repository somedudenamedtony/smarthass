import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="h-4 w-64 bg-muted rounded" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
