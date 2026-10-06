import { Component, lazy, Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import AdminApp from "./app/admin/AdminApp";
import { LoginPage } from "./app/admin/LoginPage";
import { authStore } from "./services/auth";

const OperationsConsole = lazy(() => import("./OperationsConsole"));

export default function App() {
  const [consoleView, setConsoleView] = useState(() => window.location.hash.startsWith("#/console"));
  const authed = useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get);
  useEffect(() => {
    const update = () => setConsoleView(window.location.hash.startsWith("#/console"));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  // Nothing renders behind the login gate — no data, no polling, no console.
  if (!authed) return <AppBoundary><LoginPage/></AppBoundary>;

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