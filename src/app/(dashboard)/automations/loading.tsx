import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function AutomationsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <TableSkeleton rows={6} />
    </div>
  );
}
