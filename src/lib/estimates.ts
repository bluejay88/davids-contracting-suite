import { aidPrograms, categoryMeta, serviceTasks } from "../data/catalog";
import {
  AidProgram,
  AppSettings,
  ClientIntake,
  HistoricalJob,
  QuoteBuildOptions,
  QuoteCategoryTotal,
  QuoteHealthCheck,
  QuoteLineBreakdown,
  QuoteMaterialRollup,
  QuotePaymentMilestone,
  QuoteResult,
  QuoteSelection,
  ServiceCategory,
  ServiceTask,
} from "../types";

export interface SimilarJobMatch {
  id: string;
  clientName: string;
  projectTitle: string;
  quoteTotal: number;
  categories: ServiceCategory[];
  notes: string;
  similarity: number;
}

export interface SpeechAssistResult {
  summary: string;
  categories: ServiceCategory[];
  taskIds: string[];
  extractedNumbers: number[];
  quantityHints: Record<string, number>;
  followUpPrompts: string[];
}

export interface ImageAssistResult {
  summary: string;
  riskFlags: string[];
  taskIds: string[];
  quantityHints: Record<string, number>;
  followUpPrompts: string[];
}

const taskIndex = new Map(serviceTasks.map((task) => [task.id, task]));

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const roundQuantity = (value: number) => Math.round(value * 10) / 10;

const unique = <T>(items: T[]) => Array.from(new Set(items));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roomPattern = /(\d+(?:\.\d+)?)\s*(room|rooms|bedroom|bedrooms|bathroom|bathrooms)/i;
const areaPattern = /(\d+(?:\.\d+)?)\s*(sq(?:uare)?\.?\s*ft|sqft|square feet|sf)/i;
const linearPattern = /(\d+(?:\.\d+)?)\s*(linear feet|lf|ft of trim|feet of trim)/i;
const fixturePattern = /(\d+(?:\.\d+)?)\s*(fixture|fixtures|outlet|outlets|switch|switches|fan|fans|window|windows|door|doors)/i;

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export const findTaskById = (taskId: string) => taskIndex.get(taskId);

export const getTasksForCategory = (category: ServiceCategory) =>
  serviceTasks.filter((task) => task.category === category);

const keywordToTask: Array<{ words: string[]; taskId: string }> = [
  { words: ["paint", "wall"], taskId: "paint-interior-walls" },
  { words: ["ceiling"], taskId: "paint-ceilings" },
  { words: ["trim", "baseboard"], taskId: "paint-trim" },
  { words: ["cabinet"], taskId: "paint-cabinets" },
  { words: ["vinyl plank", "lvp"], taskId: "floor-lvp" },
  { words: ["laminate"], taskId: "floor-laminate" },
  { words: ["tile"], taskId: "floor-tile" },
  { words: ["subfloor", "soft floor"], taskId: "subfloor-repair" },
  { words: ["roof", "shingle"], taskId: "roof-asphalt-replace" },
  { words: ["leak", "flashing"], taskId: "roof-repair" },
  { words: ["gutter"], taskId: "roof-gutters" },
  { words: ["soffit", "fascia"], taskId: "roof-soffit-fascia" },
  { words: ["fan"], taskId: "ehvac-fan" },
  { words: ["thermostat"], taskId: "ehvac-thermostat" },
  { words: ["outlet", "switch"], taskId: "ehvac-outlet" },
  { words: ["furnace", "ac", "cooling", "heating"], taskId: "ehvac-tuneup" },
  { words: ["drywall"], taskId: "handy-drywall-patch" },
  { words: ["caulk"], taskId: "handy-caulking" },
  { words: ["faucet"], taskId: "handy-faucet" },
  { words: ["toilet"], taskId: "handy-toilet-repair" },
  { words: ["garbage disposal"], taskId: "handy-garbage-disposal" },
  { words: ["tv"], taskId: "handy-tv-mount" },
  { words: ["blinds", "curtain"], taskId: "handy-blinds" },
];

const getTask = (selection: QuoteSelection): ServiceTask | undefined => taskIndex.get(selection.taskId);

const inferCrewSize = (laborHours: number, requestedCrewSize: number) => {
  if (requestedCrewSize > 0) {
    return requestedCrewSize;
  }

  if (laborHours >= 64) {
    return 3;
  }

  return laborHours >= 24 ? 2 : 1;
};

const buildSelectionSummary = (activeSelections: QuoteSelection[]) => {
  const tasks = activeSelections
    .map((selection) => getTask(selection))
    .filter((value): value is ServiceTask => Boolean(value));

  if (!tasks.length) {
    return {
      projectTitle: "Custom Project Quote",
      summary:
        "Custom contractor estimate prepared from current scope inputs, field notes, and trade-specific assumptions.",
    };
  }

  const topNames = tasks.slice(0, 3).map((task) => task.shortLabel || task.name);
  const categories = unique(tasks.map((task) => categoryMeta[task.category].label));

  return {
    projectTitle: topNames.join(" + ").slice(0, 82),
    summary: `Scope includes ${topNames.join(", ")} for ${categories.join(", ").toLowerCase()} work with contractor-standard setup, cleanup, and verification before final scheduling.`,
  };
};

const buildCategoryTotals = (breakdown: QuoteLineBreakdown[]): QuoteCategoryTotal[] => {
  const byCategory = new Map<ServiceCategory, QuoteCategoryTotal>();

  breakdown.forEach((line) => {
    const current = byCategory.get(line.category) || {
      category: line.category,
      label: categoryMeta[line.category].label,
      lowTotal: 0,
      highTotal: 0,
      laborHours: 0,
    };

    current.lowTotal = roundMoney(current.lowTotal + line.lowTotal);
    current.highTotal = roundMoney(current.highTotal + line.highTotal);
    current.laborHours = roundQuantity(current.laborHours + line.laborHours);
    byCategory.set(line.category, current);
  });

  return Array.from(byCategory.values()).sort((left, right) => right.highTotal - left.highTotal);
};

const buildMaterialRollup = (breakdown: QuoteLineBreakdown[]): QuoteMaterialRollup[] => {
  const rollup = new Map<string, QuoteMaterialRollup>();

  breakdown.forEach((line) => {
    line.materials.forEach((material) => {
      const key = `${material.name}::${material.unit}`;
      const current = rollup.get(key) || {
        name: material.name,
        unit: material.unit,
        totalQuantity: 0,
        lowTotal: 0,
        highTotal: 0,
        supplierIds: [],
      };

      const averageUnitCost = material.lowUnitCost > 0 ? material.lowExtendedCost / material.lowUnitCost : 0;
      current.totalQuantity = roundQuantity(current.totalQuantity + Math.max(0, averageUnitCost));
      current.lowTotal = roundMoney(current.lowTotal + material.lowExtendedCost);
      current.highTotal = roundMoney(current.highTotal + material.highExtendedCost);
      current.supplierIds = unique([...current.supplierIds, ...material.supplierIds]);
      rollup.set(key, current);
    });
  });

  return Array.from(rollup.values()).sort((left, right) => right.highTotal - left.highTotal);
};

const buildQuoteAssumptions = (
  breakdown: QuoteLineBreakdown[],
  options: QuoteBuildOptions,
  estimatedDays: number,
  validityDays: number,
) => {
  const assumptions = unique(
    breakdown.flatMap((line) => line.customaryIncludes).concat([
      `Pricing assumes a ${estimatedDays}-day working window with a ${options.crewSize}-person crew.`,
      `Quote is valid for ${validityDays} day${validityDays === 1 ? "" : "s"} from the issue date.`,
      options.customerSuppliedMaterials
        ? "Homeowner-supplied materials are excluded from the material allowance and must be available before scheduling."
        : "Contractor-supplied material allowances are based on customary product tiers and standard waste factors.",
      options.rushJob
        ? "Rush scheduling and accelerated coordination have been included in the estimate range."
        : "Scheduling assumes standard production timing and normal supplier lead times.",
    ]),
  );

  return assumptions.filter(Boolean);
};

const buildQuoteExclusions = (breakdown: QuoteLineBreakdown[], options: QuoteBuildOptions) =>
  unique(
    breakdown.flatMap((line) => line.customaryExcludes).concat([
      "Hidden structural damage, concealed moisture intrusion, and undiscovered code corrections are excluded until field verification.",
      options.includePermitAllowance
        ? "Permit allowance is a planning placeholder and may change if the authority having jurisdiction requires additional fees or revisions."
        : "Permit fees and jurisdiction-specific inspection costs are excluded unless a permit allowance is added.",
      options.customerSuppliedMaterials
        ? "Warranty coverage does not extend to product defects in owner-supplied materials."
        : "Premium finish upgrades, owner-selected specialty products, and design revisions can change final pricing.",
    ]),
  ).filter(Boolean);

const buildBudgetFit = (budget: number, totalLow: number, totalHigh: number) => {
  if (!budget) {
    return {
      status: "unknown" as const,
      varianceLow: 0,
      varianceHigh: 0,
      note: "No homeowner budget was entered, so the app cannot compare scope against budget fit yet.",
    };
  }

  const varianceLow = roundMoney(budget - totalLow);
  const varianceHigh = roundMoney(budget - totalHigh);

  if (budget >= totalHigh) {
    return {
      status: "under-budget" as const,
      varianceLow,
      varianceHigh,
      note: "The homeowner budget currently covers the full low-to-high estimate range.",
    };
  }

  if (budget >= totalLow) {
    return {
      status: "near-budget" as const,
      varianceLow,
      varianceHigh,
      note: "The homeowner budget reaches the low estimate but may need scope or material decisions to stay under the high estimate.",
    };
  }

  return {
    status: "over-budget" as const,
    varianceLow,
    varianceHigh,
    note: "The current scope is above the stated budget. Consider value-engineering, phased work, or assistance programs.",
  };
};

const buildPaymentSchedule = (
  settings: AppSettings,
  totalLow: number,
  totalHigh: number,
  estimatedDays: number,
): QuotePaymentMilestone[] => {
  const depositPct =
    totalHigh >= settings.largeJobThreshold ? settings.largeJobDepositPct : settings.standardDepositPct;
  const depositLow = roundMoney(totalLow * depositPct);
  const depositHigh = roundMoney(totalHigh * depositPct);
  const remainingLow = roundMoney(totalLow - depositLow);
  const remainingHigh = roundMoney(totalHigh - depositHigh);

  if (estimatedDays >= 4 || totalHigh >= settings.largeJobThreshold) {
    const progressLow = roundMoney(remainingLow * 0.5);
    const progressHigh = roundMoney(remainingHigh * 0.5);
    return [
      {
        label: "Deposit to schedule",
        lowAmount: depositLow,
        highAmount: depositHigh,
        notes: "Recommended at approval to secure scheduling, material ordering, and mobilization.",
      },
      {
        label: "Progress draw",
        lowAmount: progressLow,
        highAmount: progressHigh,
        notes: "Suggested once prep/demo or the first major production milestone is complete.",
      },
      {
        label: "Completion balance",
        lowAmount: roundMoney(totalLow - depositLow - progressLow),
        highAmount: roundMoney(totalHigh - depositHigh - progressHigh),
        notes: "Suggested at final walkthrough, punch-list closeout, or homeowner acceptance.",
      },
    ];
  }

  return [
    {
      label: "Deposit to schedule",
      lowAmount: depositLow,
      highAmount: depositHigh,
      notes: "Recommended at approval to secure scheduling and initial mobilization.",
    },
    {
      label: "Completion balance",
      lowAmount: remainingLow,
      highAmount: remainingHigh,
      notes: "Suggested at final completion or homeowner acceptance.",
    },
  ];
};

const buildQuoteHealthChecks = (
  client: ClientIntake | undefined,
  options: QuoteBuildOptions,
  budgetFit: ReturnType<typeof buildBudgetFit>,
  breakdown: QuoteLineBreakdown[],
  projectTitle: string,
) => {
  const checks: QuoteHealthCheck[] = [];

  if (!projectTitle.trim()) {
    checks.push({
      severity: "info",
      message: "Project title was auto-generated from the selected scope items.",
    });
  }

  if (!breakdown.length) {
    checks.push({
      severity: "warning",
      message: "No scoped tasks are active yet, so the estimate cannot be finalized.",
    });
  }

  if (budgetFit.status === "over-budget") {
    checks.push({
      severity: "warning",
      message: "The current scope is above the homeowner budget. Consider phasing or alternative material options.",
    });
  }

  if (options.customerSuppliedMaterials) {
    checks.push({
      severity: "info",
      message: "Owner-supplied materials are enabled. Confirm delivery timing and product compatibility before scheduling.",
    });
  }

  if (options.includePermitAllowance) {
    checks.push({
      severity: "info",
      message: "A permit allowance is included. Confirm whether the scope truly requires permit review before sending the final quote.",
    });
  }

  if (client) {
    if (!client.firstName.trim() || !client.lastName.trim()) {
      checks.push({
        severity: "warning",
        message: "Client first and last name should be filled in before saving this quote to the CRM.",
      });
    }

    if (!client.address.trim() || !client.city.trim() || !client.zip.trim()) {
      checks.push({
        severity: "warning",
        message: "Property address details are incomplete. Add them before turning this estimate into a customer record.",
      });
    }

    if (!client.email.trim() && !client.phone.trim()) {
      checks.push({
        severity: "warning",
        message: "Add at least one client contact method before sharing or following up on the quote.",
      });
    }
  }

  return checks;
};

export const defaultQuoteBuildOptions = (settings: AppSettings): QuoteBuildOptions => ({
  discountPct: 0,
  contingencyPct: settings.defaultContingencyPct,
  rushJob: false,
  includePermitAllowance: false,
  permitAllowance: 0,
  includeHaulAway: false,
  haulAwayFee: 0,
  customerSuppliedMaterials: false,
  taxExempt: false,
  travelOverrideEnabled: false,
  travelOverrideFee: settings.travelFee,
  crewSize: 2,
});

const normalizeQuoteOptions = (settings: AppSettings, options?: Partial<QuoteBuildOptions>): QuoteBuildOptions => {
  const merged = {
    ...defaultQuoteBuildOptions(settings),
    ...(options || {}),
  };

  return {
    ...merged,
    discountPct: clamp(merged.discountPct, 0, 0.35),
    contingencyPct: clamp(merged.contingencyPct, 0, 0.25),
    permitAllowance: Math.max(0, merged.permitAllowance),
    haulAwayFee: Math.max(0, merged.haulAwayFee),
    travelOverrideFee: Math.max(0, merged.travelOverrideFee),
    crewSize: clamp(Math.round(merged.crewSize || 2), 1, 4),
  };
};

export const buildQuote = (
  projectTitle: string,
  projectSummary: string,
  selections: QuoteSelection[],
  settings: AppSettings,
  client?: ClientIntake,
  options?: Partial<QuoteBuildOptions>,
): QuoteResult => {
  const activeSelections = selections.filter((selection) => selection.quantity > 0 && getTask(selection));
  const normalizedOptions = normalizeQuoteOptions(settings, options);
  const rushMultiplier = normalizedOptions.rushJob ? 1.12 : 1;

  const breakdown: QuoteLineBreakdown[] = activeSelections.map((selection) => {
    const task = getTask(selection)!;
    const quantity = selection.quantity;
    const multiplier = selection.conditionMultiplier * selection.complexityMultiplier * rushMultiplier;
    const lowLabor = roundMoney(task.lowRate * quantity * multiplier);
    const highLabor = roundMoney(task.highRate * quantity * multiplier);
    const laborHours = roundQuantity(task.laborHoursPerUnit * quantity * multiplier);

    const materials = task.defaultMaterials.map((material) => {
      const measuredQuantity = Math.max(
        1,
        quantity * material.quantityPerUnit * task.materialWasteFactor,
      );
      const lowExtendedCost = normalizedOptions.customerSuppliedMaterials
        ? 0
        : roundMoney(measuredQuantity * material.lowUnitCost * selection.conditionMultiplier);
      const highExtendedCost = normalizedOptions.customerSuppliedMaterials
        ? 0
        : roundMoney(measuredQuantity * material.highUnitCost * selection.complexityMultiplier * rushMultiplier);
      return {
        ...material,
        lowExtendedCost,
        highExtendedCost,
      };
    });

    const lowMaterials = roundMoney(materials.reduce((sum, material) => sum + material.lowExtendedCost, 0));
    const highMaterials = roundMoney(materials.reduce((sum, material) => sum + material.highExtendedCost, 0));

    return {
      taskId: task.id,
      category: task.category,
      taskName: task.name,
      quantity,
      unitLabel: task.unitLabel,
      scopeNote: selection.scopeNote,
      lowLabor,
      highLabor,
      lowMaterials,
      highMaterials,
      lowTotal: roundMoney(lowLabor + lowMaterials),
      highTotal: roundMoney(highLabor + highMaterials),
      laborHours,
      customaryIncludes: task.customaryIncludes,
      customaryExcludes: task.customaryExcludes,
      materials,
    };
  });

  const fallbackSelectionSummary = buildSelectionSummary(activeSelections);
  const laborLow = roundMoney(breakdown.reduce((sum, line) => sum + line.lowLabor, 0));
  const laborHigh = roundMoney(breakdown.reduce((sum, line) => sum + line.highLabor, 0));
  const materialsLow = roundMoney(breakdown.reduce((sum, line) => sum + line.lowMaterials, 0));
  const materialsHigh = roundMoney(breakdown.reduce((sum, line) => sum + line.highMaterials, 0));
  const subtotalLow = roundMoney(laborLow + materialsLow);
  const subtotalHigh = roundMoney(laborHigh + materialsHigh);
  const travelFee =
    breakdown.length > 0
      ? normalizedOptions.travelOverrideEnabled
        ? normalizedOptions.travelOverrideFee
        : settings.travelFee
      : 0;
  const permitAllowance = normalizedOptions.includePermitAllowance ? normalizedOptions.permitAllowance : 0;
  const haulAwayFee = normalizedOptions.includeHaulAway ? normalizedOptions.haulAwayFee : 0;
  const markupLow = roundMoney(subtotalLow * settings.lowMarkupPct);
  const markupHigh = roundMoney(subtotalHigh * settings.highMarkupPct);
  const contingencyLow = roundMoney(subtotalLow * normalizedOptions.contingencyPct);
  const contingencyHigh = roundMoney(subtotalHigh * normalizedOptions.contingencyPct);
  const taxableBaseLow = subtotalLow + travelFee + permitAllowance + haulAwayFee + contingencyLow;
  const taxableBaseHigh = subtotalHigh + travelFee + permitAllowance + haulAwayFee + contingencyHigh;
  const taxLow = normalizedOptions.taxExempt ? 0 : roundMoney(taxableBaseLow * settings.taxPct);
  const taxHigh = normalizedOptions.taxExempt ? 0 : roundMoney(taxableBaseHigh * settings.taxPct);
  const discountLow = roundMoney(subtotalLow * normalizedOptions.discountPct);
  const discountHigh = roundMoney(subtotalHigh * normalizedOptions.discountPct);
  const laborHours = roundQuantity(breakdown.reduce((sum, line) => sum + line.laborHours, 0));
  const suggestedCrewSize = inferCrewSize(laborHours, normalizedOptions.crewSize);
  const estimatedDays = Math.max(1, Math.ceil(laborHours / Math.max(1, suggestedCrewSize * 8)));
  const categories = Array.from(new Set(activeSelections.map((selection) => getTask(selection)!.category)));
  const categoryTotals = buildCategoryTotals(breakdown);
  const materialRollup = buildMaterialRollup(breakdown);
  const validityDays = Math.max(1, Math.round(settings.defaultQuoteValidityDays || 14));
  const now = Date.now();
  const quoteExpiresAt = new Date(now + validityDays * 24 * 60 * 60 * 1000).toISOString();
  const totalLow = roundMoney(
    subtotalLow + markupLow + contingencyLow + taxLow + travelFee + haulAwayFee + permitAllowance - discountLow,
  );
  const totalHigh = roundMoney(
    subtotalHigh + markupHigh + contingencyHigh + taxHigh + travelFee + haulAwayFee + permitAllowance - discountHigh,
  );
  const budgetFit = buildBudgetFit(client?.budget ?? 0, totalLow, totalHigh);
  const paymentSchedule = buildPaymentSchedule(settings, totalLow, totalHigh, estimatedDays);
  const assumptions = buildQuoteAssumptions(breakdown, { ...normalizedOptions, crewSize: suggestedCrewSize }, estimatedDays, validityDays);
  const exclusions = buildQuoteExclusions(breakdown, normalizedOptions);
  const scopeComplexityScore = roundQuantity(
    breakdown.reduce(
      (sum, line) =>
        sum + Math.max(1, line.laborHours / 4) + (line.scopeNote.trim() ? 0.4 : 0) + (line.category === "roofing" ? 0.75 : 0),
      0,
    ),
  );
  const healthChecks = buildQuoteHealthChecks(
    client,
    { ...normalizedOptions, crewSize: suggestedCrewSize },
    budgetFit,
    breakdown,
    projectTitle,
  );

  return {
    id: `quote-${Date.now()}`,
    projectTitle: projectTitle.trim() || fallbackSelectionSummary.projectTitle,
    projectSummary: projectSummary.trim() || fallbackSelectionSummary.summary,
    categories,
    selections: activeSelections,
    breakdown,
    categoryTotals,
    materialRollup,
    assumptions,
    exclusions,
    paymentSchedule,
    budgetFit,
    healthChecks,
    options: {
      ...normalizedOptions,
      crewSize: suggestedCrewSize,
    },
    validityDays,
    quoteExpiresAt,
    estimatedDays,
    suggestedCrewSize,
    scopeComplexityScore,
    totals: {
      laborLow,
      laborHigh,
      materialsLow,
      materialsHigh,
      subtotalLow,
      subtotalHigh,
      markupLow,
      markupHigh,
      contingencyLow,
      contingencyHigh,
      taxLow,
      taxHigh,
      travelFee,
      haulAwayFee,
      permitAllowance,
      discountLow,
      discountHigh,
      totalLow,
      totalHigh,
      laborHours,
    },
    generatedAt: new Date(now).toISOString(),
  };
};

export const validateClientForSave = (client: ClientIntake) => {
  const issues: string[] = [];

  if (!client.firstName.trim()) issues.push("First name is required.");
  if (!client.lastName.trim()) issues.push("Last name is required.");
  if (!client.address.trim()) issues.push("Home address is required.");
  if (!client.city.trim()) issues.push("City is required.");
  if (!client.state.trim()) issues.push("State is required.");
  if (!client.zip.trim()) issues.push("Zip code is required.");
  if (!client.phone.trim() && !client.email.trim()) issues.push("Add at least a phone number or email address.");
  if (!client.requestedJobs.trim()) issues.push("Describe the requested job before saving.");
  if (client.consultationRequested && !client.consultationDate) issues.push("Pick a preferred consultation date.");
  if (client.consultationRequested && !client.consultationTime) issues.push("Pick a preferred consultation time.");

  return issues;
};

export const validateClientForEmail = (client: ClientIntake) => {
  const issues = validateClientForSave(client);
  if (!client.email.trim()) {
    issues.push("Client email is required before sending a quote.");
  }

  return unique(issues);
};

export const suggestNextFollowUpDate = (client: ClientIntake, quote?: QuoteResult) => {
  const days =
    client.jobStatus === "Completed"
      ? 30
      : client.jobStatus === "In-Progress"
        ? 3
        : /emergency|urgent|leak|no heat|no ac|electrical/i.test(
            `${client.emergencyIssues} ${client.requestedJobs}`,
          )
          ? 1
          : quote?.budgetFit.status === "over-budget"
            ? 2
            : 5;

  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

export const suggestAidPrograms = (
  intake: Pick<ClientIntake, "city" | "zip" | "budget" | "emergencyIssues" | "notes" | "requestedJobs">,
  selections: QuoteSelection[],
): AidProgram[] => {
  const categories = selections
    .map((selection) => taskIndex.get(selection.taskId)?.category)
    .filter((value): value is ServiceCategory => Boolean(value));

  const text = `${intake.emergencyIssues} ${intake.notes} ${intake.requestedJobs}`.toLowerCase();
  const suggestions: AidProgram[] = [];

  if (categories.includes("roofing") || text.includes("roof")) {
    suggestions.push(aidPrograms.find((program) => program.id === "decatur-roof")!);
  }

  if (
    categories.includes("electrical-hvac") ||
    text.includes("furnace") ||
    text.includes("electrical") ||
    text.includes("air conditioning") ||
    text.includes("ac") ||
    text.includes("heating")
  ) {
    suggestions.push(aidPrograms.find((program) => program.id === "decatur-emergency")!);
    suggestions.push(aidPrograms.find((program) => program.id === "ihwap")!);
  }

  if (text.includes("veteran")) {
    suggestions.push(aidPrograms.find((program) => program.id === "macon-veterans")!);
  }

  if (text.includes("accessibility") || text.includes("grab bar") || text.includes("senior") || text.includes("disability")) {
    suggestions.push(aidPrograms.find((program) => program.id === "usda-504")!);
  }

  if (intake.budget < 5000 || text.includes("help") || text.includes("payment") || text.includes("assistance")) {
    suggestions.push(aidPrograms.find((program) => program.id === "empowerment-opportunity-center")!);
  }

  if (intake.city.toLowerCase() !== "decatur" || !["62521", "62522", "62523", "62526"].includes(intake.zip)) {
    suggestions.push(aidPrograms.find((program) => program.id === "usda-504")!);
  }

  return suggestions.filter((program, index, array) => array.findIndex((item) => item.id === program.id) === index);
};

export const findSimilarHistoricalJobs = (
  selections: QuoteSelection[],
  historicalJobs: HistoricalJob[],
): SimilarJobMatch[] => {
  const categories = new Set(
    selections
      .map((selection) => taskIndex.get(selection.taskId)?.category)
      .filter((value): value is ServiceCategory => Boolean(value)),
  );

  return historicalJobs
    .map((job) => {
      const sharedCategories = job.categories.filter((category) => categories.has(category)).length;
      const similarity = sharedCategories / Math.max(1, categories.size);
      return {
        ...job,
        similarity,
      };
    })
    .filter((job) => job.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 4);
};

const guessQuantityFromSpeech = (taskId: string, transcript: string, extractedNumbers: number[]) => {
  const lowerText = transcript.toLowerCase();
  const areaMatch = areaPattern.exec(lowerText);
  const roomMatch = roomPattern.exec(lowerText);
  const linearMatch = linearPattern.exec(lowerText);
  const fixtureMatch = fixturePattern.exec(lowerText);
  const fallbackNumber = extractedNumbers.find((value) => value > 0);

  if (taskId.startsWith("paint-") && areaMatch) {
    return Number(areaMatch[1]);
  }

  if (taskId.startsWith("roof-") && areaMatch) {
    return Number(areaMatch[1]);
  }

  if (taskId.startsWith("floor-") && areaMatch) {
    return Number(areaMatch[1]);
  }

  if (taskId === "paint-trim" && linearMatch) {
    return Number(linearMatch[1]);
  }

  if ((taskId.startsWith("ehvac-") || taskId.startsWith("handy-")) && fixtureMatch) {
    return Number(fixtureMatch[1]);
  }

  if (roomMatch && (taskId.startsWith("paint-") || taskId.startsWith("handy-"))) {
    return Number(roomMatch[1]) * 1;
  }

  return fallbackNumber && fallbackNumber <= 10000 ? fallbackNumber : undefined;
};

export const analyzeSpeechInput = (transcript: string): SpeechAssistResult => {
  const text = transcript.toLowerCase();
  const matchedTaskIds = keywordToTask
    .filter(({ words }) => words.some((word) => text.includes(word)))
    .map(({ taskId }) => taskId);
  const uniqueTaskIds = Array.from(new Set(matchedTaskIds));
  const categories = Array.from(
    new Set(
      uniqueTaskIds
        .map((taskId) => taskIndex.get(taskId)?.category)
        .filter((value): value is ServiceCategory => Boolean(value)),
    ),
  );
  const extractedNumbers = Array.from(transcript.matchAll(/\b\d+(?:\.\d+)?\b/g)).map((match) => Number(match[0]));
  const quantityHints = Object.fromEntries(
    uniqueTaskIds
      .map((taskId) => {
        const quantity = guessQuantityFromSpeech(taskId, transcript, extractedNumbers);
        return quantity ? [taskId, quantity] : null;
      })
      .filter((value): value is [string, number] => Boolean(value)),
  );
  const urgencyFlag = /urgent|asap|emergency|today|leak|no heat|no ac/i.test(transcript);

  return {
    summary:
      uniqueTaskIds.length > 0
        ? `Detected ${uniqueTaskIds.length} likely scope item(s) from speech${Object.keys(quantityHints).length ? " with quantity hints" : ""}. Review quantities and conditions before finalizing.`
        : "No strong task match detected yet. Try describing the trade, location, measurements, and urgency.",
    categories,
    taskIds: uniqueTaskIds,
    extractedNumbers,
    quantityHints,
    followUpPrompts: unique(
      [
        "What are the room sizes, square footage, or fixture counts?",
        "Is this an emergency repair or a scheduled improvement?",
        "Are materials owner-supplied, contractor-supplied, or still undecided?",
        urgencyFlag ? "Does this need same-day or next-day scheduling?" : "",
      ].filter(Boolean),
    ),
  };
};

export const analyzeUploadedImages = (
  files: File[],
  activeCategories: ServiceCategory[],
): ImageAssistResult => {
  const fileNames = files.map((file) => file.name.toLowerCase()).join(" ");
  const inferredTasks = new Set<string>();
  const riskFlags: string[] = [];
  const quantityHints: Record<string, number> = {};

  if (activeCategories.includes("roofing") || fileNames.includes("roof")) {
    inferredTasks.add("roof-repair");
    riskFlags.push("Confirm roof pitch, story height, and whether decking damage is visible.");
  }

  if (activeCategories.includes("painting") || fileNames.includes("wall") || fileNames.includes("ceiling")) {
    inferredTasks.add("paint-interior-walls");
    if (fileNames.includes("ceiling")) {
      inferredTasks.add("paint-ceilings");
    }
    riskFlags.push("Check for water staining, texture mismatch, and furniture protection needs.");
  }

  if (activeCategories.includes("flooring") || fileNames.includes("floor")) {
    inferredTasks.add("floor-lvp");
    if (fileNames.includes("subfloor")) {
      inferredTasks.add("subfloor-repair");
    }
    riskFlags.push("Confirm subfloor flatness, transitions, and appliance/furniture move scope.");
  }

  if (activeCategories.includes("handiwork")) {
    inferredTasks.add("handy-hourly");
  }

  if (activeCategories.includes("electrical-hvac")) {
    inferredTasks.add("ehvac-tuneup");
    riskFlags.push("Photos alone cannot verify electrical load, thermostat wiring, or refrigerant issues.");
  }

  files.forEach((file, index) => {
    const match = file.name.match(/(\d+(?:\.\d+)?)\s*(sqft|sf|lf|ft|rooms?)/i);
    if (match && index === 0 && inferredTasks.has("paint-interior-walls")) {
      quantityHints["paint-interior-walls"] = Number(match[1]);
    }
  });

  return {
    summary:
      files.length > 0
        ? `Image review captured likely scope areas from ${files.length} uploaded file(s). Use these prompts to tighten the quote before sending.`
        : "Upload photos of the problem area or finished surfaces to improve job matching.",
    riskFlags,
    taskIds: Array.from(inferredTasks),
    quantityHints,
    followUpPrompts: [
      "Capture one wide room photo, one close detail photo, and one measurement photo.",
      "Add notes about water damage, age of materials, and any hidden conditions.",
      "Confirm whether the homeowner wants repair only or repair plus finish work.",
    ],
  };
};
