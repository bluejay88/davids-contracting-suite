import {
  BellRing,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  HardHat,
  Images,
  Podcast,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  innovationPillars,
  launchPriorities,
  platformModules,
  totalInnovationCount,
} from "../data/innovationBlueprint";
import {
  AppSettings,
  AppState,
  CrmRecord,
  IntegrationKey,
  IntegrationTestResult,
} from "../types";
import { formatCurrency } from "../lib/estimates";
import { OperationsStatePatch } from "../lib/api";
import { OperationsHub } from "./OperationsHub";
import { GalleryManager } from "./GalleryManager";
import { PodcastManager } from "./PodcastManager";
import { examplePodcastEpisodes, examplePodcastEvents } from "./PodcastPage";
import { RevenueIntelligence } from "./RevenueIntelligence";
import { EmployeeManager } from "./EmployeeManager";

interface AdminDashboardProps {
  appState: AppState;
  onUpdateSettings: (settings: AppSettings) => Promise<void>;
  onUpdateRecord: (recordId: string, patch: Partial<CrmRecord>) => Promise<void>;
  onRunIntegrationTest: (kind: IntegrationKey) => Promise<IntegrationTestResult>;
  onUpdateOperations: (patch: OperationsStatePatch) => Promise<void>;
  onLogout: () => Promise<void>;
  authBusy: boolean;
}

const crewMetrics = [
  { name: "David Carter", role: "Estimator / Owner", scheduledHours: 32, payrollProjection: 2400 },
  { name: "Marcus Lewis", role: "Crew Lead", scheduledHours: 28, payrollProjection: 1120 },
  { name: "Jalen Price", role: "Painter / Flooring Tech", scheduledHours: 26, payrollProjection: 845 },
];

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const getConsultationIssue = (record: CrmRecord, settings: AppSettings) => {
  if (!record.client.consultationRequested || !record.client.consultationDate) {
    return "";
  }

  if (settings.consultationBlackoutDates.includes(record.client.consultationDate)) {
    return "Scheduled on a blackout date.";
  }

  const weekday = weekdayNames[new Date(`${record.client.consultationDate}T12:00:00`).getDay()];
  const slot = settings.availabilitySchedule.find((item) => item.day === weekday);
  if (!slot?.enabled) {
    return `${weekday} is not marked available.`;
  }

  if (
    record.client.consultationTime &&
    (record.client.consultationTime < slot.start || record.client.consultationTime > slot.end)
  ) {
    return `Time falls outside the published ${slot.start}-${slot.end} window.`;
  }

  return "";
};

export function AdminDashboard({
  appState,
  onUpdateSettings,
  onUpdateRecord,
  onRunIntegrationTest,
  onUpdateOperations,
  onLogout,
  authBusy,
}: AdminDashboardProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [settingsDraft, setSettingsDraft] = useState(appState.settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [updatingRecordId, setUpdatingRecordId] = useState<string | null>(null);
  const [testingIntegration, setTestingIntegration] = useState<IntegrationKey | null>(null);
  const [integrationResults, setIntegrationResults] = useState<Partial<Record<IntegrationKey, IntegrationTestResult>>>({});
  const [activeTab, setActiveTab] = useState<"overview" | "operations" | "employees" | "gallery" | "podcast" | "crm" | "schedule" | "insights" | "notifications" | "team" | "settings">("overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const ownerTabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "operations", label: "Projects & Operations", icon: FolderKanban },
    { id: "employees", label: "Employees & Pay", icon: HardHat },
    { id: "gallery", label: "Gallery Uploads", icon: Images },
    { id: "podcast", label: "Foundation First", icon: Podcast },
    { id: "crm", label: "Customers & CRM", icon: BriefcaseBusiness },
    { id: "schedule", label: "Schedule", icon: ClipboardCheck },
    { id: "insights", label: "Reports & Insights", icon: LineChart },
    { id: "notifications", label: "Notifications", icon: BellRing },
    { id: "team", label: "Team & Resources", icon: Users },
    { id: "settings", label: "Developer Console", icon: Settings },
  ] as const;

  const selectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setMobileNavigationOpen(false);
  };

  useEffect(() => {
    setSettingsDraft(appState.settings);
  }, [appState.settings]);

  const crmRecords = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) {
      return appState.crmRecords;
    }

    return appState.crmRecords.filter((record) =>
      `${record.client.firstName} ${record.client.lastName} ${record.client.address} ${record.client.requestedJobs}`
        .toLowerCase()
        .includes(query),
    );
  }, [appState.crmRecords, deferredSearch]);

  const consultationRequests = useMemo(
    () =>
      appState.crmRecords
        .filter((record) => record.client.consultationRequested)
        .sort((left, right) =>
          `${left.client.consultationDate} ${left.client.consultationTime}`.localeCompare(
            `${right.client.consultationDate} ${right.client.consultationTime}`,
          ),
        ),
    [appState.crmRecords],
  );
  const consultationKpis = useMemo(
    () => ({
      requested: consultationRequests.filter((record) => record.client.consultationStatus === "Requested").length,
      confirmed: consultationRequests.filter((record) => record.client.consultationStatus === "Confirmed").length,
      conflicts: consultationRequests.filter((record) => getConsultationIssue(record, settingsDraft)).length,
    }),
    [consultationRequests, settingsDraft],
  );

  const statusBreakdown = useMemo(() => {
    const summary = [
      { name: "Prospecting", value: 0, color: "#d6b264" },
      { name: "In Progress", value: 0, color: "#a6a05f" },
      { name: "Completed", value: 0, color: "#4f8a66" },
      { name: "Declined", value: 0, color: "#7a4a4a" },
    ];

    appState.crmRecords.forEach((record) => {
      if (record.client.jobStatus === "Prospecting/Negotiating") summary[0].value += 1;
      if (record.client.jobStatus === "In-Progress") summary[1].value += 1;
      if (record.client.jobStatus === "Completed") summary[2].value += 1;
      if (record.client.jobStatus === "Declined") summary[3].value += 1;
    });

    return summary;
  }, [appState.crmRecords]);

  const revenueSeries = useMemo(
    () =>
      appState.crmRecords.map((record) => ({
        client: record.client.lastName,
        quoted: record.quoteHistory[0]?.totals.totalHigh ?? record.client.budget,
        collected: record.client.paymentAmount,
      })),
    [appState.crmRecords],
  );

  const kpis = useMemo(() => {
    const totalRecords = appState.crmRecords.length;
    const prospects = appState.crmRecords.filter((record) => record.client.jobStatus === "Prospecting/Negotiating").length;
    const activeJobs = appState.crmRecords.filter((record) => record.client.jobStatus === "In-Progress").length;
    const completed = appState.crmRecords.filter((record) => record.client.jobStatus === "Completed").length;
    const collected = appState.crmRecords.reduce((sum, record) => sum + record.client.paymentAmount, 0);
    const receivables = appState.crmRecords.reduce((sum, record) => sum + record.paymentDue, 0);
    const projected = appState.crmRecords.reduce(
      (sum, record) => sum + (record.quoteHistory[0]?.totals.totalHigh ?? record.client.budget),
      0,
    );

    return {
      totalRecords,
      prospects,
      activeJobs,
      completed,
      collected,
      receivables,
      projected,
      closeRate: totalRecords ? Math.round((completed / totalRecords) * 100) : 0,
    };
  }, [appState.crmRecords]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await onUpdateSettings(settingsDraft);
    } finally {
      setSavingSettings(false);
    }
  };

  const runIntegrationCheck = async (kind: IntegrationKey) => {
    setTestingIntegration(kind);
    try {
      const result = await onRunIntegrationTest(kind);
      setIntegrationResults((current) => ({
        ...current,
        [kind]: result,
      }));
    } finally {
      setTestingIntegration(null);
    }
  };

  return (
    <div className="owner-workspace">
      <button
        type="button"
        className="owner-workspace__mobile-toggle"
        onClick={() => setMobileNavigationOpen((open) => !open)}
        aria-expanded={mobileNavigationOpen}
        aria-controls="owner-navigation"
      >
        {mobileNavigationOpen ? <X size={20} /> : <Menu size={20} />}
        <span>{ownerTabs.find((tab) => tab.id === activeTab)?.label}</span>
      </button>
      <aside id="owner-navigation" className={`owner-sidebar${mobileNavigationOpen ? " is-open" : ""}`}>
        <div className="owner-sidebar__identity">
          <span className="owner-sidebar__mark">DC</span>
          <div><strong>Owner Workspace</strong><small>David's Contracting</small></div>
        </div>
        <nav aria-label="Owner dashboard sections">
          {ownerTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                type="button"
                key={tab.id}
                className={activeTab === tab.id ? "is-active" : ""}
                onClick={() => selectTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                <Icon size={18} /><span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="owner-sidebar__footer">
          <div className="owner-sidebar__status"><span /> System operational</div>
          <button type="button" className="owner-sidebar__logout" onClick={() => void onLogout()} disabled={authBusy}>
            <LogOut size={18} /><span>{authBusy ? "Signing out..." : "Log out"}</span>
          </button>
        </div>
      </aside>
      {mobileNavigationOpen ? <button className="owner-sidebar__scrim" aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)} /> : null}
      <main className="dashboard owner-workspace__content">
      {activeTab === "operations" ? <OperationsHub appState={appState} onUpdate={onUpdateOperations} /> : null}
      {activeTab === "employees" ? <EmployeeManager employees={appState.employees} projects={appState.projects} onSave={onUpdateOperations} /> : null}
      {activeTab === "gallery" ? <GalleryManager projects={appState.galleryProjects} onSave={(galleryProjects) => onUpdateOperations({ galleryProjects })} /> : null}
      {activeTab === "podcast" ? <PodcastManager episodes={appState.podcastEpisodes.length ? appState.podcastEpisodes : examplePodcastEpisodes} events={appState.podcastEvents.length ? appState.podcastEvents : examplePodcastEvents} onSave={onUpdateOperations} /> : null}
      {activeTab === "insights" ? <RevenueIntelligence appState={appState} /> : null}
      {activeTab === "notifications" ? <section className="operations-hub"><div className="operations-hub__header"><div><p className="eyebrow">Owner-only review queue</p><h2>Notifications</h2><p>Recent field documentation and system review items. Private Owner notes never appear in field workspaces.</p></div><BellRing size={24} /></div><div className="operations-list">{(appState.ownerNotifications || []).slice(0, 25).map((item) => { const project = appState.projects.find((entry) => entry.id === item.projectId); return <article key={item.id}><div><strong>{item.title}</strong><span>{project?.name || "Project"} · {item.severity}</span><small>{item.detail}</small></div><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></article>; })}{!(appState.ownerNotifications || []).length ? <p className="helper-text">No new project notifications. Field documentation will appear here as it is submitted.</p> : null}</div></section> : null}
      {activeTab === "overview" ? <><section className="dashboard__hero">
        <div>
          <p className="eyebrow">Owner control center</p>
          <h2>Lead, project, team, and cash-flow decisions in one focused workspace.</h2>
          <p>
            This admin layer is designed for fast scanning: outstanding money, open work, reminder pressure, and the
            next moves that keep jobs closing and crews moving.
          </p>
        </div>
        <div className="dashboard__search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search clients, addresses, or requested jobs"
          />
        </div>
      </section>

      <section className="owner-decision-strip" aria-label="Owner decision snapshot">
        <div><span>Priority follow-up</span><strong>{kpis.prospects} active prospects</strong><small>Review new estimate requests and consultation needs.</small></div>
        <div><span>Cash position</span><strong>{formatCurrency(kpis.receivables)} receivable</strong><small>Confirm deposits and upcoming payment milestones.</small></div>
        <div><span>Operating view</span><strong>{appState.projects.filter((project) => project.status !== "Completed").length} live projects</strong><small>Use Projects &amp; Operations to sequence work and teams.</small></div>
      </section>

      <section className="kpi-grid">
        <article className="kpi-card">
          <BriefcaseBusiness size={22} />
          <span>Open Pipeline</span>
          <strong>{kpis.totalRecords}</strong>
          <small>{kpis.prospects} prospecting / {kpis.activeJobs} active</small>
        </article>
        <article className="kpi-card">
          <CircleDollarSign size={22} />
          <span>Projected Revenue</span>
          <strong>{formatCurrency(kpis.projected)}</strong>
          <small>High-end estimate totals in pipeline</small>
        </article>
        <article className="kpi-card">
          <WalletCards size={22} />
          <span>Collected To Date</span>
          <strong>{formatCurrency(kpis.collected)}</strong>
          <small>{formatCurrency(kpis.receivables)} still receivable</small>
        </article>
        <article className="kpi-card">
          <ClipboardCheck size={22} />
          <span>Close Rate</span>
          <strong>{kpis.closeRate}%</strong>
          <small>{kpis.completed} completed jobs logged</small>
        </article>
      </section></> : null}

      <section className="dashboard__grid">
        <div className="dashboard__main">
          <section className={`panel owner-tab-panel${activeTab === "crm" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Pipeline View</p>
                <h3>Client records and next actions</h3>
              </div>
            </div>
            <div className="crm-table">
              {crmRecords.map((record) => (
                <article key={record.id} className="crm-row">
                  <div>
                    <strong>{record.client.firstName} {record.client.lastName}</strong>
                    <span>{record.client.address}, {record.client.city}</span>
                    <small>{record.client.requestedJobs} | {record.source}</small>
                  </div>
                  <div>
                    <span className={`status-pill status-pill--${record.client.jobStatus.replace(/[^a-z]/gi, "").toLowerCase()}`}>
                      {record.client.jobStatus}
                    </span>
                    <small>Budget {formatCurrency(record.client.budget)}</small>
                  </div>
                  <div>
                    <strong>{formatCurrency(record.paymentDue)}</strong>
                    <small>{record.invoiceStatus}</small>
                  </div>
                  <div>
                    <label>
                      Update status
                      <select
                        value={record.client.jobStatus}
                        onChange={(event) => {
                          setUpdatingRecordId(record.id);
                          void onUpdateRecord(record.id, {
                            client: {
                              ...record.client,
                              jobStatus: event.target.value as CrmRecord["client"]["jobStatus"],
                            },
                          }).finally(() => setUpdatingRecordId(null));
                        }}
                      >
                        <option>Prospecting/Negotiating</option>
                        <option>In-Progress</option>
                        <option>Declined</option>
                        <option>Completed</option>
                      </select>
                    </label>
                    {updatingRecordId === record.id ? <small>Saving...</small> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={`panel owner-tab-panel${activeTab === "schedule" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Scheduler</p>
                <h3>Consultation requests and availability</h3>
              </div>
            </div>
            <div className="stack-list">
              <div className="stack-block">
                <div className="stack-block__title">
                  <BellRing size={16} />
                  Upcoming consultation requests
                </div>
                <p className="helper-text">
                  {consultationKpis.requested} requested, {consultationKpis.confirmed} confirmed, {consultationKpis.conflicts} conflict flags.
                </p>
                <ul>
                  {consultationRequests.length ? (
                    consultationRequests.map((record) => (
                      <li key={`${record.id}-consultation`}>
                        <strong>
                          {record.client.firstName} {record.client.lastName}
                        </strong>
                        <span>
                          {record.client.consultationDate || "Date pending"} {record.client.consultationTime ? `at ${record.client.consultationTime}` : ""}
                        </span>
                        <small>
                          {record.client.phone || "No phone"} | {record.client.email || "No email"} | {record.client.consultationStatus} | {record.source}
                        </small>
                        {getConsultationIssue(record, settingsDraft) ? (
                          <small className="error-text">{getConsultationIssue(record, settingsDraft)}</small>
                        ) : null}
                        <label>
                          Consultation status
                          <select
                            value={record.client.consultationStatus}
                            onChange={(event) => {
                              setUpdatingRecordId(record.id);
                              void onUpdateRecord(record.id, {
                                client: {
                                  ...record.client,
                                  consultationStatus: event.target.value as CrmRecord["client"]["consultationStatus"],
                                },
                              }).finally(() => setUpdatingRecordId(null));
                            }}
                          >
                            <option>None</option>
                            <option>Requested</option>
                            <option>Confirmed</option>
                            <option>Completed</option>
                            <option>Declined</option>
                          </select>
                        </label>
                      </li>
                    ))
                  ) : (
                    <li>No consultation requests are scheduled yet.</li>
                  )}
                </ul>
              </div>
              <div className="stack-block">
                <div className="stack-block__title">
                  <HardHat size={16} />
                  Published availability
                </div>
                <ul>
                  {settingsDraft.availabilitySchedule.map((slot) => (
                    <li key={slot.day}>
                      <strong>{slot.day}</strong>
                      <span>{slot.enabled ? `${slot.start} - ${slot.end}` : "Unavailable"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className={`chart-grid owner-tab-panel${activeTab === "insights" ? " is-active" : ""}`}>
            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">KPI Chart</p>
                  <h3>Quoted vs. collected</h3>
                </div>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={revenueSeries}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="client" stroke="#bdb7a8" />
                    <YAxis stroke="#bdb7a8" />
                    <Tooltip />
                    <Bar dataKey="quoted" fill="#d6b264" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="collected" fill="#4f8a66" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Job Mix</p>
                  <h3>Status distribution</h3>
                </div>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={statusBreakdown} innerRadius={64} outerRadius={94} dataKey="value" paddingAngle={3}>
                      {statusBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          </section>

          <section className={`panel owner-tab-panel${activeTab === "insights" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">AI + AR Blueprint</p>
                <h3>75 planned upgrades for a stronger contracting platform</h3>
              </div>
            </div>
            <div className="roadmap-kpi-grid">
              <article className="roadmap-kpi">
                <strong>{totalInnovationCount}</strong>
                <span>Total planned enhancements</span>
                <small>Across AI capture, estimating, CRM, ops, finance, and data infrastructure.</small>
              </article>
              <article className="roadmap-kpi">
                <strong>{innovationPillars.filter((pillar) => pillar.phase === "Now").length}</strong>
                <span>Immediate pillars</span>
                <small>Foundations that unlock better quoting accuracy and data scale now.</small>
              </article>
              <article className="roadmap-kpi">
                <strong>{launchPriorities.length}</strong>
                <span>Near-term launch bets</span>
                <small>High-leverage features chosen to beat common market pain points first.</small>
              </article>
            </div>
            <div className="roadmap-pillar-list">
              {innovationPillars.map((pillar) => (
                <article key={pillar.id} className="stack-block">
                  <div className="stack-block__title">
                    <LineChart size={16} />
                    {pillar.name}
                  </div>
                  <p className="helper-text">
                    {pillar.count} enhancements · {pillar.phase}
                  </p>
                  <p className="helper-text">{pillar.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="dashboard__side">
          <section className={`panel owner-tab-panel${activeTab === "overview" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Reminders</p>
                <h3>Follow-up pressure</h3>
              </div>
              <BellRing size={18} />
            </div>
            <ul className="stack-list stack-list--plain">
              {appState.reminders.map((reminder) => (
                <li key={reminder.id}>
                  <strong>{reminder.clientName}</strong>
                  <span>{reminder.note}</span>
                  <small>{reminder.dueDate} | {reminder.priority}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className={`panel owner-tab-panel${activeTab === "team" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Crew & Payroll</p>
                <h3>Labor visibility</h3>
              </div>
              <HardHat size={18} />
            </div>
            <ul className="stack-list stack-list--plain">
              {crewMetrics.map((crew) => (
                <li key={crew.name}>
                  <strong>{crew.name}</strong>
                  <span>{crew.role}</span>
                  <small>{crew.scheduledHours} hrs scheduled | {formatCurrency(crew.payrollProjection)}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className={`panel owner-tab-panel${activeTab === "team" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Material Watch</p>
                <h3>Current job supply attention</h3>
              </div>
              <LineChart size={18} />
            </div>
            <ul className="stack-list stack-list--plain">
              <li>
                <strong>Paint + sundries</strong>
                <span>Interior repaint leads are trending up this week.</span>
                <small>Check Sherwin and Lowe&apos;s bulk pricing.</small>
              </li>
              <li>
                <strong>LVP + transitions</strong>
                <span>Kitchen flooring work is active in the current pipeline.</span>
                <small>Watch transition strips, pad, and leveler stock.</small>
              </li>
              <li>
                <strong>Roof repair kits</strong>
                <span>Storm leak jobs need patch materials ready to go.</span>
                <small>Keep shingle bundles, flashing, and sealant on hand.</small>
              </li>
            </ul>
          </section>

          <section className={`panel owner-tab-panel${activeTab === "team" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Documentation</p>
                <h3>Stored files and field evidence</h3>
              </div>
            </div>
            <ul className="stack-list stack-list--plain">
              {appState.crmRecords.flatMap((record) =>
                record.documentation.map((doc) => (
                  <li key={`${record.id}-${doc}`}>
                    <strong>{doc}</strong>
                    <span>{record.client.firstName} {record.client.lastName}</span>
                    <small>{record.client.requestedJobs}</small>
                  </li>
                )),
              )}
            </ul>
          </section>

          <section className={`panel owner-tab-panel${activeTab === "insights" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Launch Priorities</p>
                <h3>What to build next</h3>
              </div>
              <BriefcaseBusiness size={18} />
            </div>
            <ul className="stack-list stack-list--plain">
              {launchPriorities.map((priority) => (
                <li key={priority.id}>
                  <strong>{priority.title}</strong>
                  <span>{priority.outcome}</span>
                  <small>{priority.whyNow}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className={`panel owner-tab-panel${activeTab === "insights" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Scale Stack</p>
                <h3>Platform modules for growth</h3>
              </div>
              <LineChart size={18} />
            </div>
            <ul className="stack-list stack-list--plain">
              {platformModules.map((module) => (
                <li key={module.id}>
                  <strong>{module.name}</strong>
                  <span>{module.stack}</span>
                  <small>{module.summary}</small>
                  <small>Next step: {module.nextStep}</small>
                </li>
              ))}
            </ul>
          </section>

          <section className={`panel owner-tab-panel${activeTab === "settings" ? " is-active" : ""}`}>
            <div className="panel__header">
              <div>
                <p className="eyebrow">Admin Settings</p>
                <h3>Credentials, pricing, and integrations</h3>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Company Name
                <input
                  value={settingsDraft.repProfile.companyName}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      repProfile: { ...current.repProfile, companyName: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Rep Name
                <input
                  value={settingsDraft.repProfile.repName}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      repProfile: { ...current.repProfile, repName: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Rep Title
                <input
                  value={settingsDraft.repProfile.title}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      repProfile: { ...current.repProfile, title: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={settingsDraft.repProfile.phone}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      repProfile: { ...current.repProfile, phone: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Email
                <input
                  value={settingsDraft.repProfile.email}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      repProfile: { ...current.repProfile, email: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                Admin Email
                <input
                  value={settingsDraft.adminEmail}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, adminEmail: event.target.value }))}
                />
              </label>
              <label>
                Staff Email
                <input
                  value={settingsDraft.staffEmail}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, staffEmail: event.target.value }))}
                />
              </label>
              <label>
                Admin Password
                <input
                  type="password"
                  value={settingsDraft.adminPassword}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, adminPassword: event.target.value }))}
                  placeholder={appState.settings.hasAdminPassword ? "Leave blank to keep current password" : "Set a password"}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Staff Password
                <input
                  type="password"
                  value={settingsDraft.staffPassword}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, staffPassword: event.target.value }))}
                  placeholder={appState.settings.hasStaffPassword ? "Leave blank to keep current password" : "Set a password"}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Service Area ZIP
                <input
                  value={settingsDraft.serviceAreaZip}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, serviceAreaZip: event.target.value }))}
                />
              </label>
              <label className="form-grid__wide">
                AI Provider
                <select
                  value={settingsDraft.aiProvider}
                  onChange={(event) =>
                    {
                      setSettingsDraft((current) => ({
                        ...current,
                        aiProvider: event.target.value as AppSettings["aiProvider"],
                        automationEnabled: false,
                      }));
                      setIntegrationResults((current) => ({ ...current, ai: undefined }));
                    }
                  }
                >
                  <option value="heuristic">Heuristic fallback</option>
                  <option value="openai-direct">OpenAI direct</option>
                  <option value="anthropic-direct">Anthropic direct</option>
                  <option value="webhook">Webhook</option>
                </select>
              </label>
              <label className="form-grid__wide developer-activation">
                <span>Automation pipeline</span>
                <span className="toggle-row">
                  <input
                    type="checkbox"
                    checked={settingsDraft.automationEnabled}
                    disabled={settingsDraft.aiProvider !== "heuristic" && integrationResults.ai?.status !== "success"}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, automationEnabled: event.target.checked }))}
                  />
                  <span>{settingsDraft.automationEnabled ? "Active" : "Basic online mode"}</span>
                </span>
                <small>Live providers must pass the connection test before this switch can be activated.</small>
              </label>
              <label className="form-grid__wide">
                Google Apps Script URL
                <input
                  value={settingsDraft.googleAppsScriptUrl}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, googleAppsScriptUrl: event.target.value }))}
                />
              </label>
              <label className="form-grid__wide">
                AI Webhook URL
                <input
                  value={settingsDraft.aiWebhookUrl}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, aiWebhookUrl: event.target.value }))}
                />
              </label>
              <label className="form-grid__wide">
                OpenAI API Key
                <input
                  type="password"
                  value={settingsDraft.openAiApiKey}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, openAiApiKey: event.target.value }))}
                  placeholder={appState.settings.hasOpenAiApiKey ? "Leave blank to keep stored key" : "sk-..."}
                  autoComplete="off"
                />
              </label>
              <label className="form-grid__wide">
                OpenAI Scope / Vision Model
                <input
                  value={settingsDraft.openAiModel}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, openAiModel: event.target.value }))}
                />
              </label>
              <label className="form-grid__wide">
                Anthropic API Key
                <input
                  type="password"
                  value={settingsDraft.anthropicApiKey}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, anthropicApiKey: event.target.value }))}
                  placeholder={appState.settings.hasAnthropicApiKey ? "Leave blank to keep stored key" : "sk-ant-..."}
                  autoComplete="off"
                />
              </label>
              <label className="form-grid__wide">
                Anthropic Scope / Vision Model
                <input
                  value={settingsDraft.anthropicModel}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, anthropicModel: event.target.value }))}
                />
              </label>
              <label>
                Search Model
                <input
                  value={settingsDraft.openAiSearchModel}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, openAiSearchModel: event.target.value }))}
                />
              </label>
              <label>
                Transcription Model
                <input
                  value={settingsDraft.openAiTranscriptionModel}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, openAiTranscriptionModel: event.target.value }))
                  }
                />
              </label>
              <label className="form-grid__wide">
                Email Webhook URL
                <input
                  value={settingsDraft.emailWebhookUrl}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, emailWebhookUrl: event.target.value }))}
                />
              </label>
              <label>
                Low Markup %
                <input
                  type="number"
                  step="0.01"
                  value={settingsDraft.lowMarkupPct}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, lowMarkupPct: Number(event.target.value) }))}
                />
              </label>
              <label>
                High Markup %
                <input
                  type="number"
                  step="0.01"
                  value={settingsDraft.highMarkupPct}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, highMarkupPct: Number(event.target.value) }))}
                />
              </label>
              <label>
                Travel Fee
                <input
                  type="number"
                  value={settingsDraft.travelFee}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, travelFee: Number(event.target.value) }))}
                />
              </label>
              <label>
                Tax %
                <input
                  type="number"
                  step="0.01"
                  value={settingsDraft.taxPct}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, taxPct: Number(event.target.value) }))}
                />
              </label>
              <label>
                Quote Validity Days
                <input
                  type="number"
                  value={settingsDraft.defaultQuoteValidityDays}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, defaultQuoteValidityDays: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Standard Deposit %
                <input
                  type="number"
                  step="0.01"
                  value={settingsDraft.standardDepositPct}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, standardDepositPct: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Large Job Deposit %
                <input
                  type="number"
                  step="0.01"
                  value={settingsDraft.largeJobDepositPct}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, largeJobDepositPct: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Large Job Threshold
                <input
                  type="number"
                  value={settingsDraft.largeJobThreshold}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, largeJobThreshold: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Default Contingency %
                <input
                  type="number"
                  step="0.01"
                  value={settingsDraft.defaultContingencyPct}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({ ...current, defaultContingencyPct: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="form-grid__wide">
                Consultation Blackout Dates
                <input
                  value={settingsDraft.consultationBlackoutDates.join(", ")}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      consultationBlackoutDates: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="2026-05-26, 2026-06-14"
                />
              </label>
            </div>
            <div className="stack-block">
              <div className="stack-block__title">
                <ClipboardCheck size={16} />
                Consultation availability
              </div>
              <ul>
                {settingsDraft.availabilitySchedule.map((slot, index) => (
                  <li key={slot.day}>
                    <strong>{slot.day}</strong>
                    <div className="availability-row">
                      <label className="toggle-row">
                        <span>Available</span>
                        <input
                          type="checkbox"
                          checked={slot.enabled}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              availabilitySchedule: current.availabilitySchedule.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, enabled: event.target.checked } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Start
                        <input
                          type="time"
                          value={slot.start}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              availabilitySchedule: current.availabilitySchedule.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, start: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        End
                        <input
                          type="time"
                          value={slot.end}
                          onChange={(event) =>
                            setSettingsDraft((current) => ({
                              ...current,
                              availabilitySchedule: current.availabilitySchedule.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, end: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <p className="helper-text">
              Admin and staff credentials, CRM data, and AI secrets now live on the local secure server instead of in
              the browser. Leave password or API-key fields blank when saving if you want to keep the current stored
              value.
            </p>
            <div className="assist-grid">
              <article className="assist-card">
                <div className="assist-card__title">
                  <SparklesIcon />
                  <h4>AI integration</h4>
                </div>
                <p>
                  {settingsDraft.aiProvider === "heuristic"
                    ? "Heuristic mode is local-only and should pass without external credentials."
                    : settingsDraft.aiProvider === "openai-direct"
                      ? appState.settings.hasOpenAiApiKey || appState.settings.hasAiGateway
                        ? `${appState.settings.hasAiGateway ? "Netlify AI Gateway" : "OpenAI direct"} is configured. Run a live health check before activation.`
                        : "OpenAI direct is selected but no server-side API key is currently stored."
                      : settingsDraft.aiProvider === "anthropic-direct"
                        ? appState.settings.hasAnthropicApiKey
                          ? "Anthropic direct is configured. Run a live health check before activation."
                          : "Anthropic direct is selected but no server-side API key is currently stored."
                      : appState.settings.hasAiWebhook
                        ? "Webhook mode is configured. The health test pings the saved AI webhook."
                        : "Webhook mode is selected but no AI webhook URL is currently stored."}
                </p>
                <button
                  className="secondary-button"
                  onClick={() => void runIntegrationCheck("ai")}
                  disabled={testingIntegration !== null}
                >
                  {testingIntegration === "ai" ? "Testing AI..." : "Test AI Connection"}
                </button>
                {integrationResults.ai ? (
                  <p className={`integration-result integration-result--${integrationResults.ai.status}`}>
                    {integrationResults.ai.message}
                  </p>
                ) : null}
              </article>

              <article className="assist-card">
                <div className="assist-card__title">
                  <MailIcon />
                  <h4>Email webhook</h4>
                </div>
                <p>
                  The email health test checks the configured webhook using a safe health-check payload instead of
                  sending a homeowner quote.
                </p>
                <button
                  className="secondary-button"
                  onClick={() => void runIntegrationCheck("email")}
                  disabled={testingIntegration !== null}
                >
                  {testingIntegration === "email" ? "Testing Email..." : "Test Email Webhook"}
                </button>
                {integrationResults.email ? (
                  <p className={`integration-result integration-result--${integrationResults.email.status}`}>
                    {integrationResults.email.message}
                  </p>
                ) : null}
              </article>

              <article className="assist-card">
                <div className="assist-card__title">
                  <SheetIcon />
                  <h4>Google Sheets sync</h4>
                </div>
                <p>
                  This test calls the saved Apps Script URL with a health-check payload so the owner can verify the
                  Drive / Sheets path before saving live quotes.
                </p>
                <button
                  className="secondary-button"
                  onClick={() => void runIntegrationCheck("google-sheets")}
                  disabled={testingIntegration !== null}
                >
                  {testingIntegration === "google-sheets" ? "Testing Sheets..." : "Test Google Sheets Sync"}
                </button>
                {integrationResults["google-sheets"] ? (
                  <p
                    className={`integration-result integration-result--${integrationResults["google-sheets"]?.status}`}
                  >
                    {integrationResults["google-sheets"]?.message}
                  </p>
                ) : null}
              </article>
            </div>
            <button className="primary-button" onClick={() => void saveSettings()} disabled={savingSettings}>
              {savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </section>
        </aside>
      </section>
      </main>
    </div>
  );
}

function SparklesIcon() {
  return <LineChart size={18} />;
}

function MailIcon() {
  return <WalletCards size={18} />;
}

function SheetIcon() {
  return <ClipboardCheck size={18} />;
}
