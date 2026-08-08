import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";

export type FormSecurityPayload = {
  website: string;
  formStartedAt: number;
  challengeA: number;
  challengeB: number;
  challengeAnswer: number;
};

export function useFormSecurity() {
  const challenge = useMemo(() => ({
    a: Math.floor(Math.random() * 7) + 2,
    b: Math.floor(Math.random() * 7) + 2,
    startedAt: Date.now(),
  }), []);
  const [answer, setAnswer] = useState("");
  const [website, setWebsite] = useState("");

  const securityPayload: FormSecurityPayload = {
    website,
    formStartedAt: challenge.startedAt,
    challengeA: challenge.a,
    challengeB: challenge.b,
    challengeAnswer: Number(answer),
  };

  const securityFields = <div className="form-security" aria-label="Submission security check">
    <ShieldCheck size={21} aria-hidden="true" />
    <div><strong>Security verification</strong><span>This check helps prevent automated spam and fraudulent submissions.</span></div>
    <label className="form-security__challenge">What is {challenge.a} + {challenge.b}?
      <input required inputMode="numeric" pattern="[0-9]*" value={answer} onChange={(event) => setAnswer(event.target.value)} aria-label={`Security question: what is ${challenge.a} plus ${challenge.b}?`} />
    </label>
    <label className="form-honeypot" aria-hidden="true">Website
      <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
    </label>
  </div>;

  return { securityPayload, securityFields };
}
