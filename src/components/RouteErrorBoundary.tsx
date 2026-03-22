import React from "react";

interface Props {
  children: React.ReactNode;
  route: string;
}

interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
          <p className="text-destructive font-medium">Failed to load {this.props.route}</p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <button
            className="text-sm underline"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
