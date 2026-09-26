import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import AdminApp from "./app/admin/AdminApp";

const OperationsConsole = lazy(() => import("./OperationsConsole"));

export default function App() {
  const [consoleView, setConsoleView] = useState(() => window.location.hash.startsWith("#/console"));
  useEffect(() => {
    const update = () => setConsoleView(window.location.hash.startsWith("#/console"));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return <AppBoundary>{consoleView ? <Suspense fallback={<div className="app-loading">Loading client console...</div>}><OperationsConsole/><a href="#/admin/dashboard" className="back-to-admin">Back to admin<span>Original Human / Agent preview</span></a></Suspense> : <AdminApp/>}</AppBoundary>;
}

class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="app-error"><h1>The console could not render.</h1><p>Your local data has not been reset. Reload the page to reconnect the interface.</p><button onClick={() => window.location.reload()}>Reload console</button></div>;
    return this.props.children;
  }
}