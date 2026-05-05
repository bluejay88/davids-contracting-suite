import { createServer } from "node:http";

const port = Number(process.env.MOCK_INTEGRATIONS_PORT || 4310);

const readJsonBody = async (request) =>
  new Promise((resolve, reject) => {
    let raw = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
};

const mockScopePlan = (payload) => {
  const taskSuggestions = payload?.payload?.currentSelections?.length
    ? payload.payload.currentSelections.map((selection) => ({
        taskId: selection.taskId,
        quantity: selection.quantity || 1,
        conditionMultiplier: selection.conditionMultiplier || 1,
        complexityMultiplier: selection.complexityMultiplier || 1,
        scopeNote: selection.scopeNote || "Mock webhook confirmed the selected scope.",
        rationale: "Mock AI webhook replayed the current selections for testing.",
      }))
    : [
        {
          taskId: "paint-interior-walls",
          quantity: 220,
          conditionMultiplier: 1.05,
          complexityMultiplier: 1.04,
          scopeNote: "Mock wall paint scope for testing.",
          rationale: "Mock webhook fallback scope.",
        },
      ];

  return {
    projectTitle: "Mock AI Scope Plan",
    projectSummary: "Mock AI webhook responded with a valid quote-autofill plan.",
    suggestedRequestedJobs: "Interior paint scope verified by mock AI",
    suggestedEmergencyIssues: "",
    suggestedNotes: "Mock webhook confirmed the estimator AI request path.",
    categories: ["painting"],
    taskSuggestions,
    followUpQuestions: ["Confirm exact measured square footage before sending the final quote."],
    riskFlags: ["Mock AI test does not inspect real images."],
    similarJobIds: [],
    confidenceNote: "Mock AI webhook returned a valid structured scope plan.",
    programs: [],
    materials: [],
  };
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/ai") {
      const body = await readJsonBody(request);

      if (body.action === "health-check") {
        sendJson(response, 200, {
          ok: true,
          message: "Mock AI webhook is reachable.",
        });
        return;
      }

      if (body.action === "scope-plan") {
        sendJson(response, 200, mockScopePlan(body));
        return;
      }

      if (body.action === "aid-programs") {
        sendJson(response, 200, [
          {
            name: "Mock Home Repair Support",
            provider: "Mock Community Program",
            focus: "General repair assistance",
            eligibilityHint: "Owner-occupant households",
            url: "https://example.org/mock-aid",
            reasoning: "Mock webhook program response for testing.",
            source: "live-search",
          },
        ]);
        return;
      }

      if (body.action === "material-plan") {
        sendJson(response, 200, [
          {
            name: "Mock Interior Paint",
            taskId: "paint-interior-walls",
            quantity: 6,
            unit: "gallon",
            supplierId: "sherwin-retail",
            supplierName: "Sherwin-Williams Paint Store",
            estimatedLow: 210,
            estimatedHigh: 360,
            sourceNote: "Mock supplier response",
            reasoning: "Mock webhook material response for testing.",
          },
        ]);
        return;
      }

      if (body.action === "transcribe-audio") {
        sendJson(response, 200, {
          transcript: "Mock audio transcript for estimator testing.",
        });
        return;
      }

      sendJson(response, 404, {
        ok: false,
        message: `Unsupported AI action: ${body.action || "unknown"}`,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/email") {
      const body = await readJsonBody(request);
      if (body.healthCheck) {
        sendJson(response, 200, {
          ok: true,
          message: "Mock email webhook is reachable.",
        });
        return;
      }

      if (body.consultationConfirmation) {
        sendJson(response, 200, {
          ok: true,
          message: `Mock consultation confirmation accepted for ${body.to || "unknown-recipient"}.`,
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        message: `Mock quote email accepted for ${body.to || "unknown-recipient"}.`,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/sheets") {
      const body = await readJsonBody(request);
      if (body.type === "health-check") {
        sendJson(response, 200, {
          ok: true,
          message: "Mock Google Sheets webhook is reachable.",
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        message: "Mock Google Sheets accepted the quote payload.",
      });
      return;
    }

    sendJson(response, 404, {
      ok: false,
      message: `No mock route matched ${url.pathname}.`,
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      message: error instanceof Error ? error.message : "Mock integration server error.",
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-integrations] listening on http://127.0.0.1:${port}`);
});
