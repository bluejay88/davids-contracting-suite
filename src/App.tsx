import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AdminDashboard } from "./components/AdminDashboard";
import { DeveloperDashboard } from "./components/DeveloperDashboard";
import { ContractorDashboard } from "./components/ContractorDashboard";
import { LandingPage } from "./components/LandingPage";
import { QuoteBuilder } from "./components/QuoteBuilder";
import { CareersPage, ContactPage, FinancingPage, GalleryPage } from "./components/PublicPages";
import { PodcastPage } from "./components/PodcastPage";
import { useFormSecurity } from "./components/FormSecurityChallenge";
import { CookieAccessibilityCenter, SiteAssistant } from "./components/SiteExperience";
import { initialAppState } from "./data/mockData";
import {
  fetchAdminDashboard,
  fetchDeveloperDashboard,
  fetchBootstrap,
  loginUser,
  logoutSession,
  runIntegrationTest,
  saveQuoteRecord,
  updateAdminSettings,
  updateDashboardRecord,
  updateOperationsState,
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

type ViewKey = "landing" | "quote" | "gallery" | "podcast" | "financing" | "careers" | "contact" | "crm" | "field" | "developer";

const initialPublicState: AppState = {
  ...initialAppState,
  crmRecords: [],
  reminders: [],
  historicalJobs: [],
  applicants: [],
  jobOpenings: [],
  projects: [],
  employees: [],
  materials: [],
  aiReviews: [],
};

export default function App() {
  const secureSessionKey = "dc-secure-session-active";
  const { securityPayload: loginSecurityPayload, securityFields: loginSecurityFields } = useFormSecurity("login");
  const [appState, setAppState] = useState<AppState>(initialPublicState);
  const [activeView, setActiveView] = useState<ViewKey>("landing");
  const [sessionRole, setSessionRole] = useState<SessionRole>("public");
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<AuthRole>("staff");
  const [postLoginView, setPostLoginView] = useState<ViewKey>("quote");
  const [loginEmail, setLoginEmail] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [notice, setNotice] = useState("");
  const [bootstrapError, setBootstrapError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [adminEmailHint, setAdminEmailHint] = useState("");
  const [staffEmailHint, setStaffEmailHint] = useState("");
  const loginDialogRef = useRef<HTMLDivElement>(null);
  const loginReturnFocusRef = useRef<HTMLElement | null>(null);

  const hasQuoteSession = sessionRole === "staff" || sessionRole === "admin";
  const hasAdminSession = sessionRole === "admin";
  const hasDeveloperSession = sessionRole === "developer";
  const hasSecureSession = sessionRole !== "public";

  const syncBootstrap = async () => {
    const payload = await fetchBootstrap();
    setAppState(payload.appState);
    setSessionRole(payload.sessionRole);
    setSessionEmail(payload.sessionEmail || "");
    setAdminEmailHint(payload.adminEmailHint);
    setStaffEmailHint(payload.staffEmailHint);
    if (payload.sessionRole === "public") {
      sessionStorage.removeItem(secureSessionKey);
    }
    return payload;
  };

  useEffect(() => {
    const bootstrap = async () => {
      setBootstrapError("");

      try {
        if (sessionStorage.getItem(secureSessionKey) !== "true") {
          await logoutSession().catch(() => undefined);
        }
        await syncBootstrap();
      } catch (error) {
        setBootstrapError(
          error instanceof Error
            ? error.message
            : "Unable to load the application shell from the secure server.",
        );
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

  useEffect(() => {
    if (!showLogin) return;
    loginReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = loginDialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]');
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowLogin(false);
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      loginReturnFocusRef.current?.focus();
    };
  }, [showLogin]);

  useEffect(() => {
    if (localStorage.getItem("dc-cookie-consent") !== "analytics") return;
    const startedAt = Date.now();
    const anonymousSessionId = sessionStorage.getItem("dc_analytics_session") || crypto.randomUUID();
    sessionStorage.setItem("dc_analytics_session", anonymousSessionId);
    void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymousSessionId, eventType: "page_view", page: activeView }) }).catch(() => undefined);
    return () => { void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymousSessionId, eventType: "page_leave", page: activeView, durationSeconds: Math.round((Date.now()-startedAt)/1000) }) }).catch(() => undefined); };
  }, [activeView]);

  const openSecureAccess = (mode: AuthRole, nextView: ViewKey) => {
    setLoginMode(mode);
    setPostLoginView(nextView);
    setLoginEmail(mode === "admin" ? adminEmailHint : mode === "developer" ? "" : staffEmailHint);
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

  const openDeveloper = async () => {
    if (!hasDeveloperSession) {
      openSecureAccess("developer", "developer");
      return;
    }
    setAuthBusy(true);
    try {
      const payload = await fetchDeveloperDashboard();
      setAppState(payload.appState);
      setActiveView("developer");
    } catch (error) {
      setSessionRole("public");
      setActiveView("landing");
      setShowLogin(true);
      setLoginMode("developer");
      setPostLoginView("developer");
      setLoginError(error instanceof Error ? `${error.message} Please log in again.` : "Your developer session expired. Please log in again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setLoginError("");

    try {
      const payload = await loginUser(loginMode, loginEmail, loginPassword, loginSecurityPayload);
      setAppState(payload.appState);
      setSessionRole(payload.sessionRole);
      setSessionEmail(payload.sessionEmail || loginEmail.trim().toLowerCase());
      sessionStorage.setItem(secureSessionKey, "true");
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
            : loginMode === "developer"
              ? "Credentials did not match the developer profile configured on the server."
            : "Credentials did not match the contractor / estimator profile saved on the server.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);
    sessionStorage.removeItem(secureSessionKey);
    setSessionRole("public");
    setAppState(initialPublicState);
    setActiveView("landing");
    setShowLogin(false);
    setLoginPassword("");

    try {
      await logoutSession();
      await syncBootstrap();
      setNotice("Secure session closed.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Session logout finished, but the shell could not refresh.",
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveRecord = async (record: CrmRecord, quote: QuoteResult, security: Record<string, unknown> = {}) => {
    try {
      const payload = await saveQuoteRecord(record, quote, security);
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

  const handleOperationsUpdate = async (patch: Parameters<typeof updateOperationsState>[0]) => {
    try {
      const payload = await updateOperationsState(patch);
      setAppState(payload.appState);
      setNotice(payload.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operations update failed.");
      throw error;
    }
  };

  const navItems = useMemo(
    () => [
      { key: "landing" as const, label: "Home" },
      { key: "gallery" as const, label: "Gallery" },
      { key: "podcast" as const, label: "Foundation First — Podcast" },
      { key: "quote" as const, label: "Estimate" },
      { key: "financing" as const, label: "Financing" },
      { key: "careers" as const, label: "Careers" },
      { key: "contact" as const, label: "Contact" },
    ],
    [],
  );

  return (
    <div className={`app-shell ${window.location.hostname.includes("executive") ? "edition-executive" : window.location.hostname.includes("original-5") ? "edition-original-five" : "edition-standard"}`}>
      <header className="topbar">
        <div className="topbar__brand">
          <span className="logo-frame logo-frame--header">
            <img src="/davids-contracting-logo-2026.webp" alt="David's Contracting logo" className="topbar__logo" />
          </span>
          <div>
            <p className="eyebrow">Built on purpose. Backed by pride.</p>
            <h1>David&apos;s Contracting</h1>
          </div>
        </div>

        <nav className="topbar__nav" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={activeView === item.key ? "nav-chip nav-chip--active" : "nav-chip"}
              onClick={() => {
                if (item.key === "quote") {
                  openQuote();
                  return;
                }

                setActiveView(item.key);
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
          {hasSecureSession ? (
            <span className="topbar__session">
              {hasAdminSession ? "Owner Session" : hasDeveloperSession ? "Developer Session" : "Estimator Session"}
            </span>
          ) : null}
          {hasSecureSession ? (
            <button
              className="ghost-button topbar__dashboard"
              onClick={() => {
                if (hasAdminSession) {
                  void openAdmin();
                } else if (hasDeveloperSession) {
                  void openDeveloper();
                } else {
                  setActiveView("field");
                }
              }}
              disabled={authBusy}
            >
              Dashboard
            </button>
          ) : null}
          {hasSecureSession ? (
            <button className="ghost-button topbar__logout" onClick={() => void handleLogout()} disabled={authBusy}>
              {authBusy ? "Signing Out..." : "Log Out"}
            </button>
          ) : (
            <button className="ghost-button topbar__login" onClick={() => openSecureAccess("staff", "field")}>
              Log In
            </button>
          )}
          <button className="ghost-button topbar__estimate" onClick={openQuote}>
            Start Estimate
          </button>
        </div>
      </header>

      {bootstrapError ? <div className="notice-banner notice-banner--warning">Public site available. Secure login is temporarily unavailable.</div> : null}
      {notice ? <div className="notice-banner">{notice}</div> : null}

      <main>
        {activeView === "landing" ? (
          <LandingPage
            repProfile={appState.settings.repProfile}
            onOpenQuote={openQuote}
            onNavigate={setActiveView}
            onLogin={() => openSecureAccess("staff", "field")}
          />
        ) : null}

        {activeView === "gallery" ? <GalleryPage /> : null}
        {activeView === "podcast" ? <PodcastPage episodes={appState.podcastEpisodes} events={appState.podcastEvents} onNavigate={setActiveView} /> : null}
        {activeView === "financing" ? <FinancingPage onOpenQuote={openQuote} /> : null}
        {activeView === "careers" ? <CareersPage /> : null}
        {activeView === "contact" ? <ContactPage repProfile={appState.settings.repProfile} /> : null}

        {activeView === "quote" ? (
          <QuoteBuilder
            settings={appState.settings}
            historicalJobs={appState.historicalJobs}
            sessionRole={sessionRole}
            onSaveRecord={handleSaveRecord}
            onOpenAdmin={() => void openAdmin()}
          />
        ) : null}

        {activeView === "field" ? (
          sessionRole === "staff" ? <ContractorDashboard appState={appState} email={sessionEmail} onOpenEstimate={openQuote} onUpdateState={setAppState} /> : <section className="locked-state"><p className="eyebrow">Contractor Login Required</p><h2>This workspace is available only to an assigned Contractor or Estimator.</h2><button className="primary-button" onClick={() => openSecureAccess("staff", "field")}>Open team login</button></section>
        ) : null}

        {activeView === "crm" ? (
          hasAdminSession ? (
            <AdminDashboard
              appState={appState}
              onUpdateOperations={handleOperationsUpdate}
              onUpdateSettings={handleSettingsUpdate}
              onUpdateRecord={handleRecordUpdate}
              onRunIntegrationTest={handleIntegrationTest}
              onLogout={handleLogout}
              authBusy={authBusy}
            />
          ) : (
            <section className="locked-state">
              <p className="eyebrow">Owner Login Required</p>
              <h2>Owner access protects leads, applicants, projects, payments, and reports.</h2>
              <p>Use the private Owner credentials configured on the secure server.</p>
              <button className="primary-button" onClick={() => openSecureAccess("admin", "crm")}>
                Open Admin Login
              </button>
            </section>
          )
        ) : null}

        {activeView === "developer" ? (
          hasDeveloperSession ? (
            <DeveloperDashboard appState={appState} onUpdateSettings={handleSettingsUpdate} onRunIntegrationTest={handleIntegrationTest} onLogout={handleLogout} authBusy={authBusy} />
          ) : (
            <section className="locked-state"><p className="eyebrow">Developer Login Required</p><h2>Developer access protects technical configuration and release planning.</h2><button className="primary-button" onClick={() => void openDeveloper()}>Open Developer Login</button></section>
          )
        ) : null}
      </main>

      {activeView !== "landing" && activeView !== "crm" && activeView !== "developer" ? (
        <footer className="site-footer" aria-label="Site footer">
          <div><strong>David&apos;s Contracting</strong><span>Built Right. Built to Last.</span></div>
          <nav aria-label="Footer navigation">
            <button onClick={() => setActiveView("landing")}>Home</button>
            <button onClick={() => setActiveView("gallery")}>Gallery</button>
            <button onClick={() => setActiveView("careers")}>Careers</button>
            <button onClick={() => setActiveView("contact")}>Contact</button>
          </nav>
          {hasSecureSession ? (
            <button className="site-footer__login" onClick={() => void handleLogout()} disabled={authBusy}>Log Out</button>
          ) : (
            <button className="site-footer__login" onClick={() => openSecureAccess("staff", "quote")}>Team &amp; Owner Login</button>
          )}
        </footer>
      ) : null}

      {showLogin ? (
        <div className="modal-scrim" role="presentation" onClick={() => setShowLogin(false)}>
          <div ref={loginDialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="secure-login-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <p className="eyebrow">Secure Workspace Access</p>
                <h2 id="secure-login-title">Log in to your authorized dashboard</h2>
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
                    setPostLoginView(nextMode === "admin" ? "crm" : nextMode === "developer" ? "developer" : "quote");
                    setLoginEmail(nextMode === "admin" ? adminEmailHint : nextMode === "developer" ? "" : staffEmailHint);
                    setLoginError("");
                  }}
                >
                  <option value="admin">Business Owner</option>
                  <option value="staff">Contractor / Estimator</option>
                  <option value="developer">Developer</option>
                </select>
              </label>
              <label>
                {loginMode === "admin" ? "Owner username" : loginMode === "developer" ? "Developer username" : "Contractor / estimator email"}
                <input
                  type={loginMode === "staff" ? "email" : "text"}
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder={loginMode === "admin" ? "Enter owner username" : loginMode === "developer" ? "Enter developer username" : "Enter contractor email"}
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
                  ? "Owner access unlocks applicants, customer leads, projects, payments, and company reports."
                  : loginMode === "developer"
                    ? "Developer access unlocks technical integrations, AI automation controls, and the implementation roadmap."
                  : "Contractor access unlocks the secure quote builder, AI scope tools, and quote email / save flows."}
              </p>
              {loginSecurityFields}
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
      <SiteAssistant navigate={(destination) => setActiveView(destination)} />
      <CookieAccessibilityCenter />
    </div>
  );
}
