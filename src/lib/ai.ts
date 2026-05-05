import { aidPrograms, serviceTasks, suppliers } from "../data/catalog";
import {
  AiMaterialRecommendation,
  AiProgramRecommendation,
  AiScopePlan,
  AiTaskSuggestion,
  AppSettings,
  ClientIntake,
  HistoricalJob,
  QuoteSelection,
  ServiceCategory,
} from "../types";
import {
  analyzeSpeechInput,
  analyzeUploadedImages,
  findSimilarHistoricalJobs,
  findTaskById,
  suggestAidPrograms,
} from "./estimates";

interface ScopePlanInput {
  clientIntake: ClientIntake;
  activeCategories: ServiceCategory[];
  speechTranscript: string;
  imageFiles: File[];
  currentSelections: QuoteSelection[];
  historicalJobs: HistoricalJob[];
}

const asJsonString = (value: unknown) => JSON.stringify(value, null, 2);

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const canUseOpenAiDirect = (settings: AppSettings) =>
  settings.aiProvider === "openai-direct" && settings.hasOpenAiApiKey;

const canUseWebhook = (settings: AppSettings) =>
  settings.aiProvider === "webhook" && settings.hasAiWebhook;

const postJson = async <T>(url: string, body: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || `AI request failed with status ${response.status}.`);
  }

  return payload as T;
};

const fileToDataUrl = async (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const imageFileToDataUrl = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/")) {
    return fileToDataUrl(file);
  }

  const fileUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = reject;
      nextImage.src = fileUrl;
    });

    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(fileUrl);
  }
};

const compactCatalog = serviceTasks.map((task) => ({
  id: task.id,
  category: task.category,
  name: task.name,
  unitLabel: task.unitLabel,
  defaultQuantity: task.defaultQuantity,
  description: task.description,
  discoveryQuestions: task.discoveryQuestions.slice(0, 2),
  defaultMaterials: task.defaultMaterials.slice(0, 3).map((material) => ({
    name: material.name,
    unit: material.unit,
    quantityPerUnit: material.quantityPerUnit,
    lowUnitCost: material.lowUnitCost,
    highUnitCost: material.highUnitCost,
    supplierIds: material.supplierIds,
  })),
}));

const supplierCatalog = suppliers.map((supplier) => ({
  id: supplier.id,
  name: supplier.name,
  focus: supplier.focus,
  address: supplier.address,
  phone: supplier.phone,
  url: supplier.url,
}));

const scopePlanSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectTitle: { type: "string" },
    projectSummary: { type: "string" },
    suggestedRequestedJobs: { type: "string" },
    suggestedEmergencyIssues: { type: "string" },
    suggestedNotes: { type: "string" },
    categories: {
      type: "array",
      items: {
        type: "string",
        enum: ["painting", "flooring", "roofing", "handiwork", "electrical-hvac"],
      },
    },
    taskSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          taskId: { type: "string", enum: serviceTasks.map((task) => task.id) },
          quantity: { type: "number" },
          conditionMultiplier: { type: "number" },
          complexityMultiplier: { type: "number" },
          scopeNote: { type: "string" },
          rationale: { type: "string" },
        },
        required: [
          "taskId",
          "quantity",
          "conditionMultiplier",
          "complexityMultiplier",
          "scopeNote",
          "rationale",
        ],
      },
    },
    followUpQuestions: {
      type: "array",
      items: { type: "string" },
    },
    riskFlags: {
      type: "array",
      items: { type: "string" },
    },
    similarJobIds: {
      type: "array",
      items: { type: "string" },
    },
    confidenceNote: { type: "string" },
    programs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          provider: { type: "string" },
          focus: { type: "string" },
          eligibilityHint: { type: "string" },
          url: { type: "string" },
          reasoning: { type: "string" },
          source: { type: "string", enum: ["curated", "live-search", "model"] },
        },
        required: ["name", "provider", "focus", "eligibilityHint", "url", "reasoning", "source"],
      },
    },
    materials: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          taskId: { type: "string", enum: serviceTasks.map((task) => task.id) },
          quantity: { type: "number" },
          unit: { type: "string" },
          supplierId: { type: "string", enum: suppliers.map((supplier) => supplier.id) },
          supplierName: { type: "string" },
          estimatedLow: { type: "number" },
          estimatedHigh: { type: "number" },
          sourceNote: { type: "string" },
          reasoning: { type: "string" },
        },
        required: [
          "name",
          "taskId",
          "quantity",
          "unit",
          "supplierId",
          "supplierName",
          "estimatedLow",
          "estimatedHigh",
          "sourceNote",
          "reasoning",
        ],
      },
    },
  },
  required: [
    "projectTitle",
    "projectSummary",
    "suggestedRequestedJobs",
    "suggestedEmergencyIssues",
    "suggestedNotes",
    "categories",
    "taskSuggestions",
    "followUpQuestions",
    "riskFlags",
    "similarJobIds",
    "confidenceNote",
    "programs",
    "materials",
  ],
};

const ensureTaskSuggestion = (suggestion: AiTaskSuggestion): AiTaskSuggestion => ({
  ...suggestion,
  conditionMultiplier: Math.min(1.35, Math.max(1, suggestion.conditionMultiplier || 1)),
  complexityMultiplier: Math.min(1.3, Math.max(1, suggestion.complexityMultiplier || 1)),
  quantity: Math.max(0, suggestion.quantity || 0),
});

const buildFallbackTaskSuggestions = (
  taskIds: string[],
  currentSelections: QuoteSelection[],
  quantityHints: Record<string, number>,
  fallbackNotes: string[],
): AiTaskSuggestion[] => {
  const currentSelectionMap = new Map(currentSelections.map((selection) => [selection.taskId, selection]));

  return Array.from(new Set(taskIds))
    .map((taskId) => {
      const task = findTaskById(taskId);
      if (!task) {
        return null;
      }

      const current = currentSelectionMap.get(taskId);
      return {
        taskId,
        quantity:
          current?.quantity && current.quantity > 0
            ? current.quantity
            : quantityHints[taskId] && quantityHints[taskId] > 0
              ? quantityHints[taskId]
              : task.defaultQuantity,
        conditionMultiplier: current?.conditionMultiplier ?? 1,
        complexityMultiplier: current?.complexityMultiplier ?? 1,
        scopeNote: current?.scopeNote ?? fallbackNotes.slice(0, 2).join(" ").trim(),
        rationale:
          quantityHints[taskId]
            ? "Heuristic match from speech/image context with quantity hints."
            : "Heuristic match from speech, images, and active categories.",
      };
    })
    .filter((value): value is AiTaskSuggestion => Boolean(value));
};

const createHeuristicMaterialPlan = (
  taskSuggestions: AiTaskSuggestion[],
): AiMaterialRecommendation[] => {
  const recommendations: AiMaterialRecommendation[] = [];

  taskSuggestions.forEach((suggestion) => {
    const task = findTaskById(suggestion.taskId);
    if (!task) {
      return;
    }

    task.defaultMaterials.slice(0, 3).forEach((material) => {
      const supplierId = material.supplierIds[0] ?? suppliers[0]?.id ?? "";
      const supplier = suppliers.find((item) => item.id === supplierId);
      const quantity = Math.max(1, suggestion.quantity * material.quantityPerUnit * task.materialWasteFactor);
      recommendations.push({
        name: material.name,
        taskId: suggestion.taskId,
        quantity: roundMoney(quantity),
        unit: material.unit,
        supplierId,
        supplierName: supplier?.name ?? "Preferred local supplier",
        estimatedLow: roundMoney(quantity * material.lowUnitCost),
        estimatedHigh: roundMoney(quantity * material.highUnitCost),
        sourceNote: "Offline estimator baseline using task catalog and mapped local suppliers.",
        reasoning: `${task.name} usually needs ${material.name} based on the selected quantity and standard waste factor.`,
      });
    });
  });

  return recommendations.sort((left, right) => right.estimatedHigh - left.estimatedHigh).slice(0, 12);
};

const createHeuristicProgramPlan = (
  clientIntake: ClientIntake,
  selections: QuoteSelection[],
): AiProgramRecommendation[] =>
  suggestAidPrograms(clientIntake, selections).map((program) => ({
    name: program.name,
    provider: program.provider,
    focus: program.focus,
    eligibilityHint: program.eligibilityHint,
    url: program.url,
    reasoning: program.notes,
    source: "curated",
  }));

const createHeuristicScopePlan = ({
  clientIntake,
  activeCategories,
  speechTranscript,
  imageFiles,
  currentSelections,
  historicalJobs,
}: ScopePlanInput): AiScopePlan => {
  const speech = analyzeSpeechInput(speechTranscript);
  const images = analyzeUploadedImages(imageFiles, activeCategories);
  const combinedQuantityHints = {
    ...images.quantityHints,
    ...speech.quantityHints,
  };
  const fallbackNotes = [clientIntake.notes, clientIntake.emergencyIssues, speechTranscript].filter(Boolean);
  const combinedTaskIds = [
    ...currentSelections.filter((selection) => selection.quantity > 0).map((selection) => selection.taskId),
    ...speech.taskIds,
    ...images.taskIds,
  ];
  const taskSuggestions = buildFallbackTaskSuggestions(
    combinedTaskIds,
    currentSelections,
    combinedQuantityHints,
    fallbackNotes,
  );
  const quoteSelections = taskSuggestions.map((task) => ({
    taskId: task.taskId,
    quantity: task.quantity,
    scopeNote: task.scopeNote,
    conditionMultiplier: task.conditionMultiplier,
    complexityMultiplier: task.complexityMultiplier,
  }));
  const similarJobs = findSimilarHistoricalJobs(quoteSelections, historicalJobs);
  const programs = createHeuristicProgramPlan(clientIntake, quoteSelections);
  const materials = createHeuristicMaterialPlan(taskSuggestions);
  const urgencyFlag = /urgent|asap|emergency|leak|no heat|no ac|safety/i.test(
    `${clientIntake.emergencyIssues} ${speechTranscript}`,
  );
  const requestedJobs =
    clientIntake.requestedJobs ||
    taskSuggestions
      .map((suggestion) => findTaskById(suggestion.taskId)?.name ?? suggestion.taskId)
      .slice(0, 4)
      .join(", ");

  return {
    projectTitle:
      requestedJobs.length > 0
        ? requestedJobs.split(",").slice(0, 2).join(" + ").slice(0, 80)
        : `${activeCategories.map((category) => category.replace("-", " ")).join(" + ")} project`,
    projectSummary:
      clientIntake.notes ||
      speechTranscript ||
      `Scope built from ${taskSuggestions.length || activeCategories.length} trade cue(s), field notes, and offline contractor heuristics.`,
    suggestedRequestedJobs: requestedJobs,
    suggestedEmergencyIssues: clientIntake.emergencyIssues || images.riskFlags[0] || "",
    suggestedNotes:
      clientIntake.notes ||
      "Review finish preferences, access conditions, homeowner-supplied materials, and hidden-condition exclusions before sending.",
    categories: Array.from(
      new Set([
        ...activeCategories,
        ...speech.categories,
        ...taskSuggestions
          .map((suggestion) => findTaskById(suggestion.taskId)?.category)
          .filter((value): value is ServiceCategory => Boolean(value)),
      ]),
    ),
    taskSuggestions,
    followUpQuestions: Array.from(
      new Set([
        ...speech.followUpPrompts,
        ...images.followUpPrompts,
        !clientIntake.address.trim() ? "Confirm the full property address before saving the CRM record." : "",
        !clientIntake.budget ? "Ask the homeowner for a working budget range to gauge fit." : "",
        urgencyFlag ? "Confirm the earliest acceptable service window and whether temporary mitigation is needed." : "",
      ]),
    )
      .filter(Boolean)
      .slice(0, 7),
    riskFlags: Array.from(
      new Set([
        ...images.riskFlags,
        urgencyFlag ? "Emergency timing may require rush scheduling, temporary repair, or phased pricing." : "",
        clientIntake.budget && taskSuggestions.length > 2 ? "Mixed-trade scope may need phased pricing if the homeowner budget is tight." : "",
      ]),
    )
      .filter(Boolean)
      .slice(0, 7),
    similarJobIds: similarJobs.map((job) => job.id),
    confidenceNote:
      taskSuggestions.length > 0
        ? `Offline AI generated a workable first pass using speech, photos, current scope, and ${similarJobs.length} similar historical job match(es).`
        : "Offline AI needs more specific notes, photos, or measurements to recommend scope items.",
    programs,
    materials,
  };
};

const buildScopePlanPrompt = (
  input: ScopePlanInput,
  imageCount: number,
) => [
  "You are an expert contractor estimator and CRM copilot for David's Contracting in Decatur, Illinois.",
  "Create a practical scope-autofill plan for a homeowner quote.",
  "Use ONLY taskId values that exist in the supplied catalog.",
  "Stay conservative when measurements are unclear. Use followUpQuestions and riskFlags instead of inventing hidden conditions.",
  "Return realistic low-context field notes that help a contractor move faster in the field.",
  "",
  "CLIENT INTAKE",
  asJsonString(input.clientIntake),
  "",
  "ACTIVE CATEGORIES",
  asJsonString(input.activeCategories),
  "",
  "CURRENT SELECTIONS",
  asJsonString(input.currentSelections),
  "",
  "SPEECH TRANSCRIPT",
  input.speechTranscript || "No transcript provided.",
  "",
  `IMAGE COUNT: ${imageCount}`,
  "",
  "TASK CATALOG",
  asJsonString(compactCatalog),
  "",
  "LOCAL SUPPLIERS",
  asJsonString(supplierCatalog),
  "",
  "CURATED ASSISTANCE PROGRAMS",
  asJsonString(aidPrograms),
  "",
  "HISTORICAL JOBS",
  asJsonString(input.historicalJobs.slice(0, 8)),
].join("\n");

const buildMaterialResearchPrompt = (
  clientIntake: ClientIntake,
  taskSuggestions: AiTaskSuggestion[],
) => {
  const tasks = taskSuggestions
    .map((suggestion) => ({
      taskId: suggestion.taskId,
      taskName: findTaskById(suggestion.taskId)?.name ?? suggestion.taskId,
      quantity: suggestion.quantity,
      scopeNote: suggestion.scopeNote,
    }))
    .slice(0, 8);

  return [
    "Return strict JSON with a top-level key named materials and no markdown fences.",
    "Research practical local material pricing guidance for a contractor in Decatur, Illinois 62526.",
    "Prefer Lowe's, Menards, Sherwin-Williams, Walmart, and nearby trade suppliers when relevant.",
    "Each material must include: name, taskId, quantity, unit, supplierId, supplierName, estimatedLow, estimatedHigh, sourceNote, reasoning.",
    "Use supplierId values from this list only:",
    asJsonString(supplierCatalog),
    "Job context:",
    asJsonString({
      client: `${clientIntake.firstName} ${clientIntake.lastName}`.trim(),
      requestedJobs: clientIntake.requestedJobs,
      emergencyIssues: clientIntake.emergencyIssues,
      tasks,
    }),
  ].join("\n");
};

const buildProgramResearchPrompt = (
  clientIntake: ClientIntake,
  taskSuggestions: AiTaskSuggestion[],
) =>
  [
    "Return strict JSON with a top-level key named programs and no markdown fences.",
    "Search for current local, state, or federal repair-assistance programs for a homeowner in Decatur, Illinois 62526.",
    "Each program must include: name, provider, focus, eligibilityHint, url, reasoning, source.",
    "Use source as live-search for searched results.",
    "Prioritize programs relevant to emergency repair, roofing, accessibility, weatherization, HVAC, electrical, and low-income homeowner assistance.",
    "Job context:",
    asJsonString({
      city: clientIntake.city,
      state: clientIntake.state,
      zip: clientIntake.zip,
      budget: clientIntake.budget,
      emergencyIssues: clientIntake.emergencyIssues,
      requestedJobs: clientIntake.requestedJobs,
      tasks: taskSuggestions.map((suggestion) => ({
        taskId: suggestion.taskId,
        taskName: findTaskById(suggestion.taskId)?.name ?? suggestion.taskId,
      })),
    }),
  ].join("\n");

export const getAiScopePlan = async (settings: AppSettings, input: ScopePlanInput): Promise<AiScopePlan> => {
  const fallback = createHeuristicScopePlan(input);

  if (!canUseWebhook(settings) && !canUseOpenAiDirect(settings)) {
    return fallback;
  }

  const images = await Promise.all(input.imageFiles.slice(0, 3).map((file) => imageFileToDataUrl(file)));
  const result = await postJson<AiScopePlan>("/api/ai/scope-plan", {
    prompt: buildScopePlanPrompt(input, images.length),
    imageDataUrls: images,
    schemaName: "davids_scope_plan",
    schema: scopePlanSchema,
    webhookPayload: {
      ...input,
      imageDataUrls: images,
      compactCatalog,
      supplierCatalog,
      aidPrograms,
    },
  });

  return {
    ...fallback,
    ...result,
    taskSuggestions: (result.taskSuggestions ?? fallback.taskSuggestions).map(ensureTaskSuggestion),
    programs: result.programs?.length ? result.programs : fallback.programs,
    materials: result.materials?.length ? result.materials : fallback.materials,
  };
};

export const getAiAidPrograms = async (
  settings: AppSettings,
  clientIntake: ClientIntake,
  taskSuggestions: AiTaskSuggestion[],
): Promise<AiProgramRecommendation[]> => {
  const quoteSelections: QuoteSelection[] = taskSuggestions.map((suggestion) => ({
    taskId: suggestion.taskId,
    quantity: suggestion.quantity,
    scopeNote: suggestion.scopeNote,
    conditionMultiplier: suggestion.conditionMultiplier,
    complexityMultiplier: suggestion.complexityMultiplier,
  }));
  const fallback = createHeuristicProgramPlan(clientIntake, quoteSelections);

  if (!canUseWebhook(settings) && !canUseOpenAiDirect(settings)) {
    return fallback;
  }

  const payload = await postJson<
    { programs?: AiProgramRecommendation[] } | AiProgramRecommendation[]
  >("/api/ai/aid-programs", {
    prompt: buildProgramResearchPrompt(clientIntake, taskSuggestions),
    webhookPayload: {
      clientIntake,
      taskSuggestions,
      aidPrograms,
    },
  });

  const programs = Array.isArray(payload) ? payload : payload.programs ?? [];
  return programs.length ? programs : fallback;
};

export const getAiMaterialPlan = async (
  settings: AppSettings,
  clientIntake: ClientIntake,
  taskSuggestions: AiTaskSuggestion[],
): Promise<AiMaterialRecommendation[]> => {
  const fallback = createHeuristicMaterialPlan(taskSuggestions);

  if (!canUseWebhook(settings) && !canUseOpenAiDirect(settings)) {
    return fallback;
  }

  const payload = await postJson<
    { materials?: AiMaterialRecommendation[] } | AiMaterialRecommendation[]
  >("/api/ai/material-plan", {
    prompt: buildMaterialResearchPrompt(clientIntake, taskSuggestions),
    webhookPayload: {
      clientIntake,
      taskSuggestions,
      supplierCatalog,
    },
  });

  const materials = Array.isArray(payload) ? payload : payload.materials ?? [];
  return materials.length ? materials : fallback;
};

export const transcribeCapturedAudio = async (
  settings: AppSettings,
  audioFile: File,
): Promise<string> => {
  if (!canUseWebhook(settings) && !canUseOpenAiDirect(settings)) {
    throw new Error(
      "Configure OpenAI direct mode or an AI webhook in Admin Settings to use AI transcription.",
    );
  }

  const payload = await postJson<{ transcript: string }>("/api/ai/transcribe-audio", {
    mimeType: audioFile.type,
    fileName: audioFile.name,
    audioDataUrl: await fileToDataUrl(audioFile),
  });

  return payload.transcript;
};
