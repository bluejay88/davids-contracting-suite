import jsPDF from "jspdf";
import { AppSettings, ClientIntake, QuoteResult } from "../types";
import { formatCurrency } from "./estimates";

const PAGE_HEIGHT = 279;
const PAGE_WIDTH = 216;
const CONTENT_LEFT = 14;
const CONTENT_RIGHT = 198;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;

const loadImageAsDataUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const addWrappedText = (
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5.5,
) => {
  const lines = pdf.splitTextToSize(text, maxWidth);
  lines.forEach((line: string, index: number) => {
    pdf.text(line, x, y + index * lineHeight);
  });
  return y + lines.length * lineHeight;
};

const applyPageBackground = (pdf: jsPDF) => {
  pdf.setFillColor(8, 8, 8);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");
};

const ensureSpace = (pdf: jsPDF, cursorY: number, neededHeight: number, heading?: string) => {
  if (cursorY + neededHeight <= 250) {
    return cursorY;
  }

  pdf.addPage("letter", "p");
  applyPageBackground(pdf);
  pdf.setTextColor(223, 186, 102);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(heading || "Quote Details (cont.)", CONTENT_LEFT, 18);
  pdf.setFontSize(10);
  pdf.setTextColor(238, 238, 238);
  pdf.setFont("helvetica", "normal");
  return 28;
};

const drawSectionHeading = (pdf: jsPDF, title: string, cursorY: number) => {
  pdf.setTextColor(223, 186, 102);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(title, CONTENT_LEFT, cursorY);
  pdf.setDrawColor(223, 186, 102);
  pdf.line(CONTENT_LEFT, cursorY + 2, CONTENT_RIGHT, cursorY + 2);
  pdf.setTextColor(238, 238, 238);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  return cursorY + 9;
};

export const buildQuotePdfBlob = async (
  quote: QuoteResult,
  client: ClientIntake,
  settings: AppSettings,
) => {
  const pdf = new jsPDF("p", "mm", "letter");
  const logo = await loadImageAsDataUrl("/davids-contracting-logo.png");

  applyPageBackground(pdf);

  if (logo) {
    pdf.addImage(logo, "PNG", 14, 12, 34, 34);
  }

  pdf.setTextColor(223, 186, 102);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(settings.repProfile.companyName, 54, 22);

  pdf.setTextColor(238, 238, 238);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(settings.repProfile.repName, 54, 29);
  pdf.text(`${settings.repProfile.title}`, 54, 34);
  pdf.text(`${settings.repProfile.phone}  |  ${settings.repProfile.email}`, 54, 39);
  pdf.text(`Generated: ${new Date(quote.generatedAt).toLocaleString()}`, 54, 44);

  pdf.setDrawColor(223, 186, 102);
  pdf.line(CONTENT_LEFT, 52, CONTENT_RIGHT, 52);

  pdf.setTextColor(223, 186, 102);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Client Quote & Estimate Range", CONTENT_LEFT, 62);

  pdf.setTextColor(238, 238, 238);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`Prepared for: ${client.firstName} ${client.lastName}`, CONTENT_LEFT, 70);
  pdf.text(`Address: ${client.address}, ${client.city}, ${client.state} ${client.zip}`, CONTENT_LEFT, 76);
  pdf.text(`Email: ${client.email || "Not provided"}  |  Phone: ${client.phone || "Not provided"}`, CONTENT_LEFT, 82);
  pdf.text(`Project: ${quote.projectTitle}`, CONTENT_LEFT, 88);
  pdf.text(`Quote valid through: ${new Date(quote.quoteExpiresAt).toLocaleDateString()}`, CONTENT_LEFT, 94);

  let cursorY = 103;
  cursorY = addWrappedText(
    pdf,
    `Summary: ${quote.projectSummary || "Custom contractor estimate prepared from scope inputs."}`,
    CONTENT_LEFT,
    cursorY,
    CONTENT_WIDTH,
  );
  cursorY += 4;

  cursorY = ensureSpace(pdf, cursorY, 34, "Estimate Range");
  cursorY = drawSectionHeading(pdf, "Estimate Range", cursorY);

  pdf.setFont("helvetica", "bold");
  pdf.text(`Low Estimate: ${formatCurrency(quote.totals.totalLow)}`, CONTENT_LEFT, cursorY);
  pdf.text(`High Estimate: ${formatCurrency(quote.totals.totalHigh)}`, 110, cursorY);
  cursorY += 7;
  pdf.setFont("helvetica", "normal");
  pdf.text(`Labor: ${formatCurrency(quote.totals.laborLow)} - ${formatCurrency(quote.totals.laborHigh)}`, CONTENT_LEFT, cursorY);
  pdf.text(
    `Materials: ${formatCurrency(quote.totals.materialsLow)} - ${formatCurrency(quote.totals.materialsHigh)}`,
    110,
    cursorY,
  );
  cursorY += 6;
  pdf.text(`Markup: ${formatCurrency(quote.totals.markupLow)} - ${formatCurrency(quote.totals.markupHigh)}`, CONTENT_LEFT, cursorY);
  pdf.text(
    `Contingency: ${formatCurrency(quote.totals.contingencyLow)} - ${formatCurrency(quote.totals.contingencyHigh)}`,
    110,
    cursorY,
  );
  cursorY += 6;
  pdf.text(`Tax: ${formatCurrency(quote.totals.taxLow)} - ${formatCurrency(quote.totals.taxHigh)}`, CONTENT_LEFT, cursorY);
  pdf.text(`Travel / Mobilization: ${formatCurrency(quote.totals.travelFee)}`, 110, cursorY);
  cursorY += 6;
  if (quote.totals.haulAwayFee > 0 || quote.totals.permitAllowance > 0 || quote.totals.discountLow > 0) {
    pdf.text(`Haul-away: ${formatCurrency(quote.totals.haulAwayFee)}`, CONTENT_LEFT, cursorY);
    pdf.text(`Permit allowance: ${formatCurrency(quote.totals.permitAllowance)}`, 110, cursorY);
    cursorY += 6;
    if (quote.totals.discountLow > 0 || quote.totals.discountHigh > 0) {
      pdf.text(
        `Discount: ${formatCurrency(quote.totals.discountLow)} - ${formatCurrency(quote.totals.discountHigh)}`,
        CONTENT_LEFT,
        cursorY,
      );
      cursorY += 6;
    }
  }
  pdf.text(`Estimated labor: ${quote.totals.laborHours.toFixed(1)} hrs`, CONTENT_LEFT, cursorY);
  pdf.text(`Crew / duration: ${quote.suggestedCrewSize} person(s) / about ${quote.estimatedDays} day(s)`, 110, cursorY);
  cursorY += 9;

  cursorY = ensureSpace(pdf, cursorY, 20, "Budget & Payment");
  cursorY = drawSectionHeading(pdf, "Budget & Payment", cursorY);
  pdf.text(`Budget fit: ${quote.budgetFit.note}`, CONTENT_LEFT, cursorY);
  cursorY += 7;
  quote.paymentSchedule.forEach((milestone) => {
    cursorY = ensureSpace(pdf, cursorY, 12, "Payment Schedule");
    pdf.setFont("helvetica", "bold");
    pdf.text(
      `${milestone.label}: ${formatCurrency(milestone.lowAmount)} - ${formatCurrency(milestone.highAmount)}`,
      CONTENT_LEFT,
      cursorY,
    );
    cursorY += 5;
    pdf.setFont("helvetica", "normal");
    cursorY = addWrappedText(pdf, milestone.notes, CONTENT_LEFT, cursorY, CONTENT_WIDTH);
    cursorY += 2;
  });

  cursorY = ensureSpace(pdf, cursorY, 30, "Category Totals");
  cursorY = drawSectionHeading(pdf, "Category Totals", cursorY);
  quote.categoryTotals.forEach((total) => {
    cursorY = ensureSpace(pdf, cursorY, 8, "Category Totals");
    pdf.text(
      `${total.label}: ${formatCurrency(total.lowTotal)} - ${formatCurrency(total.highTotal)} | ${total.laborHours.toFixed(1)} hrs`,
      CONTENT_LEFT,
      cursorY,
    );
    cursorY += 6;
  });

  cursorY = ensureSpace(pdf, cursorY, 40, "Scope Breakdown");
  cursorY = drawSectionHeading(pdf, "Scope Breakdown", cursorY);
  quote.breakdown.forEach((line) => {
    cursorY = ensureSpace(pdf, cursorY, 20, "Scope Breakdown");
    pdf.setFont("helvetica", "bold");
    pdf.text(
      `${line.taskName} | ${line.quantity} ${line.unitLabel} | ${formatCurrency(line.lowTotal)} - ${formatCurrency(line.highTotal)}`,
      CONTENT_LEFT,
      cursorY,
    );
    cursorY += 5;
    pdf.setFont("helvetica", "normal");
    pdf.text(
      `Labor ${formatCurrency(line.lowLabor)} - ${formatCurrency(line.highLabor)} | Materials ${formatCurrency(line.lowMaterials)} - ${formatCurrency(line.highMaterials)} | ${line.laborHours.toFixed(1)} hrs`,
      CONTENT_LEFT,
      cursorY,
    );
    cursorY += 5;
    if (line.scopeNote.trim()) {
      cursorY = addWrappedText(pdf, `Scope note: ${line.scopeNote}`, CONTENT_LEFT, cursorY, CONTENT_WIDTH);
      cursorY += 1;
    }
    cursorY += 3;
  });

  if (quote.materialRollup.length) {
    cursorY = ensureSpace(pdf, cursorY, 36, "Material Shopping List");
    cursorY = drawSectionHeading(pdf, "Material Shopping List", cursorY);
    quote.materialRollup.slice(0, 10).forEach((material) => {
      cursorY = ensureSpace(pdf, cursorY, 8, "Material Shopping List");
      pdf.text(
        `${material.name}: ${material.totalQuantity.toFixed(1)} ${material.unit} | ${formatCurrency(material.lowTotal)} - ${formatCurrency(material.highTotal)}`,
        CONTENT_LEFT,
        cursorY,
      );
      cursorY += 6;
    });
  }

  cursorY = ensureSpace(pdf, cursorY, 34, "Assumptions & Exclusions");
  cursorY = drawSectionHeading(pdf, "Assumptions & Exclusions", cursorY);
  pdf.setFont("helvetica", "bold");
  pdf.text("Assumptions", CONTENT_LEFT, cursorY);
  cursorY += 6;
  pdf.setFont("helvetica", "normal");
  quote.assumptions.slice(0, 8).forEach((item) => {
    cursorY = ensureSpace(pdf, cursorY, 7, "Assumptions & Exclusions");
    cursorY = addWrappedText(pdf, `• ${item}`, CONTENT_LEFT, cursorY, CONTENT_WIDTH);
    cursorY += 1;
  });
  cursorY += 3;
  pdf.setFont("helvetica", "bold");
  pdf.text("Exclusions", CONTENT_LEFT, cursorY);
  cursorY += 6;
  pdf.setFont("helvetica", "normal");
  quote.exclusions.slice(0, 8).forEach((item) => {
    cursorY = ensureSpace(pdf, cursorY, 7, "Assumptions & Exclusions");
    cursorY = addWrappedText(pdf, `• ${item}`, CONTENT_LEFT, cursorY, CONTENT_WIDTH);
    cursorY += 1;
  });

  if (quote.healthChecks.length) {
    cursorY += 3;
    cursorY = ensureSpace(pdf, cursorY, 18, "Estimator Notes");
    pdf.setFont("helvetica", "bold");
    pdf.text("Estimator Notes", CONTENT_LEFT, cursorY);
    cursorY += 6;
    pdf.setFont("helvetica", "normal");
    quote.healthChecks.slice(0, 5).forEach((item) => {
      cursorY = ensureSpace(pdf, cursorY, 7, "Estimator Notes");
      cursorY = addWrappedText(pdf, `• ${item.message}`, CONTENT_LEFT, cursorY, CONTENT_WIDTH);
      cursorY += 1;
    });
  }

  return pdf.output("blob");
};
