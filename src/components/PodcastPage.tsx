import { CalendarDays, Clock3, Headphones, MessageCircleQuestion, Play, Radio, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { PodcastEpisode, PodcastEvent } from "../types";

const ideas = [
  ["The Biggest Mistakes Homeowners Make Before Hiring a Contractor", "The questions, documents, and warning signs to understand before work begins."],
  ["What Does a Remodel Really Cost in 2026?", "A practical conversation about scope, allowances, labor, and contingency."],
  ["Kitchen Remodels That Actually Increase Home Value", "Focus renovation dollars on function, durability, and broad buyer appeal."],
  ["Bathroom Renovations Worth Every Dollar", "Where waterproofing, ventilation, fixtures, and layout deliver lasting value."],
  ["When Should You Remodel Instead of Moving?", "Compare renovation potential, neighborhood value, disruption, and moving costs."],
  ["The Truth About Cheap Contractors", "How low bids can become expensive problems."],
  ["What Really Happens Behind the Scenes on a Construction Project?", "A walk through planning, permits, scheduling, and inspections."],
  ["Home Maintenance Tips That Could Save You Thousands", "Small checks that help prevent moisture, structural, and mechanical damage."],
  ["Top 10 DIY Projects You Should Never Attempt Yourself", "Know when safety, permits, and specialist experience matter."],
  ["Signs Your House Is Trying to Tell You Something", "Cracks, leaks, sticking doors, moisture, settling, and electrical warnings."],
  ["Storm Damage: What Insurance Doesn't Tell You", "Documentation, emergency steps, estimates, and navigating the repair process."],
  ["The Anatomy of a Home Inspection", "What inspectors look for, what findings mean, and how to prioritize repairs."],
  ["Building Your Dream Deck", "Materials, permits, maintenance, safety, and design ideas."],
  ["How to Budget for a Renovation Without Losing Sleep", "Build a realistic range, contingency, and decision plan."],
  ["What Every First-Time Homeowner Needs to Know", "A grounded guide to maintenance, improvements, and contractor relationships."],
  ["The Future of Smart Homes", "Security, energy savings, automation, and planning ahead."],
  ["Building Green Without Breaking the Bank", "Energy-efficient upgrades with practical returns."],
  ["Contractor Horror Stories (and How to Avoid Them)", "Anonymous lessons, costly red flags, and better ways to protect a project."],
  ["How We Transformed This House", "A case study covering the plan, the work, the surprises, and the final result."],
  ["Ask the Contractor", "David answers real homeowner questions about repairs, remodeling, and project planning."],
] as const;

export const examplePodcastEpisodes: PodcastEpisode[] = ideas.map(([title, description], index) => ({
  id: `foundation-first-${index + 1}`, episodeNumber: index + 1, title, description,
  format: index % 3 === 0 ? "Audio & Video" : index % 2 === 0 ? "Video" : "Audio",
  mediaUrl: "", thumbnailUrl: "", duration: `${28 + (index % 6) * 4} min`, publishedAt: "",
  status: index === 0 ? "Published" : "Draft", featured: index === 0,
}));

export const examplePodcastEvents: PodcastEvent[] = [
  { id: "podcast-live-1", title: "Ask the Contractor: Live Q&A", startsAt: "2026-08-20T18:00", durationMinutes: 45, format: "Live stream", watchUrl: "", description: "Bring your remodeling, maintenance, and contractor questions for a live conversation with David.", published: true },
  { id: "podcast-live-2", title: "What a Remodel Really Costs", startsAt: "2026-09-03T18:00", durationMinutes: 40, format: "Premiere", watchUrl: "", description: "A transparent breakdown of labor, materials, allowances, and contingency.", published: true },
];

const artworkPalettes = [
  ["#071b33", "#ff7900", "#f6efe3"], ["#173f52", "#f6b73c", "#f8f4eb"],
  ["#102d49", "#d95f24", "#dbe7eb"], ["#20332b", "#ff8d27", "#edf2e8"],
  ["#27243a", "#f28b30", "#efe8dd"], ["#0b3948", "#f4a261", "#e8f1f2"],
  ["#25364a", "#e9b44c", "#f4efe5"], ["#17324d", "#e76f51", "#edf4f5"],
  ["#302c2b", "#ff7b26", "#f4eadc"], ["#123b3d", "#f0a04b", "#e6f0ed"],
] as const;

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character] || character));
}

function titleLines(title: string) {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  let wordIndex = 0;
  for (; wordIndex < words.length; wordIndex += 1) {
    const candidate = `${current} ${words[wordIndex]}`.trim();
    if (candidate.length > 24 && current) {
      lines.push(current);
      current = words[wordIndex];
    } else current = candidate;
    if (lines.length === 2) break;
  }
  if (lines.length < 3 && current) lines.push(current);
  if (wordIndex < words.length - 1) lines[2] = `${lines[2]?.replace(/[.,:;!?]+$/, "") || ""}…`;
  return lines.slice(0, 3);
}

/** Generates an original, scalable episode cover when an Owner has not supplied artwork. */
export function podcastThumbnailUrl(episode: PodcastEpisode) {
  if (episode.thumbnailUrl.trim()) return episode.thumbnailUrl;
  const number = Math.max(1, episode.episodeNumber);
  const [ink, accent, paper] = artworkPalettes[(number - 1) % artworkPalettes.length];
  const motifs = [
    `<path d="M610 96 790 238H700v144H520V238h-90z" fill="none" stroke="${accent}" stroke-width="24"/><path d="M548 382V270h124v112" fill="none" stroke="${paper}" stroke-width="15"/>`,
    `<circle cx="670" cy="242" r="136" fill="none" stroke="${accent}" stroke-width="25"/><path d="M670 126v232M554 242h232M588 160l164 164M752 160 588 324" stroke="${paper}" stroke-width="12"/>`,
    `<path d="M520 330h300M550 280h240M580 230h180M610 180h120" stroke="${accent}" stroke-width="30"/><circle cx="670" cy="122" r="34" fill="${paper}"/>`,
    `<path d="M500 340 670 100l170 240z" fill="none" stroke="${accent}" stroke-width="26"/><path d="M568 340V244h204v96M634 244v96" fill="none" stroke="${paper}" stroke-width="14"/>`,
    `<path d="M525 148h290v190H525z" fill="none" stroke="${accent}" stroke-width="25"/><path d="M565 298 636 222l55 52 55-82 40 106M588 186h72" fill="none" stroke="${paper}" stroke-width="14"/>`,
  ];
  const lines = titleLines(episode.title).map((line, index) => `<tspan x="64" dy="${index ? 52 : 0}">${escapeXml(line)}</tspan>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="506" viewBox="0 0 900 506"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${ink}"/><stop offset="1" stop-color="#061525"/></linearGradient><pattern id="p" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M0 34 34 0" stroke="${paper}" stroke-opacity=".055" stroke-width="2"/></pattern></defs><rect width="900" height="506" fill="url(#g)"/><rect width="900" height="506" fill="url(#p)"/><rect width="18" height="506" fill="${accent}"/>${motifs[(number - 1) % motifs.length]}<text x="64" y="66" fill="${accent}" font-family="Arial,sans-serif" font-size="19" font-weight="700" letter-spacing="4">FOUNDATION FIRST</text><text x="64" y="148" fill="${paper}" font-family="Arial,sans-serif" font-size="39" font-weight="800">${lines}</text><text x="64" y="454" fill="${paper}" font-family="Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="2">DAVID'S CONTRACTING</text><text x="840" y="454" text-anchor="end" fill="${accent}" font-family="Arial,sans-serif" font-size="54" font-weight="900">${String(number).padStart(2, "0")}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function PodcastPage({ episodes, events, onNavigate }: { episodes: PodcastEpisode[]; events: PodcastEvent[]; onNavigate: (view: "quote" | "contact") => void }) {
  const archive = episodes.length ? episodes : examplePodcastEpisodes;
  const schedule = events.length ? events.filter(event => event.published) : examplePodcastEvents;
  const [selected, setSelected] = useState(archive.find(item => item.featured) || archive[0]);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => archive.filter(item => `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase())), [archive, query]);
  return <div className="podcast-page">
    <header className="podcast-hero"><div className="podcast-hero__signal" aria-hidden="true"><i/><i/><i/><i/><i/></div><div><p className="brand-kicker">A David's Contracting original</p><h1>Foundation<br/>First</h1><p className="podcast-tagline">Building stronger homes… and smarter homeowners.</p><div className="brand-actions"><a className="brand-button" href="#episodes"><Headphones size={17}/> Explore episodes</a><a className="brand-button brand-button--quiet" href="#schedule"><Radio size={17}/> See the live schedule</a></div></div></header>
    <main>
      <section className="podcast-intro"><div className="podcast-intro__image"><img src="/foundation-first-podcast-cover.png" alt="Foundation First Podcast by David's Contracting" loading="lazy" decoding="async" /></div><div className="podcast-intro__copy"><p className="brand-kicker">Welcome to the show</p><h2>Construction meets real conversation.</h2><p>Welcome to <em>The Foundation First Podcast</em>, brought to you by David's Contracting.</p><p>Whether you're remodeling your dream home, investing in property, or simply trying to understand what your contractor is really talking about, this is where construction meets honest, useful conversation.</p><p>I'm David. Each week, we share expert advice, real project stories, homeowner tips, and behind-the-scenes insight from the world of construction. Let's build something great together.</p></div></section>
      <section className="podcast-feature" aria-label="Featured episode"><div className="podcast-art"><img src={podcastThumbnailUrl(selected)} alt={`Episode ${selected.episodeNumber}: ${selected.title}`}/><span>EP {String(selected.episodeNumber).padStart(2,"0")}</span></div><div><p className="brand-kicker">Featured conversation</p><h2>{selected.title}</h2><p>{selected.description}</p><div className="podcast-meta"><span><Clock3 size={16}/>{selected.duration}</span><span>{selected.format.includes("Video")?<Video size={16}/>:<Headphones size={16}/>} {selected.format}</span></div>{selected.mediaUrl ? (selected.format === "Audio" ? <audio controls src={selected.mediaUrl}/> : <video controls poster={podcastThumbnailUrl(selected)} src={selected.mediaUrl}/>) : <div className="podcast-coming"><Play size={20}/><span><b>Demo episode preview</b><small>Add the approved audio or video URL in the Owner Dashboard to publish playback.</small></span></div>}</div></section>
      <section id="episodes" className="podcast-archive"><header><div><p className="brand-kicker">The archive</p><h2>Stories, skills, and straight answers.</h2></div><label><span className="sr-only">Search episodes</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search the archive…"/></label></header><div>{visible.map(episode=><button key={episode.id} onClick={()=>setSelected(episode)} className={selected.id===episode.id?"is-active":""} aria-pressed={selected.id===episode.id}><img src={podcastThumbnailUrl(episode)} alt="" loading="lazy"/><div><span>Episode {String(episode.episodeNumber).padStart(2,"0")}</span><h3>{episode.title}</h3><p>{episode.description}</p></div><Play size={20}/></button>)}</div></section>
      <section id="schedule" className="podcast-schedule"><header><p className="brand-kicker">Upcoming calendar</p><h2>Join the next conversation live.</h2></header><div className="podcast-calendar"><div className="podcast-calendar__month"><CalendarDays/><strong>Upcoming broadcasts</strong><p>Times shown in Central Time. Schedule updates are published by the Owner team.</p></div><ol>{schedule.map(event=>{const date=new Date(event.startsAt); return <li key={event.id}><time dateTime={event.startsAt}><b>{date.toLocaleDateString("en-US",{month:"short"})}</b><strong>{date.getDate()}</strong></time><div><small>{event.format} · {date.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})} CT</small><h3>{event.title}</h3><p>{event.description}</p>{event.watchUrl?<a href={event.watchUrl} target="_blank" rel="noreferrer">Open broadcast</a>:<span>Broadcast link coming soon</span>}</div></li>})}</ol></div></section>
      <section className="podcast-question"><MessageCircleQuestion size={44}/><div><p className="brand-kicker">Ask the contractor</p><h2>Your question could become the next episode.</h2><p>Send David a homeowner, repair, remodeling, or project-planning question. The team can follow up privately or answer it on a future show.</p></div><button className="brand-button" onClick={()=>onNavigate("contact")}>Submit a question</button></section>
      <section className="podcast-cta"><p className="brand-kicker">Turn an idea into a plan</p><h2>Ready to talk about your project?</h2><div className="brand-actions"><button className="brand-button" onClick={()=>onNavigate("quote")}>Build an estimate</button><button className="brand-button brand-button--quiet" onClick={()=>onNavigate("contact")}>Contact David's Contracting</button></div></section>
    </main>
  </div>;
}
