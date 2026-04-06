import { CardSkeleton, ChartSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function AIUsageLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <ChartSkeleton />
      <CardSkeleton />
    </div>
  );
}
