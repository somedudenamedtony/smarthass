import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function EntitiesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="flex gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}
