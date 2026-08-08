import { ArrowRight, Check, Facebook, Hammer, House, Instagram, LogIn, Music2, Paintbrush, Ruler, ShieldCheck, Youtube } from "lucide-react";
import { useState } from "react";
import { RepProfile } from "../types";

interface LandingPageProps {
  repProfile: RepProfile;
  onOpenQuote: () => void;
  onNavigate: (view: "gallery" | "podcast" | "financing" | "contact" | "careers") => void;
  onLogin: () => void;
}

const services = [
  { title: "Remodeling & Renovation", body: "Kitchens, bathrooms, basements, interiors, and complete property improvements.", details: ["Scope and layout planning", "Finish and material coordination", "Organized construction phases"] },
  { title: "Painting & Finishes", body: "Detailed preparation and durable interior or exterior finishes.", details: ["Surface repair and preparation", "Interior and exterior coatings", "Trim, doors, and detailed finishes"] },
  { title: "Flooring & Carpentry", body: "Flooring installation, trim, doors, decks, fences, and finish carpentry.", details: ["Subfloor and site evaluation", "Accurate cuts and transitions", "Durable interior and exterior woodwork"] },
  { title: "Repairs & Restoration", body: "Drywall, storm and insurance repairs, property maintenance, and punch-list work.", details: ["Damage and priority assessment", "Clear repair recommendations", "Final inspection and cleanup"] },
  { title: "Commercial Improvements", body: "Tenant improvements, office renovations, retail build-outs, and facility repairs.", details: ["Business-conscious scheduling", "Multi-trade scope coordination", "Progress communication and closeout"] },
  { title: "General Contracting", body: "Project planning, construction coordination, custom scopes, and new construction.", details: ["Detailed project roadmap", "Labor and material coordination", "Quality checks through completion"] },
];

const steps = ["Schedule your consultation", "Receive a detailed estimate", "Plan materials and schedule", "Build with care", "Complete the final walkthrough"];

export function LandingPage({ repProfile, onOpenQuote, onNavigate, onLogin }: LandingPageProps) {
  const [activeService, setActiveService] = useState(0);
  return (
    <div className="brand-home">
      <section className="brand-hero">
        <div className="brand-hero__veil" />
        <div className="brand-hero__content">
          <p className="brand-kicker">Decatur & Central Illinois</p>
          <span className="logo-frame logo-frame--hero">
            <img src="/davids-contracting-logo-2026.webp" className="brand-hero__logo" alt="David's Contracting — Built Right. Built to Last." />
          </span>
          <h2>Built right.<br />Built to last.</h2>
          <p>Quality craftsmanship, honest service, and reliable results for homes and businesses across Central Illinois.</p>
          <div className="brand-actions">
            <button className="brand-button" onClick={onOpenQuote}>Request a free estimate <ArrowRight size={17} /></button>
            <button className="brand-button brand-button--quiet" onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}>View our services</button>
          </div>
        </div>
        <div className="brand-hero__line"><span>Residential</span><span>Commercial</span><span>Repairs</span><span>Renovations</span></div>
      </section>

      <section className="brand-intro">
        <div><p className="brand-kicker">Your local contracting partner</p><h2>Every successful project begins with trust.</h2></div>
        <div><p>We approach every property with professionalism, dependable communication, and attention to detail. From a single-room renovation to storm repairs or a complete commercial improvement, our work is organized around your goals.</p><p>Our mission is to build lasting relationships—not just structures.</p></div>
      </section>

      <section className="brand-services" id="services">
        <header><p className="brand-kicker">Complete contracting solutions</p><h2>One dependable team.<br />Work that holds up.</h2></header>
        <div className="brand-services__list">
          {services.map((service, index) => {
            const expanded = activeService === index;
            return <article key={service.title} className={expanded ? "is-expanded" : ""}>
              <button type="button" aria-expanded={expanded} aria-controls={`service-detail-${index}`} onClick={() => setActiveService(expanded ? -1 : index)}>
                <span>0{index + 1}</span><div><h3>{service.title}</h3><p>{service.body}</p></div><ArrowRight size={18} />
              </button>
              <div className="brand-service-detail" id={`service-detail-${index}`} hidden={!expanded}>
                <p>What you can expect</p><ul>{service.details.map((detail) => <li key={detail}><Check size={15} />{detail}</li>)}</ul>
                <button type="button" className="brand-service-cta" onClick={onOpenQuote}>Build an estimate <ArrowRight size={15} /></button>
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="brand-proof">
        <figure className="brand-proof__visual"><img src="/integrity-trust-homepage.webp" alt="A contractor and homeowner reviewing a detailed renovation plan together" loading="lazy" decoding="async" /><figcaption><ShieldCheck size={30} /><span><strong>Built on integrity</strong><small>Clear planning. Accountable work. Respectful service.</small></span></figcaption></figure>
        <div className="brand-proof__story"><p className="brand-kicker">Why David's Contracting</p><h2>Confidence through quality.</h2><div className="brand-proof__copy"><p>Your project deserves more than a quick price and a vague timeline. We organize each scope around clear expectations, thoughtful preparation, reliable communication, and workmanship designed to last.</p><p>As a locally focused contractor, we understand that trust is earned in the details—from arriving prepared to protecting your property and closing out the work responsibly.</p></div><ul>{["Straightforward, detailed proposals", "Respect for your property, budget, and time", "Progress communication throughout the work", "Thoughtful material and finish planning", "Quality checks before project closeout", "A clean, documented final walkthrough"].map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul><button className="brand-button" onClick={onOpenQuote}>Plan your project <ArrowRight size={17} /></button></div>
      </section>

      <section className="brand-process">
        <header><p className="brand-kicker">A transparent process</p><h2>Know what happens next.</h2></header>
        <p className="brand-process__intro">A well-run project should never leave you wondering what comes next. Our five-stage process keeps decisions, expectations, and communication visible from the first conversation through the final walkthrough.</p>
        <ol>{steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{step}</strong><p>{["Tell us what you want to improve, your priorities, timing, and any concerns.","We organize the proposed work into a clear scope with practical budget expectations.","Selections, access needs, sequencing, and scheduling are reviewed before work begins.","The work progresses with care, communication, and attention to the agreed scope.","We review the completed work together, document final details, and close out responsibly."][index]}</p></div></li>)}</ol>
      </section>

      <section className="brand-work">
        <div><Paintbrush size={28} /><House size={28} /><Hammer size={28} /><Ruler size={28} /></div>
        <p className="brand-kicker">Past work & project planning</p>
        <h2>See the care behind the work.</h2>
        <p>Explore completed projects, then use our guided estimator to organize your ideas before we talk.</p>
        <div className="brand-actions"><button className="brand-button" onClick={() => onNavigate("gallery")}>View gallery</button><button className="brand-button brand-button--quiet" onClick={() => onNavigate("financing")}>Explore financing</button></div>
      </section>

      <section className="brand-cta">
        <p className="brand-kicker">Ready to start?</p><h2>Let's build something great together.</h2>
        <p>Your home or business deserves craftsmanship from a contractor you can trust.</p>
        <div className="brand-actions"><button className="brand-button" onClick={onOpenQuote}>Request your free estimate</button><a className="brand-button brand-button--quiet" href={`tel:${repProfile.phone.replace(/[^0-9]/g, "")}`}>Call {repProfile.phone}</a></div>
      </section>

      <footer className="brand-footer">
        <span className="logo-frame logo-frame--footer"><img src="/davids-contracting-logo-2026.webp" alt="David's Contracting" /></span>
        <div><strong>Built Right. Built to Last.</strong><p>Professional general contracting serving Decatur and Central Illinois.</p><a href={`mailto:${repProfile.email}`}>{repProfile.email}</a><a href={`tel:${repProfile.phone.replace(/[^0-9]/g, "")}`}>{repProfile.phone}</a></div>
        <div className="brand-footer__links"><button onClick={() => onNavigate("contact")}>Contact</button><button onClick={() => onNavigate("careers")}>Careers</button><button onClick={() => onNavigate("gallery")}>Gallery</button><button onClick={() => onNavigate("podcast")}>Foundation First Podcast</button><button onClick={() => onNavigate("financing")}>Financing</button><button className="brand-footer__login" onClick={onLogin}><LogIn size={16} /> Team &amp; Owner Login</button></div>
        <div className="brand-socials" aria-label="Social media"><button title="Instagram profile coming soon" aria-label="Instagram profile coming soon"><Instagram/></button><button title="Facebook profile coming soon" aria-label="Facebook profile coming soon"><Facebook/></button><button title="TikTok profile coming soon" aria-label="TikTok profile coming soon"><Music2/></button><button title="YouTube profile coming soon" aria-label="YouTube profile coming soon"><Youtube/></button></div>
      </footer>
    </div>
  );
}
