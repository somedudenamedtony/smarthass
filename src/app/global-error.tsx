"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-background p-8">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>{error.message || "An unexpected error occurred."}</p>
            <Button variant="outline" size="sm" onClick={reset}>
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      </body>
    </html>
  );
}
