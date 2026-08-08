# Production Enhancement Register — 2026-08-02

This register counts only distinct, implemented, and testable outcomes from the current release pass. It does not inflate formatting edits into a claim of 400 completed production features.

## Implemented in this release

1. Replaced the low-contrast header Login styling with a navy button, white text, and orange border.
2. Added a stronger hover state to the header Login control.
3. Added a keyboard-visible focus treatment to the header Login control.
4. Added a Team & Owner Login control to the homepage footer.
5. Added a login icon and descriptive label to the homepage footer control.
6. Added a shared footer to every non-dashboard public page.
7. Added Home, Gallery, Careers, and Contact navigation to the shared public footer.
8. Added role-aware Login/Logout behavior to the shared public footer.
9. Added responsive stacking for the shared footer on small screens.
10. Removed public starter Owner username hints from initial client state.
11. Removed public starter Contractor email hints from initial client state.
12. Removed public login identifiers from the Netlify bootstrap response.
13. Removed public login identifiers from the local Node bootstrap response.
14. Replaced credential placeholders with neutral instructions.
15. Removed the starter username from the locked Owner-workspace message.
16. Added initial keyboard focus when the login dialog opens.
17. Added Escape-key closing for the login dialog.
18. Added keyboard focus trapping inside the login dialog.
19. Added focus restoration to the control that opened the login dialog.
20. Added an accessible label relationship between the dialog and its heading.
21. Changed the production Netlify session cookie to a `__Host-` cookie.
22. Added the `Secure` attribute to the production session cookie.
23. Rewrote the site meta description for homeowners and contracting customers.
24. Updated the browser theme color to the brand navy.
25. Added Open Graph title metadata.
26. Added Open Graph description metadata.
27. Added Open Graph image metadata.
28. Added Open Graph canonical URL metadata.
29. Added Twitter large-image card metadata.
30. Added a canonical link for the production site.
31. Updated the favicon to the optimized WebP logo.
32. Updated the document title for Decatur, Illinois contracting search intent.
33. Renamed the Owner Settings navigation item to Developer Console.
34. Added an Automation Pipeline activation switch.
35. Added a Basic Online Mode state when model automation is paused.
36. Prevented live-provider activation until the AI connection test succeeds.
37. Automatically pauses automation when the selected AI provider changes.
38. Clears stale AI test results when the selected provider changes.
39. Added `automationEnabled` to the shared application settings model.
40. Added server-side persistence normalization for the automation switch.
41. Added Netlify-function persistence normalization for the automation switch.
42. Made browser AI calls respect the automation switch.
43. Made server AI calls respect the automation switch.
44. Made audio recording fall back to browser speech when automation is paused.
45. Added an explicit Basic Online Estimator provider label.
46. Added Netlify AI Gateway availability detection.
47. Added Netlify AI Gateway support to browser provider readiness checks.
48. Added `OPENAI_BASE_URL` support to the server AI proxy.
49. Added gateway-compatible Responses API routing.
50. Added gateway-compatible Chat Completions routing.
51. Added gateway-compatible audio transcription routing.
52. Made Authorization headers conditional for gateway-managed authentication.
53. Added Netlify AI Gateway wording to connection-test results.
54. Changed new-installation scope and search model defaults to the gateway-supported `gpt-4o-mini`.
55. Added a CAPTCHA/security challenge to public estimate-request submission.
56. Added security payload transmission to public estimate requests.
57. Added public estimate rate-limit enforcement through the existing form-security service.
58. Added server-generated CRM identifiers for public estimate requests.
59. Prevented public requests from selecting an existing CRM identifier.
60. Prevented public requests from setting payment-collected state.
61. Prevented public requests from assigning a crew lead or employee.
62. Added required contact and consent validation to public estimate requests.
63. Added task-count limits to public estimate requests.
64. Added quantity bounds to public estimate selections.
65. Added condition and complexity multiplier bounds.
66. Added accepted-category allowlisting for public estimate requests.
67. Added low/high range validation and a $10 million abuse ceiling.
68. Added bounded sanitization of public estimate breakdown lines.
69. Removed public-submitted material-detail objects from stored breakdowns.
70. Added bounded sanitization of public estimate notes and descriptions.
71. Marked public estimate ranges as planning estimates.
72. Marked public estimate pricing as requiring Owner verification.
73. Added a non-contract disclaimer to stored public estimate requests.
74. Added a field-verification warning to public estimate health checks.
75. Restricted internal quote saving to Contractor/Estimator or Owner sessions.
76. Added equivalent public-request identity and consent protection to the local Node server.

## Verified limitations requiring external production configuration

- The production site currently reports heuristic AI mode and no configured OpenAI key, AI webhook, email webhook, or Google Sheets URL.
- Netlify AI Gateway must be enabled for the site, or a server-side OpenAI key/webhook must be configured, before model automation can pass its canary and be activated.
- Podcast entries are example content until actual audio/video URLs are supplied.
- Gallery management currently stores approved media URLs; managed binary upload storage is a separate implementation.
- Candidate scoring currently uses explainable questionnaire rules and does not extract full PDF/DOCX résumé text.
- Social profile destinations must be supplied before the social icons can become live links.

## Release gate

The release may be called production-ready for public browsing, deterministic low/high estimating, secure role login, lead capture, and basic online fallback only after the build, API smoke suite, guardrail suite, and live-page checks pass. Model-backed AI, external email, Sheets, media playback, and résumé extraction must be attested separately after their production connection tests pass.
