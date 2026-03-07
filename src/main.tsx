import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App.tsx";
import "./index.css";

type ErrorBoundaryState = { error: Error | null };

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    fetch('http://127.0.0.1:7932/ingest/c42627de-8b23-4aa5-8010-342238c3f680',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'da479d'},body:JSON.stringify({sessionId:'da479d',location:'main.tsx:ErrorBoundary',message:'ErrorBoundary caught',data:{message:error.message,name:error.name},timestamp:Date.now(),runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", fontFamily: "system-ui", maxWidth: "480px", margin: "2rem auto" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#666", fontSize: "0.875rem" }}>{this.state.error.message}</p>
          <p style={{ color: "#999", fontSize: "0.75rem", marginTop: "1rem" }}>Open the browser console (F12) for more details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// #region agent log
fetch('http://127.0.0.1:7932/ingest/c42627de-8b23-4aa5-8010-342238c3f680',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'da479d'},body:JSON.stringify({sessionId:'da479d',location:'main.tsx:body',message:'main.tsx body executing',data:{},timestamp:Date.now(),runId:'run1',hypothesisId:'B,D'})}).catch(()=>{});
// #endregion
const rootEl = document.getElementById("root");
// #region agent log
fetch('http://127.0.0.1:7932/ingest/c42627de-8b23-4aa5-8010-342238c3f680',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'da479d'},body:JSON.stringify({sessionId:'da479d',location:'main.tsx:rootEl',message:'Root element check',data:{rootElExists:!!rootEl},timestamp:Date.now(),runId:'run1',hypothesisId:'C'})}).catch(()=>{});
// #endregion
if (!rootEl) {
  document.body.innerHTML = "<h1>Root element #root not found. Check index.html.</h1>";
} else {
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  // #region agent log
  fetch('http://127.0.0.1:7932/ingest/c42627de-8b23-4aa5-8010-342238c3f680',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'da479d'},body:JSON.stringify({sessionId:'da479d',location:'main.tsx:renderDone',message:'root.render called',data:{},timestamp:Date.now(),runId:'run1',hypothesisId:'B,C,D'})}).catch(()=>{});
  // #endregion
}
