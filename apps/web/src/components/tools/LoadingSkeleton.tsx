import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <div className={cn("h-4 animate-pulse rounded bg-muted", className)} />;
}

export function LoadingSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading results">
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <Bar className="w-1/2" />
            <Bar className="w-1/3" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Bar className="w-full" />
        <Bar className="w-5/6" />
        <Bar className="w-2/3" />
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-md border border-border p-3">
              <Bar className="w-2/3" />
              <Bar className="w-1/2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
