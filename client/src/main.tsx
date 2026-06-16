import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import App from "./App";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ background: "#0a0a0a", color: "#f87171", fontFamily: "monospace", padding: "2rem", minHeight: "100vh" }}>
          <p style={{ fontWeight: 900, fontSize: "1.1rem", marginBottom: "0.5rem" }}>FoodFinder crashed — render error</p>
          <p style={{ marginBottom: "1rem", color: "#fca5a5" }}>{error.message}</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", color: "#6b7280" }}>{error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Catch effect/async errors that React's boundary misses and show them on screen
window.addEventListener("error", (e) => {
  const div = document.getElementById("ff-error-overlay");
  if (div) {
    div.textContent = `Uncaught: ${e.message}\n${e.error?.stack ?? ""}`;
    (div as HTMLElement).style.display = "block";
  }
});

window.addEventListener("unhandledrejection", (e) => {
  const div = document.getElementById("ff-error-overlay");
  if (div) {
    const msg = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack}` : String(e.reason);
    div.textContent = `Unhandled rejection: ${msg}`;
    (div as HTMLElement).style.display = "block";
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("FoodFinder service worker registration failed", error);
    });
  });
}
