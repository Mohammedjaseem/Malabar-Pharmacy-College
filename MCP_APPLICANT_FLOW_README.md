# MCP admissions: implementation and backend readiness

Verified locally on 2026-10-29. This worktree is not deployed. No production records were created or changed.

## Current behavior

- `signin.html` is the real login page; compatibility sign-in/sign-up pages preserve an allowlisted `next` destination. Registration/OTP returns to sign-in. Password reset uses `/request-password-reset/` and `/reset-password/`.
- `MCPAuth` stores the JWT session in sessionStorage, sends Authorization on protected requests, and uses `credentials: "omit"`. There is no automatic refresh-token flow. Missing/expired tokens and authenticated HTTP 401 return to sign-in; HTTP 403 displays an error without clearing the session.
- `application-status.html` retains its design. The mobile banner now clears the fixed navigation header.
- Continue Application opens the real `apply.html` form. It fetches the application using the application number from the authenticated session, never a number from the URL. Account details and all configured saved fields prepopulate; file inputs remain empty and saved documents appear as links.
- An explicit `application_form: null` renders NOT_STARTED. A missing form property renders UNKNOWN and is locked; an empty form object represents an existing draft. Missing application number is an error, not permission to invent an application record.
- DRAFT/NOT_STARTED forms permit local edits. Submitted/final states and unknown states are read-only. There is no verified backend permission contract for reopening a submitted record, so reopening remains unsupported.
- Document selection, conditional lateral-entry fields, declaration and basic field validation work locally. Unsaved edits are warned about and are not persisted in localStorage.
- **Save Draft and Submit are intentionally disabled.** No create/save/submit request is implemented in the current form. A warning clearly tells applicants that edits cannot be saved. This is not a production-ready admissions workflow.

## Endpoint evidence and its limits

API base: `https://conext.in/admissions/api/mcp`; registration organization: `8`.

Read-only OPTIONS observations during this work, historical frontend code, and saved Postman requests establish route/method evidence below. OPTIONS does **not** establish serializer fields, ownership enforcement, successful responses, or business rules. No production POST/PATCH/PUT/DELETE, real account login, or real applicant lookup was executed for testing.

| Purpose | Route | Evidence | Still unverified |
| --- | --- | --- | --- |
| Login | POST `/login/` | Existing frontend; OPTIONS allows POST; JSON/form parsers | Live token and applicant response contract |
| Register | POST `/register/` | Existing frontend; OPTIONS allows POST | Account creation/OTP delivery in staging |
| Verify / resend OTP | POST `/verify-otp/`, `/resend-otp/` | Existing frontend; OPTIONS allows POST | Real delivery, error/rate-limit behavior |
| Request reset OTP | POST `/request-password-reset/` | Saved Postman request; OPTIONS allows POST | Live reset delivery; the previous `/request-reset-password/` returned 404 |
| Reset password | POST `/reset-password/` | Existing frontend; OPTIONS allows POST | Live success/error behavior |
| Application detail | GET `/application-by-number/{application_no}/` | Existing frontend; OPTIONS on synthetic `contract-check` selector allows GET | Authenticated response schema, null semantics, cross-account authorization, document access |
| Application submission | POST `/application/submit/` | Historical frontend commit `5c5e3ef`; saved Postman request; OPTIONS allows POST and multipart/form-data, form and JSON parsers | Required fields/files, creation vs update semantics, ownership, response and status transitions |
| Initial application creation | Unknown | No separate verified endpoint found | Whether registration, submit, or a separate operation creates the form |
| Draft save/update | Unknown | No verified draft contract found | URL, method, partial fields, file preservation/deletion and response |

Saved Postman references inspected: Connect V2 / Admissions registration, OTP, login, password reset, submit form and application details. Submit points to `{{django local host}}/admissions/api/mcp/application/submit/`, uses a Bearer variable, and had no saved success response establishing the contract. It is historical evidence, not proof of current production compatibility.

The available workspace/GitHub searches did not identify the backend source. The public host has no exposed API index at its root or the MCP API root. No current OpenAPI/serializer specification or isolated backend/test credentials were available. These are the missing sources needed to finish integration.

## Historical multipart mapping (reference only)

`git show 5c5e3ef:apply.html` contains `buildApplicationFormData()` and POSTs via MCPAuth. It omits empty text and unselected files, and lets the browser set the multipart boundary. It does not establish how to clear a field or preserve/remove a previous upload.

The historical names used by the current display definitions are:

- Personal: `full_name`, `date_of_birth`, `gender`, `nationality`, `category`, `religion`, `caste`, `father_name`, `father_occupation`, `mother_name`, `mother_occupation`.
- Contact: `student_email`, `parent_email`, `contact_number`, `correspondence_address`, `permanent_address`.
- Program: `program_type`, `quota`.
- Lateral: `dpharm_register_number`, `dpharm_year_month_of_passing`, `dpharm_total_mark`, `dpharm_percentage`, `kspc_registration_number`, `dpharm_certificate`.
- Higher secondary: `hs_register_number`, `hs_year_month_of_passing`, `hs_board_of_examination`, `hs_physics_mark`, `hs_chemistry_mark`, `hs_biology_mark`, `hs_mathematics_mark`, `hs_total_mark`, `hs_overall_percentage`, `hs_pcb_pcm_higher_value`, `hs_certificate`.
- High school: `high_school_register_number`, `high_school_year_month_of_passing`, `high_school_total_percentage`, `high_school_certificate`.
- Other uploads/declaration: `student_photo`, `signature`, `declaration_accepted` (historically string `true`/`false`).

Current local validation requires photo, signature, higher-secondary certificate and high-school certificate unless a saved link exists, plus DPharm certificate for BPharm-Lateral. Photos/signatures accept JPG/PNG; certificates also accept PDF; files must be nonempty and at most 1 MiB. These are provisional frontend rules from the historical flow, **not verified current backend requirements**. Optional documents, allowed program/quota values, grade rules, date encoding and file-content validation require backend confirmation.

The legacy `apply-old.html` endpoint `/admissions/api/update_student_data/` has not been established as compatible and is not used.

## Required backend contract and enforcement

Before enabling writes, obtain the current source/API specification and an isolated test environment. Confirm or implement:

1. Stable applicant/application identifiers in login and detail responses, including new accounts with no form. The frontend currently expects `data.applicant` or `applicant`, with `application_form` object/null and status fields.
2. Create and partial draft-save operations, exact method/path/schema, validation errors, omitted/empty/null behavior, and existing-file preservation/replacement/deletion.
3. Submission required fields and documents, valid enums, encoding, upload limits/types, success/error envelopes, application identifier and final status. Establish retry/idempotency behavior and redirect only after confirmed success plus refreshed status.
4. Server-side ownership for **every** detail/create/update/submit/document operation, derived from the JWT principal. A client-supplied application number or applicant/org field must not grant access. Frontend identity comparisons are defensive checks only, not authorization.
5. Server-side final-submission locking and an explicit permission contract if edits can later be allowed; status transitions such as NOT_STARTED/DRAFT/SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED must be authoritative. The current UI recognizes these statuses but live transitions have not been tested.
6. Authenticated/signed document retrieval where necessary; CORS for the website's origin and Authorization header; token expiry/error semantics.

Whether these need backend code changes or documentation alone cannot be determined without backend access.

## Verification

- Offline Node suite: 12/12 passed. Syntax, dependencies, status design preservation (except mobile clearance), redirect allowlist, token/session behavior, response errors, identity checks, missing-form states, disabled writes and file helpers.
- Isolated Chromium browser suite: 23/23 passed. Actual local page scripts with synthetic API fixtures; all browser network requests fulfilled from local files or blocked. No real API writes occurred.
- Browser coverage: login/signup/OTP navigation, compatibility redirects, Continue Application, new/saved forms, all configured saved-field prefill, logout/relogin, password reset, expired JWT/401/403, status refresh, submitted edit protection, file selection/validation, disabled write buttons, and form/status layouts at 1280/768/390/320 pixels.
- Final browser result: zero uncaught page errors, zero console errors, zero missing assets. Desktop/mobile screenshots reviewed. Mobile header overlap discovered and fixed; an assertion now checks clearance.
- No successful save/upload/submit persistence test is claimed: the unsupported actions remain disabled, including in mocks. The browser suite verifies that clicking them cannot send a write. Real OTP delivery, database consistency, ownership enforcement, server document validation and status transitions require staging.
- Chromium only; other browsers, physical mobile keyboards/file pickers and actual production CORS remain untested. The fixture removes external scripts/fonts; third-party production dependencies are outside these results.

See `tests/README.md`, `tests/artifacts/browser-results.json`, and the synthetic screenshots for reproducible verification. Do not publish the fixture harness or artifacts with the public website.

## Changed-file inventory

Preserved and continued the original 12 modifications: `application-status.html`, `apply.html`, `assets/js/mcp-auth.js`, `forgot-password.html`, `login.html`, `signin-user.html`, `signin.html`, `signup-user.html`, `signup.html`, `assets/css/mcp-application.css`, `assets/js/mcp-application.js`, `assets/js/mcp-application-form.js`.

Additional verification/documentation: this README; `tests/admissions.test.cjs`, `tests/browser.html`, `tests/browser-tests.js`, `tests/mock-api.js`, `tests/preview-server.cjs`, `tests/run-browser.cjs`, `tests/README.md`; generated `tests/artifacts/browser-results.json`, `desktop-form.png`, `mobile-form.png`, `mobile-status.png`.

## Production gate

Do not deploy as a completed admissions workflow. Obtain and review the contracts above, implement verified writes and server ownership/locking, then test register/verify/login -> partial draft -> logout/login -> continue -> upload -> submit -> status using disposable staging applicants. Verify persistence, cross-account denial, expired-session handling, duplicate-submission protection and document security before requesting deployment approval. No commit, push or deployment has been performed.
