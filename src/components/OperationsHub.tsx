import { ChangeEvent, useMemo, useState } from "react";
import { Bot, Boxes, Briefcase, Download, Upload, Users } from "lucide-react";
import { OperationsStatePatch } from "../lib/api";
import { AiReview, Applicant, ApplicantStage, AppState } from "../types";
import { formatCurrency } from "../lib/estimates";

interface OperationsHubProps {
  appState: AppState;
  onUpdate: (patch: OperationsStatePatch) => Promise<void>;
}

const stages: ApplicantStage[] = ["New", "Screening", "Interview", "Offer", "Hired", "Rejected", "Withdrawn"];
const operationsKeys = ["applicants", "jobOpenings", "projects", "employees", "materials", "aiReviews"] as const;

const downloadJson = (appState: AppState) => {
  const payload = Object.fromEntries(operationsKeys.map((key) => [key, appState[key]]));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  link.download = `davids-contracting-operations-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};

export function OperationsHub({ appState, onUpdate }: OperationsHubProps) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedOpeningId, setSelectedOpeningId] = useState(appState.jobOpenings.find((job) => job.status === "Open")?.id ?? "");
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", role: "", skills: "", experience: 0, resumeText: "", consent: false });

  const portfolio = useMemo(() => ({
    budget: appState.projects.reduce((sum, project) => sum + project.budget, 0),
    actual: appState.projects.reduce((sum, project) => sum + project.actualCost, 0),
    atRisk: appState.projects.filter((project) => project.health !== "Green").length,
    lowStock: appState.materials.filter((item) => item.quantityOnHand - item.quantityReserved <= item.reorderPoint).length,
  }), [appState.materials, appState.projects]);

  const save = async (patch: OperationsStatePatch, label: string) => {
    setBusy(label);
    setMessage("");
    try {
      await onUpdate(patch);
      setMessage(`${label} saved.`);
    } finally {
      setBusy("");
    }
  };

  const addApplicant = async () => {
    if (!draft.name.trim() || !draft.email.trim()) {
      setMessage("Applicant name and email are required.");
      return;
    }
    const [firstName, ...last] = draft.name.trim().split(/\s+/);
    const now = new Date().toISOString();
    const applicant: Applicant = {
      id: crypto.randomUUID(), firstName, lastName: last.join(" "), email: draft.email.trim(),
      phone: draft.phone.trim(), city: "", state: "IL", source: "Website",
      desiredRoles: draft.role ? [draft.role] : [], skills: draft.skills.split(",").map((v) => v.trim()).filter(Boolean),
      yearsExperience: Number(draft.experience) || 0, certifications: [], availabilityDate: "",
      employmentPreference: ["Full-time"], stage: "New", assignedTo: "David Carter",
      resumeFileName: "", resumeText: draft.resumeText.slice(0, 50_000), notes: "", consentToAiReview: draft.consent, createdAt: now, updatedAt: now,
    };
    await save({ applicants: [applicant, ...appState.applicants] }, "Applicant");
    setDraft({ name: "", email: "", phone: "", role: "", skills: "", experience: 0, resumeText: "", consent: false });
  };

  const reviewApplicant = async (applicant: Applicant) => {
    if (!applicant.consentToAiReview) {
      setMessage("AI review requires recorded applicant consent first.");
      return;
    }
    const opening = appState.jobOpenings.find((job) => job.id === selectedOpeningId) ?? appState.jobOpenings.find((job) => job.status === "Open");
    const required = opening?.requiredSkills ?? [];
    const normalized = new Set(applicant.skills.map((skill) => skill.toLowerCase()));
    const matches = required.filter((skill) => normalized.has(skill.toLowerCase()));
    const gaps = required.filter((skill) => !normalized.has(skill.toLowerCase()));
    const skillScore = required.length ? (matches.length / required.length) * 65 : 45;
    const experienceScore = Math.min(25, applicant.yearsExperience * 5);
    const score = Math.round(Math.min(100, skillScore + experienceScore + (applicant.certifications.length ? 10 : 0)));
    const now = new Date().toISOString();
    const review: AiReview = {
      id: crypto.randomUUID(), subjectType: "Applicant", subjectId: applicant.id, reviewType: "Job Readiness",
      status: "Needs Human Review", provider: "explainable-rules", model: "job-readiness-v1", score,
      summary: `${applicant.firstName} matches ${matches.length} of ${required.length} required skills for ${opening?.title ?? "the current opening"}.`,
      strengths: matches.length ? matches : applicant.skills.slice(0, 3), gaps,
      recommendations: gaps.map((gap) => `Validate or train for ${gap}`).concat("Complete a structured manager interview."),
      evidence: [`Self-reported experience: ${applicant.yearsExperience} years`, `Applicant skills: ${applicant.skills.join(", ") || "none listed"}`, `Resume text available: ${applicant.resumeText ? "yes" : "no"}`],
      confidence: required.length ? Math.min(0.9, 0.55 + required.length * 0.05) : 0.45,
      humanDecision: "Pending", reviewedBy: "", createdAt: now, completedAt: now,
    };
    await save({ aiReviews: [review, ...appState.aiReviews] }, "Readiness review");
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      const patch: OperationsStatePatch = {};
      operationsKeys.forEach((key) => {
        if (Array.isArray(parsed[key])) (patch as Record<string, unknown>)[key] = parsed[key];
      });
      if (!Object.keys(patch).length) throw new Error("No supported operations collections were found.");
      await save(patch, "Import");
    } catch (error) {
      setMessage(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="operations-hub">
      <div className="operations-hub__header">
        <div>
          <p className="eyebrow">Executive Operations</p>
          <h2>Applicants, projects, workforce, and materials</h2>
          <p>Persistent operating records with explainable AI recommendations and human approval.</p>
        </div>
        <div className="operations-actions">
          <button className="button button--ghost" onClick={() => downloadJson(appState)}><Download size={16} /> Export JSON</button>
          <label className="button button--ghost"><Upload size={16} /> Import JSON<input type="file" accept="application/json,.json" onChange={importJson} hidden /></label>
        </div>
      </div>
      {message ? <p className="operations-message" role="status">{message}</p> : null}

      <div className="operations-metrics">
        <div><strong>{appState.applicants.length}</strong><span>Applicants</span></div>
        <div><strong>{appState.contactLeads.length + appState.financingInquiries.length}</strong><span>Website inquiries</span></div>
        <div><strong>{formatCurrency(portfolio.budget)}</strong><span>Portfolio budget</span></div>
        <div><strong>{portfolio.lowStock}</strong><span>Reorder alerts</span></div>
      </div>

      <div className="operations-grid">
        <section className="panel operations-panel">
          <div className="panel__header"><div><p className="eyebrow">Talent CRM</p><h3>Applicant pipeline</h3></div><Users size={19} /></div>
          <div className="compact-form">
            <input aria-label="Applicant name" placeholder="Full name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input aria-label="Applicant email" placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            <input aria-label="Applicant phone" placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            <input aria-label="Desired role" placeholder="Desired role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            <input aria-label="Skills" placeholder="Skills, comma separated" value={draft.skills} onChange={(e) => setDraft({ ...draft, skills: e.target.value })} />
            <input aria-label="Years experience" type="number" min="0" placeholder="Years" value={draft.experience} onChange={(e) => setDraft({ ...draft, experience: Number(e.target.value) })} />
            <textarea aria-label="Resume text" placeholder="Paste resume text for application reading" value={draft.resumeText} maxLength={50000} onChange={(e) => setDraft({ ...draft, resumeText: e.target.value })} />
            <label className="consent-check"><input type="checkbox" checked={draft.consent} onChange={(e) => setDraft({ ...draft, consent: e.target.checked })} /> Applicant consented to AI review</label>
            <button className="button" disabled={busy === "Applicant"} onClick={() => void addApplicant()}>Add applicant</button>
          </div>
          <label className="opening-selector">Readiness target
            <select value={selectedOpeningId} onChange={(event) => setSelectedOpeningId(event.target.value)}>
              {appState.jobOpenings.filter((opening) => opening.status === "Open").map((opening) => <option key={opening.id} value={opening.id}>{opening.title}</option>)}
            </select>
          </label>
          <div className="operations-list">
            {appState.applicants.map((applicant) => {
              const review = appState.aiReviews.find((item) => item.subjectId === applicant.id);
              return <article key={applicant.id}>
                <div><strong>{applicant.firstName} {applicant.lastName}</strong><span>{applicant.desiredRoles.join(", ") || "Role not selected"} · {applicant.yearsExperience} yrs</span><small>{applicant.skills.join(", ") || "Skills pending"}</small></div>
                <select aria-label={`Stage for ${applicant.firstName}`} value={applicant.stage} onChange={(e) => void save({ applicants: appState.applicants.map((item) => item.id === applicant.id ? { ...item, stage: e.target.value as ApplicantStage, updatedAt: new Date().toISOString() } : item) }, "Pipeline")}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
                <label className="consent-check"><input type="checkbox" checked={applicant.consentToAiReview} onChange={(e) => void save({ applicants: appState.applicants.map((item) => item.id === applicant.id ? { ...item, consentToAiReview: e.target.checked, updatedAt: new Date().toISOString() } : item) }, "Consent")} /> AI consent</label>
                <button className="button button--ghost" onClick={() => void reviewApplicant(applicant)}><Bot size={15} /> {review ? `Score ${review.score}` : "Review"}</button>
                {review ? <div className="review-summary"><strong>Job readiness {review.score ?? "—"}/100 · Skills {Math.min(100, 20 + applicant.skills.length * 8 + applicant.yearsExperience * 3)}/100</strong><small>{review.summary}</small><small>Confidence {Math.round((review.confidence ?? 0) * 100)}% · human decision {review.humanDecision}</small><button className="text-button" onClick={() => void save({ aiReviews: appState.aiReviews.map((item) => item.id === review.id ? { ...item, humanDecision: "Accepted", reviewedBy: appState.settings.repProfile.repName } : item) }, "Human review")}>Accept recommendation</button></div> : null}
              </article>;
            })}
          </div>
        </section>

        <section className="panel operations-panel">
          <div className="panel__header"><div><p className="eyebrow">Portfolio</p><h3>Project health and delivery</h3></div><Briefcase size={19} /></div>
          <div className="operations-list">
            {appState.projects.map((project) => <article key={project.id}>
              <div><strong>{project.name}</strong><span>{project.clientName} · {project.projectManager}</span><small>{project.percentComplete}% complete · target {project.targetEndDate}</small></div>
              <span className={`health health--${project.health.toLowerCase()}`}>{project.health}</span>
              <div><strong>{formatCurrency(project.actualCost)}</strong><small>of {formatCurrency(project.budget)}</small></div>
              <select aria-label={`Health for ${project.name}`} value={project.health} onChange={(e) => void save({ projects: appState.projects.map((item) => item.id === project.id ? { ...item, health: e.target.value as typeof project.health, updatedAt: new Date().toISOString() } : item) }, "Project health")}><option>Green</option><option>Amber</option><option>Red</option></select>
            </article>)}
          </div>
        </section>

        <section className="panel operations-panel">
          <div className="panel__header"><div><p className="eyebrow">Workforce</p><h3>Capacity and assignments</h3></div><Users size={19} /></div>
          <div className="operations-list">{appState.employees.map((employee) => <article key={employee.id}><div><strong>{employee.firstName} {employee.lastName}</strong><span>{employee.title} · {employee.availability}</span><small>{employee.skills.join(", ")} · {employee.weeklyCapacityHours} hrs/week</small></div><strong>{formatCurrency(employee.hourlyRate)}/hr</strong></article>)}</div>
        </section>

        <section className="panel operations-panel">
          <div className="panel__header"><div><p className="eyebrow">Procurement</p><h3>Inventory and reorder risk</h3></div><Boxes size={19} /></div>
          <div className="operations-list">{appState.materials.map((item) => {
            const available = item.quantityOnHand - item.quantityReserved;
            return <article key={item.id}><div><strong>{item.name}</strong><span>{item.sku} · {item.supplierName}</span><small>{available} {item.unit} available · reorder at {item.reorderPoint}</small></div><span className={`health ${available <= item.reorderPoint ? "health--red" : "health--green"}`}>{available <= item.reorderPoint ? "Reorder" : item.status}</span></article>;
          })}</div>
        </section>

        <section className="panel operations-panel operations-panel--wide">
          <div className="panel__header"><div><p className="eyebrow">Project Manager</p><h3>Delivery Kanban</h3></div><Briefcase size={19} /></div>
          <div className="kanban-board">{["Planning", "Active", "On Hold", "Completed"].map((status) => <div className="kanban-column" key={status}><header><strong>{status}</strong><span>{appState.projects.filter((project) => project.status === status).length}</span></header>{appState.projects.filter((project) => project.status === status).map((project) => <article key={project.id}><span className={`health health--${project.health.toLowerCase()}`}>{project.health}</span><strong>{project.name}</strong><small>{project.clientName}</small><progress value={project.percentComplete} max="100" /><small>{project.percentComplete}% · {formatCurrency(project.actualCost)} / {formatCurrency(project.budget)}</small><select value={project.status} onChange={(event) => void save({ projects: appState.projects.map((item) => item.id === project.id ? { ...item, status: event.target.value as typeof project.status, updatedAt: new Date().toISOString() } : item) }, "Project stage")}><option>Planning</option><option>Active</option><option>On Hold</option><option>Completed</option><option>Cancelled</option></select></article>)}</div>)}</div>
        </section>

        <section className="panel operations-panel">
          <div className="panel__header"><div><p className="eyebrow">Website CRM</p><h3>Customer inquiries</h3></div><Users size={19} /></div>
          <div className="operations-list">{appState.contactLeads.length ? appState.contactLeads.slice(0, 12).map((lead) => <article key={lead.id}><div><strong>{lead.firstName} {lead.lastName}</strong><span>{lead.serviceInterest.join(", ") || "General inquiry"}</span><small>{lead.email} · {lead.phone} · {lead.status}</small></div>{lead.financingInterest ? <span className="health health--amber">Financing</span> : null}</article>) : <p className="helper-text">No contact inquiries yet.</p>}</div>
        </section>

        <section className="panel operations-panel">
          <div className="panel__header"><div><p className="eyebrow">Financing Leads</p><h3>Funding inquiries</h3></div><Briefcase size={19} /></div>
          <div className="operations-list">{appState.financingInquiries.length ? appState.financingInquiries.slice(0, 12).map((item) => <article key={item.id}><div><strong>{item.firstName} {item.lastName}</strong><span>{item.projectType} · {item.timeline}</span><small>{item.email} · {item.status}</small></div><strong>{item.estimatedProjectCost ? formatCurrency(item.estimatedProjectCost) : "Budget pending"}</strong></article>) : <p className="helper-text">No financing inquiries yet.</p>}</div>
        </section>

        <section className="panel operations-panel operations-panel--wide">
          <div className="panel__header"><div><p className="eyebrow">Website Reports</p><h3>Traffic and engagement</h3></div><Bot size={19} /></div>
          <div className="report-strip"><div><strong>{appState.analyticsEvents.filter((event) => event.eventType === "page_view").length}</strong><span>Page views</span></div><div><strong>{Math.round(appState.analyticsEvents.filter((event) => event.durationSeconds).reduce((sum, event) => sum + (event.durationSeconds || 0), 0) / Math.max(1, appState.analyticsEvents.filter((event) => event.durationSeconds).length))}s</strong><span>Average dwell</span></div><div><strong>{new Set(appState.analyticsEvents.map((event) => event.anonymousSessionId).filter(Boolean)).size}</strong><span>Anonymous sessions</span></div></div>
        </section>
      </div>
    </section>
  );
}
