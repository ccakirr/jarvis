import { AlertTriangle } from "lucide-react";
import { Component, type ReactNode } from "react";

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="insp">
        <div className="inspector-state inspector-state--error">
          <AlertTriangle size={18} />
          <span>Bu panel gösterilirken bir hata oluştu: {this.state.error.message}</span>
        </div>
      </div>
    );
  }
}
