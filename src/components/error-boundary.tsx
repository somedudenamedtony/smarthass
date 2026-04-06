"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export function ErrorBoundary({ children }: Props) {
  const [state, setState] = useState<State>({ hasError: false, error: null });

  useEffect(() => {
    function handleError(event: ErrorEvent) {
      event.preventDefault();
      setState({ hasError: true, error: event.error });
    }

    function handleRejection(event: PromiseRejectionEvent) {
      event.preventDefault();
      setState({
        hasError: true,
        error:
          event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason)),
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  if (state.hasError) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-8">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            <p>{state.error?.message ?? "An unexpected error occurred."}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState({ hasError: false, error: null })}
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
