import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminDashboard } from "./components/AdminDashboard";
import { LandingPage } from "./components/LandingPage";
import { QuoteBuilder } from "./components/QuoteBuilder";
import { initialAppState } from "./data/mockData";
import {
  fetchAdminDashboard,
  fetchBootstrap,
  loginUser,
  logoutSession,
  runIntegrationTest,
  saveQuoteRecord,
  updateAdminSettings,
  updateDashboardRecord,
} from "./lib/api";
import {
  AppSettings,
  AppState,
  AuthRole,
  CrmRecord,
  IntegrationKey,
  QuoteResult,
  SessionRole,
} from "./types";

type ViewKey = "landing" | "quote" | "crm";

const initialPublicState: AppState = {
  ...initialAppState,
  crmRecords: [],
  reminders: [],
  historicalJobs: [],
};

export default function App() {
  const [appState, setAppState] = useState<AppState>(initialPublicState);
  const [activeView, setActiveView] = useState<ViewKey>("landing");
  const [sessionRole, setSessionRole] = useState<SessionRole>("public");
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<AuthRole>("staff");
  const [postLoginView, setPostLoginView] = useState<ViewKey>("quote");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [adminEmailHint, setAdminEmailHint] = useState("owner@davidscontracting.local");
  const [staffEmailHint, setStaffEmailHint] = useState("estimator@davidscontracting.local");

  const hasQuoteSession = sessionRole === "staff" || sessionRole === "admin";
  const hasAdminSession = sessionRole === "admin";

  const syncBootstrap = async () => {
    const payload = await fetchBootstrap();
    setAppState(payload.appState);
    setSessionRole(payload.sessionRole);
    setAdminEmailHint(payload.adminEmailHint);
    setStaffEmailHint(payload.staffEmailHint);
    setLoginEmail(payload.sessionRole === "admin" ? payload.adminEmailHint : payload.staffEmailHint);
    return payload;
  };

  useEffect(() => {
    const bootstrap = async () => {
      setIsBootstrapping(true);
      setBootstrapError("");

      try {
        await syncBootstrap();
      } catch (error) {
        setBootstrapError(
          error instanceof Error
            ? error.message
            : "Unable to load the application shell from the secure server.",
        );
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const openSecureAccess = (mode: AuthRole, nextView: ViewKey) => {
    setLoginMode(mode);
    setPostLoginView(nextView);
    setLoginEmail(mode === "admin" ? adminEmailHint : staffEmailHint);
    setLoginPassword("");
    setLoginError("");
    setShowLogin(true);
  };

  const openQuote = () => {
    setActiveView("quote");
  };

  const openAdmin = async () => {
    if (!hasAdminSession) {
      openSecureAccess("admin", "crm");
      return;
    }

    setAuthBusy(true);

    try {
      const payload = await fetchAdminDashboard();
      setAppState(payload.appState);
      setActiveView("crm");
    } catch (error) {
      setSessionRole("public");
      setActiveView("landing");
      setShowLogin(true);
      setLoginMode("admin");
      setPostLoginView("crm");
      setLoginEmail(adminEmailHint);
      setLoginError(
        error instanceof Error
          ? `${error.message} Please log in again.`
          : "Your admin session expired. Please log in again.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setLoginError("");

    try {
      const payload = await loginUser(loginMode, loginEmail, loginPassword);
      setAppState(payload.appState);
      setSessionRole(payload.sessionRole);
      setShowLogin(false);
      setActiveView(postLoginView);
      setLoginPassword("");
      setNotice(payload.message);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : loginMode === "admin"
            ? "Credentials did not match the admin profile saved on the server."
            : "Credentials did not match the contractor / estimator profile saved on the server.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);

    try {
      await logoutSession();
      await syncBootstrap();
      setSessionRole("public");
      setActiveView("landing");
      setLoginPassword("");
      setNotice("Secure session closed.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Session logout finished, but the shell could not refresh.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveRecord = async (record: CrmRecord, quote: QuoteResult) => {
    try {
      const payload = await saveQuoteRecord(record, quote);
      setAppState(payload.appState);
      setNotice(payload.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quote save failed.";
      setNotice(message);
      throw error;
    }
  };

  const handleSettingsUpdate = async (settings: AppSettings) => {
    try {
      const payload = await updateAdminSettings(settings);
      setAppState(payload.appState);
      setNotice(payload.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Settings update failed.");
    }
  };

  const handleRecordUpdate = async (recordId: string, patch: Partial<CrmRecord>) => {
    try {
      const payload = await updateDashboardRecord(recordId, patch);
      setAppState(payload.appState);
      setNotice(payload.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "CRM record update failed.");
    }
  };

  const handleIntegrationTest = async (kind: IntegrationKey) => {
    const result = await runIntegrationTest(kind);
    setNotice(result.message);
    return result;
  };

  const navItems = useMemo(
    () => [
      { key: "landing" as const, label: "Brand Site" },
      { key: "quote" as const, label: "Estimate Builder" },
      { key: "crm" as const, label: "Admin CRM" },
    ],
    [],
  );

  if (isBootstrapping) {
    return (
      <div className="app-shell">
        <main>
          <section className="locked-state">
            <p className="eyebrow">Secure Workspace Loading</p>
            <h2>Bringing the quote engine, CRM, and AI services online.</h2>
            <p>The app is loading its server-backed workspace so client data and admin settings stay protected.</p>
          </section>
        </main>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="app-shell">
        <main>
          <section className="locked-state">
            <p className="eyebrow">Connection Issue</p>
            <h2>The secure API is not responding yet.</h2>
            <p>{bootstrapError}</p>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Retry App Load
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <img src="/davids-contracting-logo.png" alt="David's Contracting logo" className="topbar__logo" />
          <div>
            <p className="eyebrow">Built on purpose. Backed by pride.</p>
            <h1>David&apos;s Contracting Suite</h1>
          </div>
        </div>

        <nav className="topbar__nav" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={activeView === item.key ? "nav-chip nav-chip--active" : "nav-chip"}
              onClick={() => {
                if (item.key === "crm") {
                  void openAdmin();
                  return;
                }

                if (item.key === "quote") {
                  openQuote();
                  return;
                }

                setActiveView("landing");
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="topbar__actions">
          <a className="topbar__phone" href={`tel:${appState.settings.repProfile.phone.replace(/[^0-9]/g, "")}`}>
            {appState.settings.repProfile.phone}
          </a>
          {hasQuoteSession ? (
            <span className="topbar__session">
              {hasAdminSession ? "Admin Session" : "Estimator Session"}
            </span>
          ) : null}
          {hasQuoteSession ? (
            <button className="ghost-button" onClick={() => void handleLogout()} disabled={authBusy}>
              {authBusy ? "Signing Out..." : "Log Out"}
            </button>
          ) : (
            <button className="ghost-button" onClick={() => openSecureAccess("staff", "quote")}>
              Contractor Login
            </button>
          )}
          <button className="ghost-button" onClick={openQuote}>
            Start Estimate
          </button>
        </div>
      </header>

      {notice ? <div className="notice-banner">{notice}</div> : null}

      <main>
        {activeView === "landing" ? (
          <LandingPage
            repProfile={appState.settings.repProfile}
            onOpenQuote={openQuote}
            onOpenAdmin={() => void openAdmin()}
          />
        ) : null}

        {activeView === "quote" ? (
          <QuoteBuilder
            settings={appState.settings}
            historicalJobs={appState.historicalJobs}
            sessionRole={sessionRole}
            onSaveRecord={handleSaveRecord}
            onOpenAdmin={() => void openAdmin()}
          />
        ) : null}

        {activeView === "crm" ? (
          hasAdminSession ? (
            <AdminDashboard
              appState={appState}
              onUpdateSettings={handleSettingsUpdate}
              onUpdateRecord={handleRecordUpdate}
              onRunIntegrationTest={handleIntegrationTest}
            />
          ) : (
            <section className="locked-state">
              <p className="eyebrow">Admin Login Required</p>
              <h2>Owner access protects CRM, payroll, materials, and documentation.</h2>
              <p>
                Use the admin credentials stored on the secure server. The starter admin login email is{" "}
                <strong>{adminEmailHint}</strong>.
              </p>
              <button className="primary-button" onClick={() => openSecureAccess("admin", "crm")}>
                Open Admin Login
              </button>
            </section>
          )
        ) : null}
      </main>

      {showLogin ? (
        <div className="modal-scrim" role="presentation" onClick={() => setShowLogin(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <p className="eyebrow">
                  {loginMode === "admin" ? "Admin Secure Access" : "Contractor Secure Access"}
                </p>
                <h2>
                  {loginMode === "admin"
                    ? "Log in to the CRM dashboard"
                    : "Unlock the estimator workspace"}
                </h2>
              </div>
              <button className="icon-button" onClick={() => setShowLogin(false)} aria-label="Close login">
                &times;
              </button>
            </div>

            <form className="modal-card__form" onSubmit={(event) => void handleLogin(event)}>
              <label>
                Access Type
                <select
                  value={loginMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as AuthRole;
                    setLoginMode(nextMode);
                    setLoginEmail(nextMode === "admin" ? adminEmailHint : staffEmailHint);
                    setLoginError("");
                  }}
                >
                  <option value="staff">Contractor / Estimator</option>
                  <option value="admin">Admin Owner</option>
                </select>
              </label>
              <label>
                {loginMode === "admin" ? "Admin email" : "Contractor / estimator email"}
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder={loginMode === "admin" ? adminEmailHint : staffEmailHint}
                  autoComplete="username"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </label>
              <p className="helper-text">
                {loginMode === "admin"
                  ? "Admin access unlocks the CRM dashboard, settings, payroll view, and live integration testing."
                  : "Contractor access unlocks the secure quote builder, AI scope tools, and quote email / save flows."}
              </p>
              {loginError ? <p className="error-text">{loginError}</p> : null}
              <div className="modal-card__actions">
                <button type="button" className="ghost-button" onClick={() => setShowLogin(false)} disabled={authBusy}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={authBusy}>
                  {authBusy ? "Logging In..." : "Log In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
