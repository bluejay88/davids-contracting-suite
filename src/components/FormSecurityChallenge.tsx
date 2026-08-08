import { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";

export type FormSecurityPayload = {
  website: string;
  challengeAction: string;
  challengeId: string;
  challengeIssuedAt: number;
  challengeA: number;
  challengeB: number;
  challengeAnswer: number;
  challengeSignature: string;
};

type Challenge = Omit<FormSecurityPayload, "website" | "challengeAnswer">;

export function useFormSecurity(action: "login" | "estimate" | "contact" | "financing" | "careers" | "assistant" = "contact") {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const response = await fetch(`/api/security/challenge?action=${encodeURIComponent(action)}`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || "Security check is unavailable.");
      setChallenge({ challengeAction: payload.action, challengeId: payload.challengeId, challengeIssuedAt: payload.issuedAt, challengeA: payload.a, challengeB: payload.b, challengeSignature: payload.signature });
    } catch (reason) {
      setChallenge(null);
      setError(reason instanceof Error ? reason.message : "Security check is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [action]);

  const securityPayload: FormSecurityPayload = {
    website,
    challengeAction: action,
    challengeId: challenge?.challengeId || "",
    challengeIssuedAt: challenge?.challengeIssuedAt || 0,
    challengeA: challenge?.challengeA || 0,
    challengeB: challenge?.challengeB || 0,
    challengeAnswer: Number(answer),
    challengeSignature: challenge?.challengeSignature || "",
  };

  const securityFields = <div className="form-security" aria-label="Submission security check">
    <ShieldCheck size={21} aria-hidden="true" />
    <div><strong>Security verification</strong><span>Server-issued verification helps protect this form from automated submissions.</span></div>
    <label className="form-security__challenge">{loading ? "Preparing verification…" : challenge ? `What is ${challenge.challengeA} + ${challenge.challengeB}?` : "Verification unavailable"}
      <input required disabled={loading || !challenge} inputMode="numeric" pattern="[0-9]*" value={answer} onChange={(event) => setAnswer(event.target.value)} aria-label="Security verification answer" />
    </label>
    <button type="button" className="form-security__refresh" onClick={() => void refresh()} disabled={loading} aria-label="Refresh security verification"><RefreshCw size={16} /></button>
    <label className="form-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
    {error ? <p className="form-security__error" role="status">{error}</p> : null}
  </div>;

  return { securityPayload, securityFields, refresh };
}
