import { Bot, Cable, CircleCheck, Code2, LogOut, Rocket, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { innovationPillars, launchPriorities, platformModules, totalInnovationCount } from "../data/innovationBlueprint";
import { AppSettings, AppState, IntegrationKey, IntegrationTestResult } from "../types";

interface DeveloperDashboardProps {
  appState: AppState;
  onUpdateSettings: (settings: AppSettings) => Promise<void>;
  onRunIntegrationTest: (kind: IntegrationKey) => Promise<IntegrationTestResult>;
  onLogout: () => Promise<void>;
  authBusy: boolean;
}

type DeveloperTab = "overview" | "integrations" | "automation" | "roadmap";

export function DeveloperDashboard({ appState, onUpdateSettings, onRunIntegrationTest, onLogout, authBusy }: DeveloperDashboardProps) {
  const [activeTab, setActiveTab] = useState<DeveloperTab>("overview");
  const [settingsDraft, setSettingsDraft] = useState(appState.settings);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<IntegrationKey | null>(null);
  const [results, setResults] = useState<Partial<Record<IntegrationKey, IntegrationTestResult>>>({});

  useEffect(() => setSettingsDraft(appState.settings), [appState.settings]);

  const save = async () => {
    setSaving(true);
    try {
      await onUpdateSettings(settingsDraft);
    } finally {
      setSaving(false);
    }
  };

  const test = async (kind: IntegrationKey) => {
    setTesting(kind);
    try {
      const result = await onRunIntegrationTest(kind);
      setResults((current) => ({ ...current, [kind]: result }));
    } finally {
      setTesting(null);
    }
  };

  const tabs: Array<{ id: DeveloperTab; label: string; icon: typeof Code2 }> = [
    { id: "overview", label: "Release control", icon: Code2 },
    { id: "integrations", label: "Integrations", icon: Cable },
    { id: "automation", label: "AI & automation", icon: Bot },
    { id: "roadmap", label: "Roadmap", icon: Rocket },
  ];

  return (
    <div className="owner-workspace developer-workspace">
      <aside className="owner-sidebar">
        <div className="owner-sidebar__identity">
          <span className="owner-sidebar__mark">DC</span>
          <div><strong>Developer Console</strong><small>Technical access only</small></div>
        </div>
        <nav aria-label="Developer dashboard sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return <button key={tab.id} type="button" className={activeTab === tab.id ? "owner-nav__item is-active" : "owner-nav__item"} onClick={() => setActiveTab(tab.id)}><Icon size={17} />{tab.label}</button>;
          })}
        </nav>
        <div className="owner-sidebar__footer">
          <span><ShieldCheck size={15} /> Separate from Owner data</span>
          <button type="button" className="ghost-button" onClick={() => void onLogout()} disabled={authBusy}><LogOut size={15} /> Log out</button>
        </div>
      </aside>

      <main className="owner-main">
        <header className="owner-main__header">
          <div><p className="eyebrow">Developer workspace</p><h2>Platform control</h2><p>Configure integrations, validate service health, and manage technical rollout without exposing customer or workforce records.</p></div>
        </header>

        {activeTab === "overview" ? <section className="panel developer-panel"><div className="panel__header"><div><p className="eyebrow">Deployment posture</p><h3>Safe, observable technical operations</h3></div><CircleCheck size={20} /></div><dl className="developer-status-list"><div><dt>Public website</dt><dd>Serving independently of dashboard access</dd></div><div><dt>Owner data boundary</dt><dd>Owner CRM, employees, projects, and finance records are not loaded here</dd></div><div><dt>Automation state</dt><dd>{settingsDraft.automationEnabled ? "Enabled after provider validation" : "Basic online mode"}</dd></div><div><dt>Configured provider</dt><dd>{settingsDraft.aiProvider}</dd></div></dl></section> : null}

        {activeTab === "integrations" ? <section className="panel developer-panel"><div className="panel__header"><div><p className="eyebrow">Connection testing</p><h3>Integration health</h3></div></div><div className="assist-grid">{(["ai", "email", "google-sheets"] as IntegrationKey[]).map((kind) => <article key={kind} className="assist-card"><h4>{kind === "ai" ? "AI provider" : kind === "email" ? "Email delivery" : "Google Sheets sync"}</h4><p>Run a safe health check before enabling this connection for live workflows.</p><button className="secondary-button" type="button" disabled={testing !== null} onClick={() => void test(kind)}>{testing === kind ? "Testing…" : "Run health check"}</button>{results[kind] ? <p className={`integration-result integration-result--${results[kind]?.status}`}>{results[kind]?.message}</p> : null}</article>)}</div></section> : null}

        {activeTab === "automation" ? <section className="panel developer-panel"><div className="panel__header"><div><p className="eyebrow">Configuration</p><h3>AI and workflow controls</h3></div></div><div className="form-grid"><label>AI provider<select value={settingsDraft.aiProvider} onChange={(event) => { setSettingsDraft((current) => ({ ...current, aiProvider: event.target.value as AppSettings["aiProvider"], automationEnabled: false })); setResults((current) => ({ ...current, ai: undefined })); }}><option value="heuristic">Basic planning assistant</option><option value="openai-direct">OpenAI direct</option><option value="anthropic-direct">Anthropic direct</option><option value="webhook">Approved webhook</option></select></label><label>Automation pipeline<span className="toggle-row"><input type="checkbox" checked={settingsDraft.automationEnabled} disabled={settingsDraft.aiProvider !== "heuristic" && results.ai?.status !== "success"} onChange={(event) => setSettingsDraft((current) => ({ ...current, automationEnabled: event.target.checked }))} /><span>{settingsDraft.automationEnabled ? "Active" : "Disabled"}</span></span></label><label>AI webhook URL<input value={settingsDraft.aiWebhookUrl} onChange={(event) => setSettingsDraft((current) => ({ ...current, aiWebhookUrl: event.target.value }))} placeholder="https://" /></label><label>Google Apps Script URL<input value={settingsDraft.googleAppsScriptUrl} onChange={(event) => setSettingsDraft((current) => ({ ...current, googleAppsScriptUrl: event.target.value }))} placeholder="https://" /></label><label>Email webhook URL<input value={settingsDraft.emailWebhookUrl} onChange={(event) => setSettingsDraft((current) => ({ ...current, emailWebhookUrl: event.target.value }))} placeholder="https://" /></label><label>OpenAI model<input value={settingsDraft.openAiModel} onChange={(event) => setSettingsDraft((current) => ({ ...current, openAiModel: event.target.value }))} /></label><label>Anthropic model<input value={settingsDraft.anthropicModel} onChange={(event) => setSettingsDraft((current) => ({ ...current, anthropicModel: event.target.value }))} /></label></div><p className="helper-text">Secrets are intentionally not displayed. Configure private keys through the Netlify environment for each production site. A live provider must pass its health check before automation can be enabled.</p><button type="button" className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save technical configuration"}</button></section> : null}

        {activeTab === "roadmap" ? <section className="developer-roadmap"><div className="panel developer-panel"><p className="eyebrow">Product roadmap</p><h3>{totalInnovationCount} planned platform enhancements</h3><p className="helper-text">This implementation roadmap is intentionally visible only to the Developer role.</p></div><div className="roadmap-pillar-list">{innovationPillars.map((pillar) => <article key={pillar.id} className="stack-block"><div className="stack-block__title"><Rocket size={16} />{pillar.name}</div><p className="helper-text">{pillar.count} enhancements · {pillar.phase}</p><p className="helper-text">{pillar.summary}</p></article>)}</div><section className="panel developer-panel"><div className="panel__header"><div><p className="eyebrow">Next technical decisions</p><h3>Launch priorities</h3></div></div><ul className="stack-list stack-list--plain">{launchPriorities.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.outcome}</span><small>{item.whyNow}</small></li>)}</ul><ul className="stack-list stack-list--plain">{platformModules.map((item) => <li key={item.id}><strong>{item.name}</strong><span>{item.stack}</span><small>Next: {item.nextStep}</small></li>)}</ul></section></section> : null}
      </main>
    </div>
  );
}
