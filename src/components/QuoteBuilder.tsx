import {
  Camera,
  ChevronDown,
  CircleHelp,
  Download,
  Mail,
  Mic,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { ChangeEvent, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { aidPrograms, categoryMeta, serviceTasks, suppliers } from "../data/catalog";
import { emailQuote } from "../lib/api";
import { useFormSecurity } from "./FormSecurityChallenge";
import { getAiAidPrograms, getAiMaterialPlan, getAiScopePlan, transcribeCapturedAudio } from "../lib/ai";
import {
  analyzeSpeechInput,
  analyzeUploadedImages,
  buildQuote,
  defaultQuoteBuildOptions,
  findSimilarHistoricalJobs,
  findTaskById,
  formatCurrency,
  suggestAidPrograms,
  suggestNextFollowUpDate,
  validateClientForEmail,
  validateClientForSave,
} from "../lib/estimates";
import { buildExecutiveEstimateDossierPdfBlob, buildQuotePdfBlob } from "../lib/pdf";
import {
  AiMaterialRecommendation,
  AiProgramRecommendation,
  AiScopePlan,
  AiTaskSuggestion,
  AppSettings,
  ClientIntake,
  CrmRecord,
  HistoricalJob,
  JobStatus,
  QuoteBuildOptions,
  QuoteResult,
  QuoteSelection,
  ServiceCategory,
} from "../types";

interface QuoteBuilderProps {
  settings: AppSettings;
  historicalJobs: HistoricalJob[];
  sessionRole: "public" | "staff" | "admin" | "developer";
  onSaveRecord: (record: CrmRecord, quote: QuoteResult, security?: Record<string, unknown>) => Promise<void>;
  onOpenAdmin: () => void;
}

interface BrowserSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface BrowserSpeechCtor {
  new (): BrowserSpeechRecognition;
}

type AiBusyState = null | "scope" | "programs" | "materials" | "transcribe";
type EstimateSectionId = "trades" | "helpers" | "client" | "tasks";
const formatUnitRate = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const defaultClientIntake = (repName: string): ClientIntake => ({
  firstName: "",
  lastName: "",
  address: "",
  city: "Decatur",
  state: "IL",
  zip: "62526",
  email: "",
  phone: "",
  budget: 0,
  emergencyIssues: "",
  requestedJobs: "",
  date: new Date().toISOString().slice(0, 10),
  jobStatus: "Prospecting/Negotiating",
  declineReason: "",
  declineOtherReason: "",
  notes: "",
  paymentCollected: false,
  paymentAmount: 0,
  assignedRep: repName,
  aidSuggestions: [],
  consentEmailContact: false,
  consentSmsContact: false,
  consentMarketing: false,
  consultationRequested: false,
  consultationDate: "",
  consultationTime: "",
  consultationNotes: "",
  consultationStatus: "None",
});

const newSelection = (taskId: string): QuoteSelection => ({
  taskId,
  quantity: 0,
  scopeNote: "",
  conditionMultiplier: 1,
  complexityMultiplier: 1,
});

const toTaskSuggestions = (selections: QuoteSelection[]): AiTaskSuggestion[] =>
  selections
    .filter((selection) => selection.quantity > 0)
    .map((selection) => ({
      taskId: selection.taskId,
      quantity: selection.quantity,
      conditionMultiplier: selection.conditionMultiplier,
      complexityMultiplier: selection.complexityMultiplier,
      scopeNote: selection.scopeNote,
      rationale: "Current quote selection.",
    }));

const providerLabel = (settings: AppSettings) => {
  if (!settings.automationEnabled) return "Basic online estimator (automation paused)";
  if (settings.aiProvider === "openai-direct") {
    return settings.hasOpenAiApiKey || settings.hasAiGateway
      ? `${settings.hasAiGateway ? "Netlify AI Gateway" : "OpenAI direct"} (${settings.openAiModel})`
      : "OpenAI direct configured without an API key";
  }

  if (settings.aiProvider === "anthropic-direct") {
    return settings.hasAnthropicApiKey ? `Anthropic (${settings.anthropicModel})` : "Anthropic configured without an API key";
  }

  if (settings.aiProvider === "webhook") {
    return settings.hasAiWebhook ? "Webhook AI" : "Webhook AI configured without a URL";
  }

  return "Offline heuristic AI";
};

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const quickStartBundles: Array<{
  id: string;
  title: string;
  description: string;
  categories: ServiceCategory[];
  tasks: string[];
}> = [
  {
    id: "bundle-paint-refresh",
    title: "Interior Paint Refresh",
    description: "Walls, ceilings, and trim for occupied-room repaint scopes.",
    categories: ["painting"],
    tasks: ["paint-interior-walls", "paint-ceilings", "paint-trim"],
  },
  {
    id: "bundle-floor-repair",
    title: "Kitchen Floor Stabilization",
    description: "LVP plus subfloor repair for soft-floor scenarios.",
    categories: ["flooring", "handiwork"],
    tasks: ["floor-lvp", "subfloor-repair", "handy-caulking"],
  },
  {
    id: "bundle-roof-leak",
    title: "Roof Leak Response",
    description: "Patch repair, flashing, and soffit/fascia review.",
    categories: ["roofing", "painting"],
    tasks: ["roof-repair", "roof-soffit-fascia", "paint-ceilings"],
  },
  {
    id: "bundle-hvac-safety",
    title: "HVAC + Safety Tune-Up",
    description: "Tune-up, thermostat, and outlet/switch troubleshooting.",
    categories: ["electrical-hvac"],
    tasks: ["ehvac-tuneup", "ehvac-thermostat", "ehvac-outlet"],
  },
  {
    id: "bundle-punch-list",
    title: "Punch-List Handiwork",
    description: "Drywall patch, caulking, fixture swap, and hourly small-job work.",
    categories: ["handiwork", "electrical-hvac"],
    tasks: ["handy-drywall-patch", "handy-caulking", "handy-hourly", "ehvac-outlet"],
  },
];

export function QuoteBuilder({ settings, historicalJobs, sessionRole, onSaveRecord, onOpenAdmin }: QuoteBuilderProps) {
  const { securityPayload: estimateSecurityPayload, securityFields: estimateSecurityFields } = useFormSecurity("estimate");
  const [activeCategories, setActiveCategories] = useState<ServiceCategory[]>(["painting"]);
  const [openTaskCategory, setOpenTaskCategory] = useState<ServiceCategory | null>("painting");
  const [clientIntake, setClientIntake] = useState<ClientIntake>(() => defaultClientIntake(settings.repProfile.repName));
  const [projectTitle, setProjectTitle] = useState("");
  const [projectSummary, setProjectSummary] = useState("");
  const [selectionMap, setSelectionMap] = useState<Record<string, QuoteSelection>>({});
  const [quoteOptions, setQuoteOptions] = useState<QuoteBuildOptions>(() => defaultQuoteBuildOptions(settings));
  const [speechTranscript, setSpeechTranscript] = useState("");
  const [speechFeedback, setSpeechFeedback] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [aiBusy, setAiBusy] = useState<AiBusyState>(null);
  const [aiError, setAiError] = useState("");
  const [aiScopePlan, setAiScopePlan] = useState<AiScopePlan | null>(null);
  const [livePrograms, setLivePrograms] = useState<AiProgramRecommendation[]>([]);
  const [liveMaterials, setLiveMaterials] = useState<AiMaterialRecommendation[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [crmDraftId, setCrmDraftId] = useState<string | null>(null);
  const [openMajorSection, setOpenMajorSection] = useState<EstimateSectionId | null>("trades");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isInternalUser = sessionRole === "staff" || sessionRole === "admin";

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    setClientIntake((current) =>
      current.assignedRep === settings.repProfile.repName ? current : { ...current, assignedRep: settings.repProfile.repName },
    );
  }, [settings.repProfile.repName]);

  useEffect(() => {
    setQuoteOptions((current) => ({
      ...defaultQuoteBuildOptions(settings),
      ...current,
      contingencyPct: current.contingencyPct || settings.defaultContingencyPct,
      travelOverrideFee: current.travelOverrideEnabled ? current.travelOverrideFee : settings.travelFee,
    }));
  }, [settings]);

  useEffect(() => {
    setQuote(null);
  }, [selectionMap, projectTitle, projectSummary, quoteOptions, clientIntake.budget]);

  const availableTasks = useMemo(
    () => serviceTasks.filter((task) => activeCategories.includes(task.category)),
    [activeCategories],
  );

  useEffect(() => {
    if (openTaskCategory && !activeCategories.includes(openTaskCategory)) {
      setOpenTaskCategory(activeCategories[0] ?? null);
    }
  }, [activeCategories, openTaskCategory]);

  const selections = useMemo(
    () =>
      Object.values(selectionMap).filter((selection) => {
        const task = findTaskById(selection.taskId);
        return Boolean(task) && activeCategories.includes(task!.category);
      }),
    [activeCategories, selectionMap],
  );

  const selectedTaskSuggestions = useMemo(() => toTaskSuggestions(selections), [selections]);
  const speechAnalysis = useMemo(() => analyzeSpeechInput(speechTranscript), [speechTranscript]);
  const imageAnalysis = useMemo(
    () => analyzeUploadedImages(imageFiles, activeCategories),
    [activeCategories, imageFiles],
  );
  const similarJobs = useMemo(() => findSimilarHistoricalJobs(selections, historicalJobs), [historicalJobs, selections]);
  const recommendedAid = useMemo(
    () => suggestAidPrograms(clientIntake, selections),
    [clientIntake, selections],
  );
  const availableConsultationDays = useMemo(
    () => settings.availabilitySchedule.filter((slot) => slot.enabled).map((slot) => slot.day),
    [settings.availabilitySchedule],
  );
  const consultationAvailabilitySummary = useMemo(
    () =>
      settings.availabilitySchedule
        .filter((slot) => slot.enabled)
        .map((slot) => `${slot.day.slice(0, 3)} ${slot.start}-${slot.end}`)
        .join(" | "),
    [settings.availabilitySchedule],
  );
  const selectedConsultationSlot = useMemo(() => {
    if (!clientIntake.consultationDate) {
      return null;
    }

    const weekday = weekdayNames[new Date(`${clientIntake.consultationDate}T12:00:00`).getDay()];
    return settings.availabilitySchedule.find((slot) => slot.day === weekday) ?? null;
  }, [clientIntake.consultationDate, settings.availabilitySchedule]);
  const consultationScheduleIssue = useMemo(() => {
    if (!clientIntake.consultationRequested || !clientIntake.consultationDate) {
      return "";
    }

    if (settings.consultationBlackoutDates.includes(clientIntake.consultationDate)) {
      return "That consultation date is currently blocked in the contractor calendar.";
    }

    if (!selectedConsultationSlot || !selectedConsultationSlot.enabled) {
      const weekday = weekdayNames[new Date(`${clientIntake.consultationDate}T12:00:00`).getDay()];
      return `Consultations are not currently available on ${weekday}.`;
    }

    if (
      clientIntake.consultationTime &&
      (clientIntake.consultationTime < selectedConsultationSlot.start ||
        clientIntake.consultationTime > selectedConsultationSlot.end)
    ) {
      return `Preferred time needs to fall between ${selectedConsultationSlot.start} and ${selectedConsultationSlot.end}.`;
    }

    return "";
  }, [
    clientIntake.consultationDate,
    clientIntake.consultationRequested,
    clientIntake.consultationTime,
    selectedConsultationSlot,
    settings.consultationBlackoutDates,
  ]);
  const consultationSuggestions = useMemo(() => {
    const suggestions: Array<{ date: string; time: string; label: string }> = [];

    for (let offset = 1; offset <= 21 && suggestions.length < 6; offset += 1) {
      const candidateDate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
      const candidateIso = candidateDate.toISOString().slice(0, 10);
      if (settings.consultationBlackoutDates.includes(candidateIso)) {
        continue;
      }

      const weekday = weekdayNames[candidateDate.getDay()];
      const slot = settings.availabilitySchedule.find((item) => item.day === weekday && item.enabled);
      if (!slot) {
        continue;
      }

      suggestions.push({
        date: candidateIso,
        time: slot.start,
        label: `${weekday.slice(0, 3)} ${candidateDate.getMonth() + 1}/${candidateDate.getDate()} at ${slot.start}`,
      });
    }

    return suggestions;
  }, [settings.availabilitySchedule, settings.consultationBlackoutDates]);
  const inferredRequestedJobs = useMemo(() => {
    const labels = selections
      .filter((selection) => selection.quantity > 0)
      .map((selection) => findTaskById(selection.taskId)?.shortLabel || findTaskById(selection.taskId)?.name || "")
      .filter(Boolean);
    return Array.from(new Set(labels)).join(", ");
  }, [selections]);

  const displayedPrograms = livePrograms.length
    ? livePrograms
    : aiScopePlan?.programs.length
      ? aiScopePlan.programs
      : (recommendedAid.length ? recommendedAid : aidPrograms.slice(0, 2)).map((program) => ({
          name: program.name,
          provider: program.provider,
          focus: program.focus,
          eligibilityHint: program.eligibilityHint,
          url: program.url,
          reasoning: program.notes,
          source: "curated" as const,
        }));

  const displayedMaterials = liveMaterials.length
    ? liveMaterials
    : aiScopePlan?.materials.length
      ? aiScopePlan.materials
      : quote?.materialRollup.map((material, index) => ({
          name: material.name,
          taskId: quote.breakdown[index]?.taskId ?? quote.breakdown[0]?.taskId ?? "paint-interior-walls",
          quantity: material.totalQuantity,
          unit: material.unit,
          supplierId: material.supplierIds[0] ?? "",
          supplierName:
            suppliers.find((supplier) => supplier.id === material.supplierIds[0])?.name ?? "Local supplier",
          estimatedLow: material.lowTotal,
          estimatedHigh: material.highTotal,
          sourceNote: "Quote rollup",
          reasoning: "Derived from the current estimate material rollup.",
        })) ?? [];

  const updateSelection = (taskId: string, patch: Partial<QuoteSelection>) => {
    setSelectionMap((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? newSelection(taskId)),
        ...patch,
      },
    }));
  };

  const updateClientField = <K extends keyof ClientIntake>(key: K, value: ClientIntake[K]) => {
    setClientIntake((current) => {
      const next = { ...current, [key]: value };

      if (key === "paymentCollected") {
        if (value) {
          next.jobStatus = "In-Progress";
        } else if (next.jobStatus !== "Declined" && next.jobStatus !== "Completed") {
          next.jobStatus = "Prospecting/Negotiating";
        }
      }

      return next;
    });
  };

  const handleCategoryToggle = (category: ServiceCategory) => {
    const isActive = activeCategories.includes(category);
    if (!isActive) setOpenTaskCategory(category);
    setActiveCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  };

  const updateQuoteOption = <K extends keyof QuoteBuildOptions>(key: K, value: QuoteBuildOptions[K]) => {
    setQuoteOptions((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const buildRecordPayload = (nextQuote: QuoteResult, clientSnapshot: ClientIntake): CrmRecord => {
    const nextRecordId = crmDraftId ?? `crm-${Date.now()}`;
    const normalizedRequestedJobs = clientSnapshot.requestedJobs.trim()
      ? clientSnapshot.requestedJobs
      : nextQuote.breakdown.map((line) => line.taskName).join(", ");
    const normalizedConsultationStatus = clientSnapshot.consultationRequested
      ? isInternalUser
        ? clientSnapshot.consultationStatus === "None"
          ? "Requested"
          : clientSnapshot.consultationStatus
        : "Requested"
      : clientSnapshot.consultationStatus;
    const paymentDue = Math.max(0, nextQuote.totals.totalHigh - clientSnapshot.paymentAmount);

    return {
      id: nextRecordId,
      source: isInternalUser ? "staff-estimate" : "public-estimate",
      client: {
        ...clientSnapshot,
        requestedJobs: normalizedRequestedJobs,
        aidSuggestions: displayedPrograms.map((program) => program.name),
        consultationStatus: normalizedConsultationStatus,
      },
      quoteHistory: [nextQuote],
      paymentDue,
      lastContactedAt: new Date().toISOString().slice(0, 10),
      nextFollowUpAt: suggestNextFollowUpDate(clientSnapshot, nextQuote),
      invoiceStatus:
        clientSnapshot.paymentCollected && paymentDue <= 0
          ? "Paid"
          : clientSnapshot.paymentCollected
            ? "Partially Paid"
            : "Open",
      crewLead: settings.repProfile.repName,
      documentation: imageFiles.map((file) => file.name),
    };
  };

  const persistRecord = async (nextQuote: QuoteResult, clientSnapshot: ClientIntake, automatic = false) => {
    const record = buildRecordPayload(nextQuote, clientSnapshot);

    setSaving(true);
    setActionMessage("");

    try {
      await onSaveRecord(record, nextQuote, isInternalUser ? {} : estimateSecurityPayload);
      setCrmDraftId(record.id);
      setActionMessage(
        automatic
          ? "Estimate refreshed and the CRM draft autosaved."
          : isInternalUser
            ? "Quote saved into CRM."
            : "Estimate request captured. The contractor can now review it inside the CRM.",
      );
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Quote save failed.");
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const applySuggestedTasks = (taskIds: string[], quantityHints: Record<string, number> = {}) => {
    startTransition(() => {
      const nextMap = { ...selectionMap };
      taskIds.forEach((taskId) => {
        const task = findTaskById(taskId);
        if (!task) {
          return;
        }

        if (!activeCategories.includes(task.category)) {
          setActiveCategories((current) =>
            current.includes(task.category) ? current : [...current, task.category],
          );
        }

        nextMap[taskId] = nextMap[taskId] ?? newSelection(taskId);
        if (nextMap[taskId].quantity <= 0) {
          nextMap[taskId].quantity = quantityHints[taskId] && quantityHints[taskId] > 0 ? quantityHints[taskId] : task.defaultQuantity;
        }
      });
      setSelectionMap(nextMap);
      setActionMessage("Suggested scope items were added. Review measurements and assumptions.");
    });
  };

  const applyBundle = (bundleId: string) => {
    const bundle = quickStartBundles.find((item) => item.id === bundleId);
    if (!bundle) {
      return;
    }

    setActiveCategories((current) => Array.from(new Set([...current, ...bundle.categories])));
    applySuggestedTasks(bundle.tasks);
    setProjectTitle((current) => current || bundle.title);
    setProjectSummary((current) => current || bundle.description);
  };

  const resetDraft = () => {
    setActiveCategories(["painting"]);
    setClientIntake(defaultClientIntake(settings.repProfile.repName));
    setProjectTitle("");
    setProjectSummary("");
    setSelectionMap({});
    setQuoteOptions(defaultQuoteBuildOptions(settings));
    setCrmDraftId(null);
    setSpeechTranscript("");
    setSpeechFeedback("");
    setImageFiles([]);
    setQuote(null);
    setAiError("");
    setAiScopePlan(null);
    setLivePrograms([]);
    setLiveMaterials([]);
    setActionMessage("Estimator draft cleared.");
  };

  const applyAiScopePlan = (plan: AiScopePlan) => {
    const nextSelectionMap = { ...selectionMap };

    plan.taskSuggestions.filter((suggestion) => findTaskById(suggestion.taskId)).forEach((suggestion) => {
      nextSelectionMap[suggestion.taskId] = {
        taskId: suggestion.taskId,
        quantity: suggestion.quantity,
        scopeNote: suggestion.scopeNote,
        conditionMultiplier: suggestion.conditionMultiplier,
        complexityMultiplier: suggestion.complexityMultiplier,
      };
    });

    setSelectionMap(nextSelectionMap);
    setActiveCategories((current) =>
      Array.from(
        new Set([
          ...current,
          ...plan.categories,
          ...plan.taskSuggestions
            .map((suggestion) => findTaskById(suggestion.taskId)?.category)
            .filter((value): value is ServiceCategory => Boolean(value)),
        ]),
      ),
    );
    setProjectTitle(plan.projectTitle || projectTitle);
    setProjectSummary(plan.projectSummary || projectSummary);
    setLivePrograms(plan.programs);
    setLiveMaterials(plan.materials);
    setAiScopePlan(plan);
    setClientIntake((current) => ({
      ...current,
      requestedJobs: plan.suggestedRequestedJobs || current.requestedJobs,
      emergencyIssues: plan.suggestedEmergencyIssues || current.emergencyIssues,
      notes: plan.suggestedNotes || current.notes,
      aidSuggestions: plan.programs.map((program) => program.name),
    }));
  };

  const releaseAudioCapture = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  };

  const handleGenerateQuote = async () => {
    if (selectedTaskCount === 0) {
      setQuote(null);
      setActionMessage("Add at least one scoped task or apply AI suggestions before building a quote.");
      return;
    }

    const nextQuote = buildQuote(projectTitle, projectSummary, selections, settings, clientIntake, quoteOptions);
    const normalizedRequestedJobs = clientIntake.requestedJobs.trim()
      ? clientIntake.requestedJobs
      : nextQuote.breakdown.map((line) => line.taskName).join(", ");
    const nextClientSnapshot = {
      ...clientIntake,
      requestedJobs: normalizedRequestedJobs,
      aidSuggestions: displayedPrograms.map((program) => program.name),
    };

    setQuote(nextQuote);
    setProjectTitle(nextQuote.projectTitle);
    setProjectSummary(nextQuote.projectSummary);
    setClientIntake(nextClientSnapshot);

    if (isInternalUser) {
      const validationIssues = validateClientForSave(nextClientSnapshot);
      if (validationIssues.length) {
        setActionMessage(`Low/high estimate updated. Add the missing CRM detail to autosave: ${validationIssues[0]}`);
        return;
      }

      if (nextClientSnapshot.consultationRequested && consultationScheduleIssue) {
        setActionMessage(`Low/high estimate updated. ${consultationScheduleIssue}`);
        return;
      }

      try {
        await persistRecord(nextQuote, nextClientSnapshot, true);
        return;
      } catch {
        return;
      }
    }

    setActionMessage(
      nextQuote.healthChecks.find((item) => item.severity === "warning")?.message || "Low/high estimate updated.",
    );
  };

  const handleSpeechCapture = () => {
    const ctor =
      (window as Window & { SpeechRecognition?: BrowserSpeechCtor; webkitSpeechRecognition?: BrowserSpeechCtor })
        .SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: BrowserSpeechCtor }).webkitSpeechRecognition;

    if (!ctor) {
      setSpeechFeedback("Browser speech recognition is not available here. Use AI audio recording or paste the transcript.");
      return;
    }

    const recognition = new ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      setSpeechTranscript(transcript);
      setProjectSummary((current) => current || transcript);
      setSpeechFeedback("Browser speech capture finished. Run AI scope autofill to verify the measurements.");
    };
    recognition.onerror = (event) => {
      setSpeechFeedback(`Speech capture error: ${event.error}`);
    };
    recognition.onend = () => {
      setSpeechFeedback((current) => current || "Speech capture finished.");
    };
    recognition.start();
    setSpeechFeedback("Listening with browser speech recognition...");
  };

  const handleAudioUpload = async (audioFile: File) => {
    setAiBusy("transcribe");
    setAiError("");
    setSpeechFeedback("Transcribing recorded audio...");

    try {
      const transcript = await transcribeCapturedAudio(settings, audioFile);
      setSpeechTranscript(transcript);
      setProjectSummary((current) => current || transcript);
      setSpeechFeedback("AI transcription complete. Run AI scope autofill to convert it into quote items.");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Audio transcription failed.");
      setSpeechFeedback("AI transcription failed. You can still use browser speech capture or paste the transcript.");
    } finally {
      setAiBusy(null);
    }
  };

  const startAiRecording = async () => {
    if (!settings.automationEnabled || settings.aiProvider === "heuristic" || settings.aiProvider === "anthropic-direct" || (!settings.hasOpenAiApiKey && !settings.hasAiGateway && !settings.hasAiWebhook)) {
      setSpeechFeedback("Live AI transcription is not configured, so the app is falling back to browser speech capture.");
      handleSpeechCapture();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);

      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `scope-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
        releaseAudioCapture();
        setIsRecordingAudio(false);

        if (!blob.size) {
          setSpeechFeedback("No audio was captured. Try again in a quieter environment.");
          return;
        }

        await handleAudioUpload(file);
      };

      recorder.start();
      setSpeechFeedback("Recording audio for AI transcription...");
      setIsRecordingAudio(true);
      setAiError("");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Unable to access the microphone.");
      setSpeechFeedback("Microphone access failed.");
      releaseAudioCapture();
      setIsRecordingAudio(false);
    }
  };

  const stopAiRecording = () => {
    mediaRecorderRef.current?.stop();
    setSpeechFeedback("Stopping recording...");
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    setImageFiles(Array.from(event.target.files ?? []));
  };

  const handleAiScopeAutofill = async () => {
    setAiBusy("scope");
    setAiError("");

    try {
      const plan = await getAiScopePlan(settings, {
        clientIntake,
        activeCategories,
        speechTranscript,
        imageFiles,
        currentSelections: selections,
        historicalJobs,
      });
      applyAiScopePlan(plan);
      setActionMessage(`AI scope autofill applied using ${providerLabel(settings)}.`);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI scope autofill failed.");
    } finally {
      setAiBusy(null);
    }
  };

  const handleRefreshPrograms = async () => {
    setAiBusy("programs");
    setAiError("");

    try {
      const programs = await getAiAidPrograms(
        settings,
        clientIntake,
        aiScopePlan?.taskSuggestions.length ? aiScopePlan.taskSuggestions : selectedTaskSuggestions,
      );
      setLivePrograms(programs);
      setClientIntake((current) => ({
        ...current,
        aidSuggestions: programs.map((program) => program.name),
      }));
      setActionMessage(`Program recommendations refreshed using ${providerLabel(settings)}.`);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI program research failed.");
    } finally {
      setAiBusy(null);
    }
  };

  const handleRefreshMaterials = async () => {
    setAiBusy("materials");
    setAiError("");

    try {
      const materials = await getAiMaterialPlan(
        settings,
        clientIntake,
        aiScopePlan?.taskSuggestions.length ? aiScopePlan.taskSuggestions : selectedTaskSuggestions,
      );
      setLiveMaterials(materials);
      setActionMessage(`Material recommendations refreshed using ${providerLabel(settings)}.`);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI material research failed.");
    } finally {
      setAiBusy(null);
    }
  };

  const handleSaveToCrm = async () => {
    if (selectedTaskCount === 0) {
      setActionMessage("Add at least one scoped task before saving this quote to the CRM.");
      return;
    }

    const nextQuote = quote ?? buildQuote(projectTitle, projectSummary, selections, settings, clientIntake, quoteOptions);
    const normalizedRequestedJobs = clientIntake.requestedJobs.trim()
      ? clientIntake.requestedJobs
      : nextQuote.breakdown.map((line) => line.taskName).join(", ");
    const nextClientSnapshot = {
      ...clientIntake,
      requestedJobs: normalizedRequestedJobs,
      aidSuggestions: displayedPrograms.map((program) => program.name),
    };
    const validationIssues = validateClientForSave(nextClientSnapshot);
    if (validationIssues.length) {
      setActionMessage(validationIssues[0]);
      return;
    }

    if (!isInternalUser && !nextClientSnapshot.consentEmailContact && !nextClientSnapshot.consentSmsContact) {
      setActionMessage("Public estimate requests need at least one contact consent checkbox selected.");
      return;
    }

    if (nextClientSnapshot.consultationRequested && consultationScheduleIssue) {
      setActionMessage(consultationScheduleIssue);
      return;
    }

    setQuote(nextQuote);
    setProjectTitle(nextQuote.projectTitle);
    setProjectSummary(nextQuote.projectSummary);
    setClientIntake(nextClientSnapshot);
    await persistRecord(nextQuote, nextClientSnapshot);
  };

  const handleDownloadPdf = async () => {
    if (selectedTaskCount === 0) {
      setActionMessage("Add at least one scoped task before exporting a quote PDF.");
      return;
    }

    const nextQuote = quote ?? buildQuote(projectTitle, projectSummary, selections, settings, clientIntake, quoteOptions);
    setQuote(nextQuote);
    setProjectTitle(nextQuote.projectTitle);
    setProjectSummary(nextQuote.projectSummary);
    const pdfBlob = await buildQuotePdfBlob(nextQuote, clientIntake, settings);
    const url = URL.createObjectURL(pdfBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${clientIntake.lastName || "client"}-${nextQuote.projectTitle.replace(/\s+/g, "-").toLowerCase()}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
    setActionMessage("Customer estimate PDF downloaded.");
  };

  const handleDownloadExecutiveDossier = async () => {
    if (!isInternalUser || selectedTaskCount === 0) return;
    const nextQuote = quote ?? buildQuote(projectTitle, projectSummary, selections, settings, clientIntake, quoteOptions);
    const pdfBlob = await buildExecutiveEstimateDossierPdfBlob(nextQuote, clientIntake, settings);
    const url = URL.createObjectURL(pdfBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${clientIntake.lastName || "client"}-${nextQuote.projectTitle.replace(/\s+/g, "-").toLowerCase()}-executive-dossier.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
    setActionMessage("Confidential executive estimate dossier downloaded.");
  };

  const handleShareOrEmail = async () => {
    if (selectedTaskCount === 0) {
      setActionMessage("Add at least one scoped task before sharing or emailing a quote.");
      return;
    }

    const validationIssues = validateClientForEmail(clientIntake);
    if (validationIssues.length && clientIntake.email.trim()) {
      setActionMessage(validationIssues[0]);
      return;
    }

    const nextQuote = quote ?? buildQuote(projectTitle, projectSummary, selections, settings, clientIntake, quoteOptions);
    setQuote(nextQuote);
    setProjectTitle(nextQuote.projectTitle);
    setProjectSummary(nextQuote.projectSummary);
    const pdfBlob = await buildQuotePdfBlob(nextQuote, clientIntake, settings);
    const file = new File([pdfBlob], "davids-contracting-quote.pdf", { type: "application/pdf" });
    const shareTarget = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
      canShare?: (data: { files?: File[] }) => boolean;
    };

    if (settings.hasEmailWebhook && clientIntake.email.trim()) {
      try {
        const payload = await emailQuote(clientIntake, nextQuote, pdfBlob);
        setActionMessage(payload.message);
        return;
      } catch (error) {
        setActionMessage(error instanceof Error ? error.message : "Server-side quote email failed.");
      }
    }

    if (shareTarget.share && (!shareTarget.canShare || shareTarget.canShare({ files: [file] }))) {
      await shareTarget.share({
        title: `Quote for ${clientIntake.firstName} ${clientIntake.lastName}`,
        text: `David's Contracting estimate range: ${formatCurrency(nextQuote.totals.totalLow)} - ${formatCurrency(nextQuote.totals.totalHigh)}.`,
        files: [file],
      });
      setActionMessage("Quote share sheet opened.");
      return;
    }

    if (!clientIntake.email.trim()) {
      setActionMessage("Add a client email address or use a device share sheet before trying to email this quote.");
      return;
    }

    const subject = encodeURIComponent(`David's Contracting Quote - ${nextQuote.projectTitle}`);
    const body = encodeURIComponent(
      [
        `Hi ${clientIntake.firstName || "there"},`,
        "",
        `Your estimate range is ${formatCurrency(nextQuote.totals.totalLow)} to ${formatCurrency(nextQuote.totals.totalHigh)}.`,
        `Prepared by ${settings.repProfile.repName} | ${settings.repProfile.phone}`,
        "",
        "Download the PDF from this device and attach it to this email draft before sending.",
      ].join("\n"),
    );
    window.location.href = `mailto:${clientIntake.email}?subject=${subject}&body=${body}`;
    setActionMessage("Email draft opened. Attach the downloaded PDF if your mail app does not support file sharing directly.");
  };

  const selectedTaskCount = selections.filter((selection) => selection.quantity > 0).length;

  return (
    <div className="workspace" data-session-role={sessionRole}>
      <section className="workspace__hero">
        <div>
          <p className="eyebrow">Project planning estimate</p>
          <h2>Turn your project ideas into a clear starting plan.</h2>
          <p>
            Tell us what you want to improve, choose the services that fit your property, and receive a preliminary
            planning range you can save, print, or submit for professional review.
          </p>
        </div>
        <div className="workspace__hero-actions">
          {isInternalUser ? <button className="ghost-button" onClick={onOpenAdmin}>
            <ShieldCheck size={18} />
            Open Owner Workspace
          </button> : null}
          <button className="primary-button" onClick={handleGenerateQuote}>
            <Sparkles size={18} />
            Update Planning Range
          </button>
        </div>
      </section>

      <div className="workspace__grid">
        <div className="workspace__main">
          <section className={`panel estimate-major-section${openMajorSection === "trades" ? " is-open" : ""}`}>
            <button type="button" className="estimate-major-section__trigger" aria-expanded={openMajorSection === "trades"} onClick={() => setOpenMajorSection(openMajorSection === "trades" ? null : "trades")}>
              <div>
                <p className="eyebrow">1. Choose project areas</p>
                <h3>What would you like us to help improve?</h3>
                <span>Select one or more service areas, or begin with a popular project plan.</span>
              </div>
              <span className="estimate-major-section__meta"><b>{selectedTaskCount} scoped</b><ChevronDown size={20} /></span>
            </button>

            <div className="estimate-major-section__body" hidden={openMajorSection !== "trades"}>
              <div className="chip-grid">
              {Object.entries(categoryMeta).map(([category, meta]) => (
                <button
                  key={category}
                  className={
                    activeCategories.includes(category as ServiceCategory)
                      ? "category-chip category-chip--active"
                      : "category-chip"
                  }
                  onClick={() => handleCategoryToggle(category as ServiceCategory)}
                >
                  <strong>{meta.label}</strong>
                  <span>{meta.headline}</span>
                </button>
              ))}
            </div>

              <div className="bundle-grid">
              {quickStartBundles.map((bundle) => (
                <button key={bundle.id} className="bundle-chip" onClick={() => applyBundle(bundle.id)}>
                  <strong>{bundle.title}</strong>
                  <span>{bundle.description}</span>
                </button>
              ))}
              </div>
            </div>
          </section>

          <section className={`panel estimate-major-section${openMajorSection === "helpers" ? " is-open" : ""}`}>
            <button type="button" className="estimate-major-section__trigger" aria-expanded={openMajorSection === "helpers"} onClick={() => setOpenMajorSection(openMajorSection === "helpers" ? null : "helpers")}>
              <div>
                <p className="eyebrow">2. Add project details</p>
                <h3>Show or describe what you have in mind</h3>
                <span>Optional voice notes and photos help organize your priorities before a site visit.</span>
              </div>
              <span className="estimate-major-section__meta"><b>{imageFiles.length || speechTranscript ? "Notes added" : "Optional"}</b><ChevronDown size={20} /></span>
            </button>

            <div className="estimate-major-section__body" hidden={openMajorSection !== "helpers"}>
              {isInternalUser ? <p className="estimate-major-section__provider">{providerLabel(settings)}</p> : null}
              <div className="assist-grid">
              <article className="assist-card">
                <div className="assist-card__title">
                  <Mic size={18} />
                  <h4>Speech + audio transcription</h4>
                </div>
                <p>
                  Use browser speech capture anytime, or record audio for AI transcription when a provider is configured.
                  The offline estimator can still suggest tasks and quantities from your typed or spoken notes.
                </p>
                <div className="assist-card__actions">
                  <button className="ghost-button" onClick={handleSpeechCapture}>
                    <Mic size={16} />
                    Browser Listen
                  </button>
                  <button
                    className="secondary-button"
                    onClick={isRecordingAudio ? stopAiRecording : startAiRecording}
                    disabled={aiBusy === "transcribe"}
                  >
                    <Mic size={16} />
                    {isRecordingAudio ? "Stop AI Recording" : "AI Record"}
                  </button>
                </div>
                {speechFeedback ? <p className="helper-text">{speechFeedback}</p> : null}
                <textarea
                  value={speechTranscript}
                  onChange={(event) => setSpeechTranscript(event.target.value)}
                  placeholder="Example: 450 square feet of interior wall paint, one bedroom ceiling stain, and replace two outlets..."
                />
                <button
                  className="secondary-button"
                  onClick={() => applySuggestedTasks(speechAnalysis.taskIds, speechAnalysis.quantityHints)}
                >
                  <WandSparkles size={16} />
                  Apply Speech Suggestions
                </button>
                <p className="helper-text">{speechAnalysis.summary}</p>
                {speechAnalysis.extractedNumbers.length || speechAnalysis.followUpPrompts.length ? (
                  <div className="helper-grid">
                    {speechAnalysis.extractedNumbers.length ? (
                      <div>
                        <p className="helper-title">Detected measurements</p>
                        <div className="helper-chip-row">
                          {speechAnalysis.extractedNumbers.slice(0, 6).map((value, index) => (
                            <span key={`${value}-${index}`} className="helper-chip">
                              {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {speechAnalysis.followUpPrompts.length ? (
                      <div>
                        <p className="helper-title">Helpful follow-up questions</p>
                        <ul>
                          {speechAnalysis.followUpPrompts.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>

              <article className="assist-card">
                <div className="assist-card__title">
                  <Camera size={18} />
                  <h4>Photo-assisted review</h4>
                </div>
                <p>Upload room, wall, floor, or roof photos and let AI or fallback heuristics suggest scope details.</p>
                <label className="upload-box">
                  <input type="file" accept="image/*" capture="environment" multiple onChange={handleImageUpload} />
                  <span>Upload images</span>
                </label>
                <div className="upload-list">
                  {imageFiles.length ? imageFiles.map((file) => <span key={file.name}>{file.name}</span>) : <span>No images yet</span>}
                </div>
                <button
                  className="secondary-button"
                  onClick={() => applySuggestedTasks(imageAnalysis.taskIds, imageAnalysis.quantityHints)}
                >
                  <Sparkles size={16} />
                  Apply Image Suggestions
                </button>
                <p className="helper-text">{imageAnalysis.summary}</p>
                {imageAnalysis.riskFlags.length || imageAnalysis.followUpPrompts.length ? (
                  <div className="helper-grid">
                    {imageAnalysis.riskFlags.length ? (
                      <div>
                        <p className="helper-title">Visual risk flags</p>
                        <ul>
                          {imageAnalysis.riskFlags.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {imageAnalysis.followUpPrompts.length ? (
                      <div>
                        <p className="helper-title">Photo follow-up prompts</p>
                        <ul>
                          {imageAnalysis.followUpPrompts.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </div>

              <div className="assist-card assist-card--wide">
              <div className="assist-card__title">
                <WandSparkles size={18} />
                <h4>AI quote copilot</h4>
              </div>
              <p>
                Scope autofill cross-references client intake, speech, photos, current selections, and historical jobs.
                Material and assistance research can also be refreshed separately.
              </p>
              <p className="helper-text">
                If no live AI credential is configured, this still runs the built-in offline estimator logic.
              </p>
              <div className="assist-card__actions assist-card__actions--wide">
                <button className="primary-button" onClick={handleAiScopeAutofill} disabled={aiBusy !== null}>
                  <WandSparkles size={16} />
                  {aiBusy === "scope" ? "Building AI Scope..." : "AI Scope Autofill"}
                </button>
                <button className="ghost-button" onClick={handleRefreshPrograms} disabled={aiBusy !== null}>
                  <SearchCheck size={16} />
                  {aiBusy === "programs" ? "Refreshing Programs..." : "Refresh Assistance AI"}
                </button>
                <button className="ghost-button" onClick={handleRefreshMaterials} disabled={aiBusy !== null}>
                  <Sparkles size={16} />
                  {aiBusy === "materials" ? "Refreshing Materials..." : "Refresh Material AI"}
                </button>
              </div>
              {aiScopePlan ? (
                <div className="helper-grid">
                  <div>
                    <p className="helper-title">AI confidence</p>
                    <p className="helper-text">{aiScopePlan.confidenceNote}</p>
                  </div>
                  <div>
                    <p className="helper-title">AI follow-up prompts</p>
                    <ul>
                      {aiScopePlan.followUpQuestions.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
              {aiError ? <p className="error-text">{aiError}</p> : null}
              </div>
            </div>
          </section>

          <section className={`panel estimate-major-section${openMajorSection === "client" ? " is-open" : ""}`}>
            <button type="button" className="estimate-major-section__trigger" aria-expanded={openMajorSection === "client"} onClick={() => setOpenMajorSection(openMajorSection === "client" ? null : "client")}>
              <div>
                <p className="eyebrow">3. Your project and contact details</p>
                <h3>Help us understand your goals and how to reach you</h3>
                <span>Your information is used only to prepare and follow up on your project request.</span>
              </div>
              <span className="estimate-major-section__meta"><b>{clientIntake.firstName ? "In progress" : "Not started"}</b><ChevronDown size={20} /></span>
            </button>

            <div className="estimate-major-section__body" hidden={openMajorSection !== "client"}>
            {!isInternalUser ? (
              <p className="helper-text">
                Self-serve estimates can be saved as a lead request for David&apos;s Contracting. Add contact details
                and consent preferences so the contractor can follow up correctly.
              </p>
            ) : (
              <p className="helper-text">
                Logged-in staff can move this estimate straight into the CRM with consultation details, payment notes,
                and follow-up info attached.
              </p>
            )}

            <div className="form-grid">
              <label>
                First Name
                <input value={clientIntake.firstName} onChange={(event) => updateClientField("firstName", event.target.value)} />
              </label>
              <label>
                Last Name
                <input value={clientIntake.lastName} onChange={(event) => updateClientField("lastName", event.target.value)} />
              </label>
              <label className="form-grid__wide">
                Home Address
                <input value={clientIntake.address} onChange={(event) => updateClientField("address", event.target.value)} />
              </label>
              <label>
                City
                <input value={clientIntake.city} onChange={(event) => updateClientField("city", event.target.value)} />
              </label>
              <label>
                State
                <input value={clientIntake.state} onChange={(event) => updateClientField("state", event.target.value)} />
              </label>
              <label>
                Zip Code
                <input value={clientIntake.zip} onChange={(event) => updateClientField("zip", event.target.value)} />
              </label>
              <label>
                Email Address
                <input type="email" value={clientIntake.email} onChange={(event) => updateClientField("email", event.target.value)} />
              </label>
              <label>
                Phone Number
                <input value={clientIntake.phone} onChange={(event) => updateClientField("phone", event.target.value)} />
              </label>
              <label>
                Budget
                <input
                  type="number"
                  value={clientIntake.budget || ""}
                  onChange={(event) => updateClientField("budget", Number(event.target.value))}
                />
              </label>
              <label>
                Date
                <input type="date" value={clientIntake.date} onChange={(event) => updateClientField("date", event.target.value)} />
              </label>
              <label>
                Job Status
                <select
                  value={clientIntake.jobStatus}
                  onChange={(event) => updateClientField("jobStatus", event.target.value as JobStatus)}
                >
                  <option>Prospecting/Negotiating</option>
                  <option>In-Progress</option>
                  <option>Declined</option>
                  <option>Completed</option>
                </select>
              </label>
              <label>
                Assigned Rep
                <input value={clientIntake.assignedRep} onChange={(event) => updateClientField("assignedRep", event.target.value)} />
              </label>
              {clientIntake.jobStatus === "Declined" ? (
                <>
                  <label>
                    Decline Reason
                    <select
                      value={clientIntake.declineReason}
                      onChange={(event) => updateClientField("declineReason", event.target.value as ClientIntake["declineReason"])}
                    >
                      <option value="">Select reason</option>
                      <option>Cost too high</option>
                      <option>Went with another contractor</option>
                      <option>Unable to get supplies needed</option>
                      <option>Do not have the manpower needed</option>
                      <option>Unable to meet the requested timeframe</option>
                      <option>Other</option>
                    </select>
                  </label>
                  {clientIntake.declineReason === "Other" ? (
                    <label className="form-grid__wide">
                      Other Decline Reason
                      <input
                        value={clientIntake.declineOtherReason}
                        onChange={(event) => updateClientField("declineOtherReason", event.target.value)}
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
              <label className="form-grid__wide">
                Emergency Issue(s)
                <textarea
                  value={clientIntake.emergencyIssues}
                  onChange={(event) => updateClientField("emergencyIssues", event.target.value)}
                  placeholder="Leaks, system failures, safety issues, insurance pressure, etc."
                />
              </label>
              <label className="form-grid__wide">
                Job(s) Requested
                <textarea
                  value={clientIntake.requestedJobs}
                  onChange={(event) => updateClientField("requestedJobs", event.target.value)}
                  placeholder="Painting, flooring, roofing, repairs, add-ons..."
                />
              </label>
              <label className="form-grid__wide">
                Notes
                <textarea
                  value={clientIntake.notes}
                  onChange={(event) => updateClientField("notes", event.target.value)}
                  placeholder="Timeline, crew notes, homeowner concerns, insurance notes, access details..."
                />
              </label>
              <label className="toggle-row">
                <span>Payment Collected?</span>
                <input
                  type="checkbox"
                  checked={clientIntake.paymentCollected}
                  onChange={(event) => updateClientField("paymentCollected", event.target.checked)}
                />
              </label>
              {clientIntake.paymentCollected ? (
                <label>
                  Payment Amount
                  <input
                    type="number"
                    value={clientIntake.paymentAmount || ""}
                    onChange={(event) => updateClientField("paymentAmount", Number(event.target.value))}
                  />
                </label>
              ) : null}
              <label className="toggle-row">
                <span>Consent to email contact</span>
                <input
                  type="checkbox"
                  checked={clientIntake.consentEmailContact}
                  onChange={(event) => updateClientField("consentEmailContact", event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Consent to text / SMS contact</span>
                <input
                  type="checkbox"
                  checked={clientIntake.consentSmsContact}
                  onChange={(event) => updateClientField("consentSmsContact", event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Consent to future promos / marketing</span>
                <input
                  type="checkbox"
                  checked={clientIntake.consentMarketing}
                  onChange={(event) => updateClientField("consentMarketing", event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Request consultation</span>
                <input
                  type="checkbox"
                  checked={clientIntake.consultationRequested}
                  onChange={(event) => updateClientField("consultationRequested", event.target.checked)}
                />
              </label>
              {clientIntake.consultationRequested ? (
                <>
                  <label>
                    Preferred Consultation Date
                    <input
                      type="date"
                      value={clientIntake.consultationDate}
                      onChange={(event) => updateClientField("consultationDate", event.target.value)}
                    />
                  </label>
                  <label>
                    Preferred Time
                    <input
                      type="time"
                      value={clientIntake.consultationTime}
                      min={selectedConsultationSlot?.start}
                      max={selectedConsultationSlot?.end}
                      onChange={(event) => updateClientField("consultationTime", event.target.value)}
                    />
                  </label>
                  <label>
                    Consultation Status
                    <select
                      value={clientIntake.consultationStatus}
                      onChange={(event) =>
                        updateClientField("consultationStatus", event.target.value as ClientIntake["consultationStatus"])
                      }
                    >
                      <option>None</option>
                      <option>Requested</option>
                      <option>Confirmed</option>
                      <option>Completed</option>
                      <option>Declined</option>
                    </select>
                  </label>
                  <label className="form-grid__wide">
                    Consultation Notes
                    <textarea
                      value={clientIntake.consultationNotes}
                      onChange={(event) => updateClientField("consultationNotes", event.target.value)}
                      placeholder="Gate code, parking notes, pets, access windows, or other consultation context..."
                    />
                  </label>
                  {consultationSuggestions.length ? (
                    <div className="form-grid__wide">
                      <p className="helper-title">Suggested open consultation starts</p>
                      <div className="helper-chip-row">
                        {consultationSuggestions.map((item) => (
                          <button
                            key={`${item.date}-${item.time}`}
                            type="button"
                            className="bundle-chip"
                            onClick={() => {
                              updateClientField("consultationDate", item.date);
                              updateClientField("consultationTime", item.time);
                            }}
                          >
                            <strong>{item.label}</strong>
                            <span>Tap to use this opening</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="helper-text form-grid__wide">
                    Consultation availability: {consultationAvailabilitySummary || "No schedule published yet."}
                  </p>
                  {consultationScheduleIssue ? <p className="error-text form-grid__wide">{consultationScheduleIssue}</p> : null}
                  <p className="helper-text form-grid__wide">
                    Local Decatur-area contractors commonly advertise free estimates or free consultations, so the
                    scheduler is set up without a required consultation fee by default.
                  </p>
                </>
              ) : null}
              </div>
            </div>
          </section>

          <section className={`panel estimate-major-section${openMajorSection === "tasks" ? " is-open" : ""}`}>
            <button type="button" className="estimate-major-section__trigger" aria-expanded={openMajorSection === "tasks"} onClick={() => setOpenMajorSection(openMajorSection === "tasks" ? null : "tasks")}>
              <div>
                <p className="eyebrow">4. Choose services and quantities</p>
                <h3>Build the work plan that fits your property</h3>
                <span>Open each service area to select work, measurements, condition, and finish preferences.</span>
              </div>
              <span className="estimate-major-section__meta"><b>{selectedTaskCount} selected</b><ChevronDown size={20} /></span>
            </button>

            <div className="estimate-major-section__body" hidden={openMajorSection !== "tasks"}>
              <div className="task-accordions">
              {activeCategories.map((category) => {
                const categoryTasks = availableTasks.filter((task) => task.category === category);
                const selectedCount = categoryTasks.filter((task) => (selectionMap[task.id]?.quantity ?? 0) > 0).length;
                const isOpen = openTaskCategory === category;
                return <section key={category} className={`estimator-accordion${isOpen ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="estimator-accordion__trigger"
                    aria-expanded={isOpen}
                    aria-controls={`estimator-drawer-${category}`}
                    onClick={() => setOpenTaskCategory(isOpen ? null : category)}
                  >
                    <span>{categoryMeta[category].label}</span>
                    <small>{selectedCount} selected · {categoryTasks.length} services</small>
                  </button>
                  <div id={`estimator-drawer-${category}`} className="estimator-accordion__drawer" hidden={!isOpen}>
                    <div className="task-list">
              {categoryTasks.map((task) => {
                const selection = selectionMap[task.id] ?? newSelection(task.id);
                return (
                  <article key={task.id} className="task-card">
                    <div className="task-card__top">
                      <div>
                        <h4>{task.name}</h4>
                        <p>{task.description}</p>
                      </div>
                      <button className="secondary-button" onClick={() => updateSelection(task.id, { quantity: task.defaultQuantity })}>
                        <Plus size={16} />
                        Add
                      </button>
                    </div>

                    <div className="task-card__grid">
                      <label>
                        Quantity ({task.unitLabel})
                        <input
                          type="number"
                          value={selection.quantity || ""}
                          onChange={(event) => updateSelection(task.id, { quantity: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Condition
                        <select
                          value={selection.conditionMultiplier}
                          onChange={(event) => updateSelection(task.id, { conditionMultiplier: Number(event.target.value) })}
                        >
                          <option value={1}>Standard</option>
                          <option value={1.1}>Minor prep issues</option>
                          <option value={1.2}>Heavy prep / repairs</option>
                          <option value={1.35}>Difficult access / damage</option>
                        </select>
                      </label>
                      <label>
                        Complexity
                        <select
                          value={selection.complexityMultiplier}
                          onChange={(event) => updateSelection(task.id, { complexityMultiplier: Number(event.target.value) })}
                        >
                          <option value={1}>Straightforward</option>
                          <option value={1.08}>Moderate cuts / detail</option>
                          <option value={1.18}>Premium detail</option>
                          <option value={1.3}>High-complexity scope</option>
                        </select>
                      </label>
                    </div>

                    <label className="task-card__note">
                      Scope note
                      <input
                        value={selection.scopeNote}
                        onChange={(event) => updateSelection(task.id, { scopeNote: event.target.value })}
                        placeholder="Room name, finish request, access notes..."
                      />
                    </label>

                    <div className="task-card__details">
                      <div>
                        <p className="helper-title">Usually includes</p>
                        <ul>
                          {task.customaryIncludes.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="helper-title">Ask before finalizing</p>
                        <ul>
                          {task.discoveryQuestions.slice(0, 2).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </article>
                );
              })}
                    </div>
                  </div>
                </section>;
              })}
              </div>
            </div>
          </section>
        </div>

        <aside className="workspace__side">
          <section className="panel panel--sticky">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Your project summary</p>
                <h3>Preliminary planning range</h3>
              </div>
            </div>

            {isInternalUser ? <div className="estimate-internal-options" aria-label="Internal pricing controls"><div className="form-grid">
              <label>
                Crew Size
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={quoteOptions.crewSize}
                  onChange={(event) => updateQuoteOption("crewSize", Number(event.target.value))}
                />
              </label>
              <label>
                Discount %
                <input
                  type="number"
                  step="0.01"
                  value={quoteOptions.discountPct}
                  onChange={(event) => updateQuoteOption("discountPct", Number(event.target.value))}
                />
              </label>
              <label>
                Contingency %
                <input
                  type="number"
                  step="0.01"
                  value={quoteOptions.contingencyPct}
                  onChange={(event) => updateQuoteOption("contingencyPct", Number(event.target.value))}
                />
              </label>
              <label>
                Travel Override
                <input
                  type="number"
                  value={quoteOptions.travelOverrideFee}
                  onChange={(event) => updateQuoteOption("travelOverrideFee", Number(event.target.value))}
                />
              </label>
            </div>

            <div className="toggle-grid">
              <label className="toggle-row">
                <span>Rush Job</span>
                <input
                  type="checkbox"
                  checked={quoteOptions.rushJob}
                  onChange={(event) => updateQuoteOption("rushJob", event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Tax Exempt</span>
                <input
                  type="checkbox"
                  checked={quoteOptions.taxExempt}
                  onChange={(event) => updateQuoteOption("taxExempt", event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Customer Materials</span>
                <input
                  type="checkbox"
                  checked={quoteOptions.customerSuppliedMaterials}
                  onChange={(event) => updateQuoteOption("customerSuppliedMaterials", event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Travel Override On</span>
                <input
                  type="checkbox"
                  checked={quoteOptions.travelOverrideEnabled}
                  onChange={(event) => updateQuoteOption("travelOverrideEnabled", event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Permit Allowance</span>
                <input
                  type="checkbox"
                  checked={quoteOptions.includePermitAllowance}
                  onChange={(event) => updateQuoteOption("includePermitAllowance", event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>Haul-away</span>
                <input
                  type="checkbox"
                  checked={quoteOptions.includeHaulAway}
                  onChange={(event) => updateQuoteOption("includeHaulAway", event.target.checked)}
                />
              </label>
            </div>

            {(quoteOptions.includePermitAllowance || quoteOptions.includeHaulAway) ? (
              <div className="form-grid">
                {quoteOptions.includePermitAllowance ? (
                  <label>
                    Permit Allowance
                    <input
                      type="number"
                      value={quoteOptions.permitAllowance}
                      onChange={(event) => updateQuoteOption("permitAllowance", Number(event.target.value))}
                    />
                  </label>
                ) : null}
                {quoteOptions.includeHaulAway ? (
                  <label>
                    Haul-away Fee
                    <input
                      type="number"
                      value={quoteOptions.haulAwayFee}
                      onChange={(event) => updateQuoteOption("haulAwayFee", Number(event.target.value))}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}</div> : <p className="customer-estimate-note"><ShieldCheck size={18} /> Your planning range includes the contractor&apos;s standard business allowances. Internal pricing controls remain private.</p>}

            <label>
              Project Title
              <input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} placeholder="Example: Kitchen refresh + floor stabilization" />
            </label>
            <label>
              Project Summary
              <textarea
                value={projectSummary}
                onChange={(event) => setProjectSummary(event.target.value)}
                placeholder="Scope summary, assumptions, access conditions, homeowner priorities..."
              />
            </label>

            {quote ? (
              <div className="estimate-card">
                <div className="estimate-card__range">
                  <div>
                    <span>Low Estimate</span>
                    <strong>{formatCurrency(quote.totals.totalLow)}</strong>
                  </div>
                  <div>
                    <span>High Estimate</span>
                    <strong>{formatCurrency(quote.totals.totalHigh)}</strong>
                  </div>
                </div>
                <dl className="estimate-card__totals">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{formatCurrency(quote.totals.subtotalLow)} - {formatCurrency(quote.totals.subtotalHigh)}</dd>
                  </div>
                  <div>
                    <dt>Labor / Materials</dt>
                    <dd>
                      {formatCurrency(quote.totals.laborLow)} - {formatCurrency(quote.totals.laborHigh)} / {formatCurrency(quote.totals.materialsLow)} - {formatCurrency(quote.totals.materialsHigh)}
                    </dd>
                  </div>
                  <div>
                    <dt>Labor Hours</dt>
                    <dd>{quote.totals.laborHours.toFixed(1)} hrs</dd>
                  </div>
                  <div>
                    <dt>Travel Fee</dt>
                    <dd>{formatCurrency(quote.totals.travelFee)}</dd>
                  </div>
                  {isInternalUser ? <><div><dt>Markup + Tax</dt><dd>{formatCurrency(quote.totals.markupLow + quote.totals.taxLow)} - {formatCurrency(quote.totals.markupHigh + quote.totals.taxHigh)}</dd></div><div><dt>Contingency</dt><dd>{formatCurrency(quote.totals.contingencyLow)} - {formatCurrency(quote.totals.contingencyHigh)}</dd></div></> : null}
                  <div>
                    <dt>Timing</dt>
                    <dd>{quote.suggestedCrewSize} crew / about {quote.estimatedDays} day(s)</dd>
                  </div>
                  <div>
                    <dt>Quote Expires</dt>
                    <dd>{new Date(quote.quoteExpiresAt).toLocaleDateString()}</dd>
                  </div>
                  <div>
                    <dt>Budget Fit</dt>
                    <dd>{quote.budgetFit.note}</dd>
                  </div>
                </dl>
                <div className="stack-block estimate-unit-pricing">
                  <div className="stack-block__title"><SearchCheck size={16} /> Scope pricing by measure</div>
                  <ul>
                    {quote.breakdown.map((line) => <li key={line.taskId}>
                      <strong>{line.taskName}</strong>
                      <span>{formatUnitRate(line.unitPricing.lowInstalledPerUnit)}–{formatUnitRate(line.unitPricing.highInstalledPerUnit)} / {line.unitPricing.unitLabel}</span>
                      <small>Labor {formatUnitRate(line.unitPricing.lowLaborPerUnit)}–{formatUnitRate(line.unitPricing.highLaborPerUnit)} · Materials {formatUnitRate(line.unitPricing.lowMaterialsPerUnit)}–{formatUnitRate(line.unitPricing.highMaterialsPerUnit)} per {line.unitPricing.unitLabel}</small>
                      {line.roofingDetail ? <small className="roofing-rate-detail">Roof coverage: {line.roofingDetail.coverageSqFt.toLocaleString()} sq ft ({line.roofingDetail.roofingSquares} squares) · {formatUnitRate(line.roofingDetail.installedPerSquare.low)}–{formatUnitRate(line.roofingDetail.installedPerSquare.high)} per roofing square</small> : null}
                    </li>)}
                  </ul>
                  <p className="customer-estimate-note"><ShieldCheck size={16} /> Per-unit figures are preliminary planning allowances. Field measurement, access, roof pitch, tear-off layers, code requirements, and selected materials can change a final written proposal.</p>
                </div>
                <div className="stack-block">
                  <div className="stack-block__title">
                    <CircleHelp size={16} />
                    Payment schedule
                  </div>
                  <ul>
                    {quote.paymentSchedule.map((item) => (
                      <li key={item.label}>
                        <strong>{item.label}</strong>
                        <span>{formatCurrency(item.lowAmount)} - {formatCurrency(item.highAmount)}</span>
                        <small>{item.notes}</small>
                      </li>
                    ))}
                  </ul>
                </div>
                {isInternalUser && quote.healthChecks.length ? (
                  <div className="stack-block">
                    <div className="stack-block__title">
                      <CircleHelp size={16} />
                      Estimate checks
                    </div>
                    <ul>
                      {quote.healthChecks.map((item) => (
                        <li key={item.message}>
                          <strong>{item.severity === "warning" ? "Attention" : "Note"}</strong>
                          <span>{item.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!isInternalUser ? (
                  <div className="estimate-request-security">
                    <p>Verify your request before sending it to David&apos;s Contracting.</p>
                    {estimateSecurityFields}
                  </div>
                ) : null}
                <div className="estimate-card__actions">
                  <button className="primary-button" onClick={handleSaveToCrm} disabled={saving}>
                    <Save size={16} />
                    {saving ? "Saving..." : isInternalUser ? (crmDraftId ? "Sync CRM Draft" : "Save to CRM") : "Send Estimate Request"}
                  </button>
                  <button className="ghost-button" onClick={handleDownloadPdf}>
                    <Download size={16} />
                    Customer PDF
                  </button>
                  {isInternalUser ? <button className="ghost-button" onClick={handleDownloadExecutiveDossier}><ShieldCheck size={16} /> Executive Dossier</button> : null}
                  <button className="ghost-button" onClick={handleShareOrEmail}>
                    <Send size={16} />
                    Share / Email
                  </button>
                  <button className="ghost-button" onClick={() => window.print()}>
                    <Printer size={16} />
                    Print
                  </button>
                  <button className="ghost-button" onClick={resetDraft}>
                    <RefreshCcw size={16} />
                    Reset
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>No estimate yet.</p>
                <button className="primary-button" onClick={handleGenerateQuote}>
                  Build Quote Range
                </button>
              </div>
            )}

            {actionMessage ? <p className="helper-text">{actionMessage}</p> : null}
            {isInternalUser && crmDraftId ? (
              <p className="helper-text">CRM draft ID: {crmDraftId}. Future estimate refreshes update this same record.</p>
            ) : null}
          </section>

          {quote ? (
            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">Quote Intelligence</p>
                  <h3>Category totals, assumptions, and exclusions</h3>
                </div>
              </div>
              <div className="stack-list">
                <div className="stack-block">
                  <div className="stack-block__title">
                    <Sparkles size={16} />
                    Category totals
                  </div>
                  <ul>
                    {quote.categoryTotals.map((item) => (
                      <li key={item.category}>
                        <strong>{item.label}</strong>
                        <span>{formatCurrency(item.lowTotal)} - {formatCurrency(item.highTotal)}</span>
                        <small>{item.laborHours.toFixed(1)} labor hrs</small>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stack-block">
                  <div className="stack-block__title">
                    <CircleHelp size={16} />
                    Assumptions
                  </div>
                  <ul>
                    {quote.assumptions.slice(0, 6).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="stack-block">
                  <div className="stack-block__title">
                    <Mail size={16} />
                    Exclusions
                  </div>
                  <ul>
                    {quote.exclusions.slice(0, 6).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">AI Suggestions</p>
                <h3>Programs, risks, and similar jobs</h3>
              </div>
            </div>
            <div className="stack-list">
              <div className="stack-block">
                <div className="stack-block__title">
                  <CircleHelp size={16} />
                  Aid / assistance matches
                </div>
                <ul>
                  {displayedPrograms.map((program) => (
                    <li key={`${program.name}-${program.provider}`}>
                      <strong>{program.name}</strong>
                      <span>{program.focus}</span>
                      <small>{program.provider} | {program.eligibilityHint}</small>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="stack-block">
                <div className="stack-block__title">
                  <WandSparkles size={16} />
                  Risk flags
                </div>
                <ul>
                  {(aiScopePlan?.riskFlags.length ? aiScopePlan.riskFlags : imageAnalysis.riskFlags.length ? imageAnalysis.riskFlags : imageAnalysis.followUpPrompts).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="stack-block">
                <div className="stack-block__title">
                  <Mail size={16} />
                  Similar past jobs
                </div>
                <ul>
                  {similarJobs.length ? (
                    similarJobs.map((job) => (
                      <li key={job.id}>
                        <strong>{job.projectTitle}</strong>
                        <span>{job.clientName} - {formatCurrency(job.quoteTotal)}</span>
                        <small>{Math.round(job.similarity * 100)}% similarity</small>
                      </li>
                    ))
                  ) : (
                    <li>Select tasks to see similar historical jobs.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">AI Materials</p>
                <h3>Local supplier recommendations</h3>
              </div>
            </div>
            <ul className="supplier-list">
              {displayedMaterials.length ? (
                displayedMaterials.slice(0, 10).map((material, index) => (
                  <li key={`${material.taskId}-${material.name}-${index}`}>
                    <div>
                      <strong>{material.name}</strong>
                      <span>{material.supplierName}</span>
                      <small>
                        {material.quantity} {material.unit} - {formatCurrency(material.estimatedLow)} to {formatCurrency(material.estimatedHigh)}
                      </small>
                    </div>
                    <span>{material.sourceNote}</span>
                  </li>
                ))
              ) : (
                <li>
                  <div>
                    <strong>No material plan yet</strong>
                    <span>Run AI scope autofill or refresh material AI after choosing tasks.</span>
                  </div>
                </li>
              )}
            </ul>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Material Sources</p>
                <h3>Nearby supplier baselines</h3>
              </div>
            </div>
            <ul className="supplier-list">
              {suppliers.map((supplier) => (
                <li key={supplier.id}>
                  <div>
                    <strong>{supplier.name}</strong>
                    <span>{supplier.focus}</span>
                  </div>
                  <a href={supplier.url} target="_blank" rel="noreferrer">
                    Source
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
