# AI + AR Innovation Roadmap

This roadmap packages `75` enhancements into a scalable product plan for a contractor-first system that can outperform today's estimating, CRM, and field-capture tools.

## 1. Estimating Intelligence (10)

1. `AI scope composer`: convert intake notes, photos, and measurements into structured scope sections by trade.
2. `Confidence-aware pricing bands`: show low/high ranges with confidence and missing-data warnings.
3. `Revision intelligence`: compare estimate versions and explain cost deltas line by line.
4. `Historical job retrieval`: match new jobs against similar past quotes using text, images, and scope structure.
5. `Allowance optimizer`: suggest better contingency, deposit, and permit allowances by job profile.
6. `Hidden-condition prompts`: detect where a quote likely needs caveats before it is sent.
7. `Trade bundle suggestions`: recommend common cross-sell bundles like paint + drywall or leak repair + ceiling refinish.
8. `Negotiation assistant`: generate alternates, phased options, and owner-budget-fit proposals.
9. `Production-rate tuning`: learn labor-hour ranges from prior completed jobs.
10. `Scope completeness score`: warn when the quote is missing critical measurements, media, or field assumptions.

## 2. Vision + AR Capture (10)

11. `Guided AR walkthrough`: direct the user to capture walls, floors, ceilings, doors, windows, and fixtures in sequence.
12. `Room segmentation`: separate captured media into rooms or zones automatically.
13. `Surface-type detection`: infer drywall, trim, laminate, shingle, siding, tile, and similar finish types.
14. `Damage spotting`: highlight moisture stains, roof distress, floor buckling, failed caulk, and visible cracks.
15. `Measurement overlay`: show estimated dimensions directly on captured images or scan frames.
16. `Measurement confidence heatmap`: flag areas where scan quality is weak and rescan is needed.
17. `Annotated homeowner capture mode`: allow the homeowner to self-capture while the app guides them.
18. `Remote consult packet`: package photos, notes, sketch geometry, and risk flags before the onsite visit.
19. `AR material preview`: place paint colors, siding, flooring, or roofing options onto the captured model.
20. `Scan-to-line-item takeoff`: convert measured surfaces into proposed line items with editable assumptions.

## 3. Materials + Procurement AI (10)

21. `Supplier price snapshots`: keep dated observations from Lowe's, Menards, Sherwin-Williams, Amazon, Walmart, and local yards.
22. `Waste-aware ordering`: suggest realistic order quantities with waste and breakage buffers.
23. `Substitution engine`: suggest alternates when stock, price, or lead time changes.
24. `Lead-time risk alerts`: warn when quoted materials may delay the promised schedule.
25. `Local basket builder`: group estimated materials into store-ready purchase baskets.
26. `Price movement explanation`: explain why today's material range differs from prior quotes.
27. `Crew pickup planner`: split materials into first-trip, mid-job, and closeout pickups.
28. `Owner-supplied material controls`: show which scope items shift risk when the homeowner buys materials.
29. `Inventory reservation`: track what is already committed to active jobs.
30. `Margin-safe markup suggestions`: adjust markup guidance when supply volatility is high.

## 4. CRM + Sales AI (10)

31. `Lead scoring`: rank incoming homeowner requests by urgency, fit, budget, and close likelihood.
32. `Reply drafting`: generate branded follow-up emails and SMS messages for each funnel stage.
33. `Consultation readiness`: tell the owner which leads are ready for a site visit versus needing more data first.
34. `Contact preference intelligence`: learn whether a client answers fastest by call, text, or email.
35. `Aid and financing fit`: suggest programs, payment plans, or financing talking points by job type and household context.
36. `Decline reason analytics`: learn which jobs are being lost and why.
37. `Upsell opportunity prompts`: identify likely add-ons before the contractor sends the quote.
38. `Referral request timing`: recommend the best closeout moment to request a review or referral.
39. `Dormant lead resurrection`: surface older leads that now match available crew bandwidth or seasonal work.
40. `Brand-safe website intake`: replace generic embedded forms with a flexible public quote-start flow.

## 5. Operations + Scheduling (8)

41. `Crew-aware consultation scheduling`: suggest appointment windows based on actual labor capacity.
42. `Route intelligence`: cluster same-area visits to reduce windshield time.
43. `Emergency triage`: push critical issues like leaks, no heat, or safety hazards to faster workflows.
44. `Double-booking prevention`: enforce resource and travel constraints in the backend.
45. `Phased job planning`: split work into mitigation, primary scope, and finish scope when needed.
46. `Weather-aware scheduling`: flag rain, temperature, or storm risk on exterior jobs.
47. `Consultation fee logic`: allow free or paid consult flows by trade and service area policy.
48. `No-show recovery flows`: auto-trigger reschedule and follow-up sequences.

## 6. Field Execution + QA (8)

49. `Before-and-after proof packets`: tie completion evidence to quote lines and rooms.
50. `Punch-list generator`: create issue lists from inspection photos and field notes.
51. `Change-order detection`: compare original scope to new media/notes and suggest change orders.
52. `Field checklist builder`: generate job-specific site prep and closeout checklists.
53. `Safety prompt engine`: remind crews about ladders, electrical isolation, PPE, and hazard controls.
54. `Warranty-ready closeout`: package scope, materials, photos, and client sign-off for future service.
55. `Subcontractor handoff packet`: send scoped, room-specific instructions to partner crews.
56. `Quality scoring`: track rework risk and homeowner satisfaction signals across completed jobs.

## 7. Finance + Risk (6)

57. `Margin drift alerts`: notify when scope creep or material updates erode margin.
58. `Deposit recommendation engine`: suggest deposit structure by job size, risk, and lead time.
59. `Payment collection forecasting`: predict slow-pay risk and prompt earlier follow-up.
60. `Cash-flow board`: connect quoted work, scheduled work, receivables, and payroll exposure.
61. `Fraud and anomaly checks`: flag suspicious payment, quote, or contact patterns.
62. `Insurance-claim mode`: tailor documentation and estimate packaging for claim-backed work.

## 8. Data Platform + Integrations (6)

63. `Normalized CRM backend`: replace the single document state with scalable entities.
64. `Async AI job pipeline`: process image, audio, and AR analysis through background jobs.
65. `Asset registry`: store photos, audio, PDFs, and scan files with metadata and permissions.
66. `Vector memory`: embed historical jobs, transcripts, and scope notes for semantic retrieval.
67. `Versioned webhook/API contracts`: decouple future mobile apps and integrations from nested app-state payloads.
68. `Warehouse feed`: export immutable business events for analytics and forecasting.

## 9. Workforce + Knowledge (4)

69. `Crew skill map`: assign work based on trade depth, pace, and certification history.
70. `SOP retrieval assistant`: surface the right process note while estimating or executing.
71. `New-hire coaching mode`: guide less experienced techs through scope capture and documentation.
72. `Knowledge capture from completed jobs`: turn successful projects into reusable playbooks.

## 10. Owner Analytics + Strategy (3)

73. `Profitability by trade and crew`: show true margin performance by service type and labor mix.
74. `Service-area intelligence`: identify zip codes, trades, and seasons driving the best return.
75. `Owner command center`: combine funnel, operations, finance, and AI system health in one board.

## Best-bet launch sequence

### Phase 1

- AI scope composer
- guided AR walkthrough
- historical job retrieval
- lead scoring
- supplier price snapshots
- append-only quote revisions
- asset registry
- async AI job pipeline

### Phase 2

- scan-to-line-item takeoff
- weather-aware scheduling
- change-order detection
- margin drift alerts
- vector memory
- warehouse feed

### Phase 3

- AR material preview
- quality scoring
- service-area intelligence
- owner command center

## Why this roadmap can beat current market tools

- It combines field capture, estimating, CRM, owner analytics, and AI provenance in one lifecycle.
- It treats AI as a system of record with memory and citations instead of one-off generated text.
- It turns homeowner self-serve capture into a real lead-generation and prequalification channel.
- It makes AR and vision practical for contractors by tying them directly to pricing, materials, and follow-up.
