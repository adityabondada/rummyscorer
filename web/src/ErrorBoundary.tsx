import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Catches a screen that crashes while rendering, so people see a message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-slate-600">{this.state.error.message}</p>
        <a className="text-emerald-800 underline" href="/">
          Back to your leagues
        </a>
      </main>
    );
  }
}
