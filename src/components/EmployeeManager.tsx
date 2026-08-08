import { FormEvent, useMemo, useState } from "react";
import { Edit3, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { OperationsStatePatch } from "../lib/api";
import { Employee, EmploymentType } from "../types";
import { formatCurrency } from "../lib/estimates";

interface EmployeeManagerProps {
  employees: Employee[];
  onSave: (patch: OperationsStatePatch) => Promise<void>;
}

const payFrequencies: Employee["payFrequency"][] = ["Daily", "Weekly", "Biweekly", "Semimonthly", "Monthly", "Per Project", "Contracted", "Hourly", "Commission", "Other"];
const paymentMethods: Employee["paymentMethod"][] = ["Cash", "Check", "Direct Deposit", "PayPal", "Cash App", "Venmo", "Zelle", "ACH", "Prepaid Card", "Other"];
const employmentTypes: EmploymentType[] = ["Full-time", "Part-time", "Contract", "Temporary"];

const emptyDraft = (): Employee => ({
  id: "", firstName: "", lastName: "", title: "", employmentType: "Full-time", status: "Active",
  email: "", phone: "", hireDate: new Date().toISOString().slice(0, 10), hourlyRate: 0,
  payFrequency: "Weekly", paymentMethod: "Cash", paymentHandle: "", skills: [], certifications: [],
  availability: "Available", weeklyCapacityHours: 40, assignedProjectIds: [], emergencyContactName: "",
  emergencyContactPhone: "", notes: "",
});

export function EmployeeManager({ employees, onSave }: EmployeeManagerProps) {
  const [draft, setDraft] = useState<Employee>(emptyDraft);
  const [skillsText, setSkillsText] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const activeCount = employees.filter((employee) => employee.status === "Active").length;
  const weeklyCapacity = employees.filter((employee) => employee.status === "Active").reduce((sum, employee) => sum + employee.weeklyCapacityHours, 0);
  const hourlyExposure = useMemo(() => employees.filter((employee) => employee.status === "Active").reduce((sum, employee) => sum + employee.hourlyRate * employee.weeklyCapacityHours, 0), [employees]);

  const reset = () => { setDraft(emptyDraft()); setSkillsText(""); setEditing(false); };
  const edit = (employee: Employee) => {
    setDraft({ ...employee, payFrequency: employee.payFrequency || "Weekly", paymentMethod: employee.paymentMethod || "Cash", paymentHandle: employee.paymentHandle || "" });
    setSkillsText(employee.skills.join(", "));
    setEditing(true);
    setMessage("");
    document.getElementById("employee-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!draft.firstName.trim() || !draft.lastName.trim() || !draft.title.trim()) return setMessage("Full name and role/title are required.");
    if (!Number.isFinite(draft.hourlyRate) || draft.hourlyRate < 0 || draft.hourlyRate > 10000) return setMessage("Enter a valid pay rate between $0 and $10,000.");
    if (!Number.isFinite(draft.weeklyCapacityHours) || draft.weeklyCapacityHours < 0 || draft.weeklyCapacityHours > 168) return setMessage("Weekly capacity must be between 0 and 168 hours.");
    if (draft.paymentMethod !== "Cash" && !draft.paymentHandle.trim()) return setMessage(`Add a safe ${draft.paymentMethod} username, payout alias, or account label.`);
    const employee: Employee = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      firstName: draft.firstName.trim().slice(0, 80), lastName: draft.lastName.trim().slice(0, 80),
      title: draft.title.trim().slice(0, 120), email: draft.email.trim().slice(0, 254), phone: draft.phone.trim().slice(0, 40),
      paymentHandle: draft.paymentMethod === "Cash" ? "" : draft.paymentHandle.trim().slice(0, 120),
      notes: draft.notes.trim().slice(0, 2000), skills: skillsText.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 30),
    };
    const next = editing ? employees.map((item) => item.id === employee.id ? employee : item) : [employee, ...employees];
    setSaving(true);
    try { await onSave({ employees: next }); setMessage(editing ? "Employee record updated." : "Employee added."); reset(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Employee record could not be saved."); }
    finally { setSaving(false); }
  };

  const remove = async (employee: Employee) => {
    if (!window.confirm(`Remove ${employee.firstName} ${employee.lastName}'s employee record? This cannot be undone.`)) return;
    setSaving(true);
    try { await onSave({ employees: employees.filter((item) => item.id !== employee.id) }); setMessage("Employee record removed."); if (draft.id === employee.id) reset(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Employee record could not be removed."); }
    finally { setSaving(false); }
  };

  return <section className="employee-manager" aria-labelledby="employee-manager-title">
    <header className="employee-manager__hero">
      <div><p className="eyebrow">Private workforce records</p><h2 id="employee-manager-title">Employees & pay preferences</h2><p>Maintain staffing, capacity, pay cadence, and safe payout aliases in one Owner-only workspace.</p></div>
      <Users aria-hidden="true" size={28} />
    </header>
    <div className="employee-manager__metrics">
      <article><span>Active employees</span><strong>{activeCount}</strong></article>
      <article><span>Weekly capacity</span><strong>{weeklyCapacity} hrs</strong></article>
      <article><span>Weekly hourly exposure</span><strong>{formatCurrency(hourlyExposure)}</strong><small>Planning estimate, before payroll costs</small></article>
    </div>
    <div className="employee-manager__layout">
      <form id="employee-editor" className="employee-editor" onSubmit={submit}>
        <div className="employee-section-heading"><div><p className="eyebrow">{editing ? "Update record" : "New employee"}</p><h3>{editing ? `${draft.firstName} ${draft.lastName}` : "Add a team member"}</h3></div><UserPlus aria-hidden="true" size={20} /></div>
        <div className="employee-form-grid">
          <label>First name<input required maxLength={80} value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} /></label>
          <label>Last name<input required maxLength={80} value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></label>
          <label className="employee-form-grid__wide">Role / title<input required maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Employee["status"] })}><option>Active</option><option>Leave</option><option>Inactive</option></select></label>
          <label>Employment type<select value={draft.employmentType} onChange={(e) => setDraft({ ...draft, employmentType: e.target.value as EmploymentType })}>{employmentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Email<input type="email" maxLength={254} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          <label>Phone<input type="tel" maxLength={40} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
          <label>Hire date<input type="date" value={draft.hireDate} onChange={(e) => setDraft({ ...draft, hireDate: e.target.value })} /></label>
          <label>Pay rate ($)<input type="number" min="0" max="10000" step="0.01" value={draft.hourlyRate} onChange={(e) => setDraft({ ...draft, hourlyRate: Number(e.target.value) })} /></label>
          <label>Pay frequency<select value={draft.payFrequency} onChange={(e) => setDraft({ ...draft, payFrequency: e.target.value as Employee["payFrequency"] })}>{payFrequencies.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Preferred payment<select value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value as Employee["paymentMethod"], paymentHandle: e.target.value === "Cash" ? "" : draft.paymentHandle })}>{paymentMethods.map((value) => <option key={value}>{value}</option>)}</select></label>
          {draft.paymentMethod !== "Cash" ? <label className="employee-form-grid__wide">{draft.paymentMethod} username or account label<input required maxLength={120} autoComplete="off" placeholder="Username, payout alias, or last-four label only" value={draft.paymentHandle} onChange={(e) => setDraft({ ...draft, paymentHandle: e.target.value })} /></label> : null}
          <label>Weekly capacity (hours)<input type="number" min="0" max="168" value={draft.weeklyCapacityHours} onChange={(e) => setDraft({ ...draft, weeklyCapacityHours: Number(e.target.value) })} /></label>
          <label>Availability<select value={draft.availability} onChange={(e) => setDraft({ ...draft, availability: e.target.value as Employee["availability"] })}><option>Available</option><option>Partially Allocated</option><option>Fully Allocated</option><option>Unavailable</option></select></label>
          <label className="employee-form-grid__wide">Skills<input value={skillsText} placeholder="Carpentry, flooring, supervision" onChange={(e) => setSkillsText(e.target.value)} /></label>
          <label className="employee-form-grid__wide">Notes<textarea maxLength={2000} rows={4} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        </div>
        <div className="employee-security-note"><ShieldCheck size={18} aria-hidden="true" /><span>Owner-only record. Store only a payout username or internal account label—never bank routing numbers, full account numbers, card numbers, passwords, or PINs.</span></div>
        {message ? <p className="operations-message" role="status">{message}</p> : null}
        <div className="employee-form-actions"><button className="button" disabled={saving}>{saving ? "Saving…" : editing ? "Update employee" : "Add employee"}</button>{editing ? <button type="button" className="button button--ghost" onClick={reset}>Cancel</button> : null}</div>
      </form>
      <div className="employee-directory">
        <div className="employee-section-heading"><div><p className="eyebrow">Directory</p><h3>{employees.length} employee records</h3></div></div>
        {employees.length ? employees.map((employee) => <article className="employee-card" key={employee.id}>
          <div className="employee-card__identity"><span>{employee.firstName.charAt(0)}{employee.lastName.charAt(0)}</span><div><h4>{employee.firstName} {employee.lastName}</h4><p>{employee.title}</p></div><em className={`employee-status employee-status--${employee.status.toLowerCase()}`}>{employee.status}</em></div>
          <dl><div><dt>Pay</dt><dd>{formatCurrency(employee.hourlyRate)} · {employee.payFrequency || "Weekly"}</dd></div><div><dt>Preferred payout</dt><dd>{employee.paymentMethod || "Cash"}{employee.paymentMethod && employee.paymentMethod !== "Cash" && employee.paymentHandle ? ` · ${employee.paymentHandle}` : ""}</dd></div><div><dt>Capacity</dt><dd>{employee.weeklyCapacityHours} hrs/week · {employee.availability}</dd></div><div><dt>Contact</dt><dd>{employee.email || employee.phone || "Not entered"}</dd></div></dl>
          {employee.skills.length ? <p className="employee-card__skills">{employee.skills.join(" · ")}</p> : null}
          <div className="employee-card__actions"><button className="button button--ghost" onClick={() => edit(employee)}><Edit3 size={15} /> Edit</button><button className="button button--danger" disabled={saving} onClick={() => void remove(employee)}><Trash2 size={15} /> Remove</button></div>
        </article>) : <div className="employee-empty"><Users size={28} /><h4>No employee records yet</h4><p>Add the first team member using the form.</p></div>}
      </div>
    </div>
  </section>;
}
