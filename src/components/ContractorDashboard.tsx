import { ClipboardCheck, FileText, MapPin, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AppState, Project } from "../types";
import { formatCurrency } from "../lib/estimates";
import { submitFieldProjectNote } from "../lib/api";

interface Props { appState: AppState; email: string; onOpenEstimate: () => void; onUpdateState: (state: AppState) => void; }

function ProjectCard({ project, onOpenEstimate, onSubmit }: { project: Project; onOpenEstimate: () => void; onSubmit: (projectId: string, note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return <article className="field-workspace__project">
    <div><span className={`health health--${project.health.toLowerCase()}`}>{project.health}</span><h3>{project.name}</h3><p>{project.summary || "Project summary will be supplied by the Owner."}</p></div>
    <dl><div><dt>Status</dt><dd>{project.status} · {project.percentComplete}%</dd></div><div><dt>Target</dt><dd>{project.targetEndDate || "To be confirmed"}</dd></div><div><dt>Budget</dt><dd>{formatCurrency(project.budget)}</dd></div></dl>
    <section className="field-workspace__activity"><strong>Recent activity</strong>{(project.activity || []).slice(0, 3).map((item) => <p key={item.id}><b>{item.authorName}</b> · {new Date(item.createdAt).toLocaleString()}<br />{item.body}</p>)}<textarea value={note} maxLength={4000} placeholder="Add a permanent field note for the Owner…" aria-label={`Field note for ${project.name}`} onChange={(event) => setNote(event.target.value)} /><button className="button" disabled={busy || !note.trim()} onClick={() => void (async () => { setBusy(true); try { await onSubmit(project.id, note); setNote(""); } finally { setBusy(false); } })()}>{busy ? "Submitting…" : "Submit permanent note"}</button></section>
    <button className="button button--ghost" onClick={onOpenEstimate}><ClipboardCheck size={16} /> Open estimate workspace</button>
  </article>;
}

export function ContractorDashboard({ appState, email, onOpenEstimate, onUpdateState }: Props) {
  const [message, setMessage] = useState("");
  const employee = appState.employees.find((item) => item.email.toLowerCase() === email.toLowerCase());
  const projects = appState.projects.filter((project) => employee?.assignedProjectIds.includes(project.id));
  const submit = async (projectId: string, body: string) => { try { const payload = await submitFieldProjectNote(projectId, body); onUpdateState(payload.appState); setMessage("Field note submitted to the Owner."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit field note."); } };
  return <section className="field-workspace" aria-labelledby="field-workspace-title"><header className="field-workspace__hero"><div><p className="eyebrow">Contractor / estimator workspace</p><h2 id="field-workspace-title">Today&apos;s assigned work</h2><p>Review assigned jobs, prepare estimates, and submit permanent field documentation to the Owner.</p></div><button className="primary-button" onClick={onOpenEstimate}><FileText size={17} /> Create or update estimate</button></header><div className="field-workspace__notice"><ShieldCheck size={18} /><span>This workspace is limited to your assignment. Owner CRM, payroll, reports, integrations, and private notes remain private.</span></div>{employee ? <div className="field-workspace__identity"><strong>{employee.firstName} {employee.lastName}</strong><span>{employee.title} · {employee.availability}</span></div> : <p className="field-workspace__notice">Your login is not linked to an active employee record. Ask the Owner to use this email on your employee profile.</p>}<div className="field-workspace__grid">{projects.length ? projects.map((project) => <ProjectCard key={project.id} project={project} onOpenEstimate={onOpenEstimate} onSubmit={submit} />) : <article className="field-workspace__empty"><MapPin size={28} /><h3>No work assigned yet</h3><p>Assigned projects will appear here.</p></article>}</div>{message ? <p className="operations-message" role="status">{message}</p> : null}</section>;
}
