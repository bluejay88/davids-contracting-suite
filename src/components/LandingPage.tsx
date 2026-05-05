import { ArrowRight, BriefcaseBusiness, Building2, Hammer, House, Sparkles } from "lucide-react";
import { RepProfile } from "../types";

interface LandingPageProps {
  repProfile: RepProfile;
  onOpenQuote: () => void;
  onOpenAdmin: () => void;
}

const serviceCards = [
  {
    icon: Sparkles,
    title: "Painting",
    body: "Interior walls, ceilings, trim, cabinets, and exterior work with prep, cleanup, and finish options built into the quote.",
  },
  {
    icon: Building2,
    title: "Flooring",
    body: "Laminate, LVP, tile, subfloor patching, tear-out, transitions, and room-by-room pricing that can flex by conditions.",
  },
  {
    icon: House,
    title: "Roofing",
    body: "Repair and replacement estimates with access factors, tear-off assumptions, soffit/fascia support, and disposal allowances.",
  },
  {
    icon: Hammer,
    title: "General Handiwork",
    body: "A la carte punch-list work with more than 25 small-task options that can be mixed into any estimate or invoice.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Electrical / HVAC",
    body: "Fixture swaps, thermostat work, tune-ups, small diagnostics, and emergency scope capture with aid-program prompts.",
  },
];

export function LandingPage({ repProfile, onOpenQuote, onOpenAdmin }: LandingPageProps) {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Black-Owned Contracting Excellence</p>
          <h2>
            Serious craftsmanship.
            <br />
            Faster quotes.
            <br />
            Cleaner follow-through.
          </h2>
          <p className="hero__lede">
            David&apos;s Contracting brings more than 30 years of field experience into one polished internal quoting
            and CRM workflow built for painting, flooring, roofing, handiwork, and electrical/HVAC jobs, with a
            self-serve estimate path that can still turn homeowner interest into CRM-ready leads.
          </p>
          <div className="hero__actions">
            <button className="primary-button" onClick={onOpenQuote}>
              Start Self-Serve Estimate
              <ArrowRight size={18} />
            </button>
            <button className="ghost-button ghost-button--light" onClick={onOpenAdmin}>
              Admin Dashboard
            </button>
          </div>
          <div className="hero__contact">
            <span>{repProfile.companyName}</span>
            <a href={`tel:${repProfile.phone.replace(/[^0-9]/g, "")}`}>{repProfile.phone}</a>
            <a href={`mailto:${repProfile.email}`}>{repProfile.email}</a>
          </div>
        </div>

        <div className="hero__visual">
          <div className="hero__badge">
            <img src="/davids-contracting-logo.png" alt="David's Contracting logo" />
          </div>
          <div className="hero__stat">
            <span>Low + High ranges</span>
            <strong>Fast homeowner-ready estimates</strong>
          </div>
          <div className="hero__stat hero__stat--offset">
            <span>CRM + Quote + PDF</span>
            <strong>One system for pipeline, payments, and follow-up</strong>
          </div>
        </div>
      </section>

      <section className="support-strip">
        <div>
          <p className="eyebrow">Why This Fits The Business</p>
          <h3>Built to work like an estimator&apos;s field desk, not a generic template.</h3>
        </div>
        <p>
          The experience is split into a branded public-facing landing page, a multi-trade quote builder, and an owner
          dashboard that can manage leads, invoices, reminders, materials, and crew visibility in one flow.
        </p>
      </section>

      <section className="service-grid">
        {serviceCards.map((card) => (
          <article key={card.title} className="service-grid__item">
            <card.icon size={26} />
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </section>

      <section className="story-band">
        <div>
          <p className="eyebrow">Operator Features</p>
          <h3>Speech-to-quote, image-assisted scope review, low/high pricing, and client intake all in one place.</h3>
        </div>
        <ul className="story-band__list">
          <li>Mix multiple job types on the same quote or invoice.</li>
          <li>Capture homeowner budget, urgency, notes, and aid-program eligibility clues up front.</li>
          <li>Let a homeowner request a consultation, preferred date/time, and contact consent directly from the estimate flow.</li>
          <li>Print or export a clean branded quote PDF with company, rep, phone, and email details.</li>
          <li>Store each opportunity as a separate dated CRM job record.</li>
        </ul>
      </section>
    </div>
  );
}
