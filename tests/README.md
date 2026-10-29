# Offline admissions verification

Run commands from the repository root. All fixtures use synthetic people and `example.invalid` addresses. Do not use real credentials in this harness.

## Static/unit tests

```powershell
node --test tests/admissions.test.cjs
```

No installation or network is needed. Tests cover inline/external JavaScript syntax, script loading, the retained status design, session/redirect behavior, API read errors and identity checks, status snapshots, and document validation helpers.

## Automated browser tests

Requires Node, an already available `playwright-core` package and its matching Chromium binary. No user browser is attached; no browser security settings or permissions are changed. The runner creates a fresh headless browser and fulfills requests directly from local fixture files. All external requests are blocked; it does not need a listening HTTP server. Service workers are disabled in the fresh test context so requests cannot escape interception.

If Playwright is installed locally:

```powershell
node tests/run-browser.cjs
```

Or point at an existing installation. The exact command verified on this machine was:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\DELL\AppData\Local\ms-playwright'
node tests/run-browser.cjs C:/Projects/ekavio/frontend/node_modules/playwright-core
```

No package or browser download was performed for this work. `MCP_TEST_PORT` optionally changes the virtual origin's port; no socket is opened by this runner.

Expect 23/23 checks, exit code 0, and empty `pageErrors`, `consoleErrors`, and `missing` arrays. A failed check or any of those errors returns exit code 1. Results and synthetic screenshots are saved under `tests/artifacts/`.

API responses are supplied by `mock-api.js`, injected before production scripts only in test pages. Unknown operations throw. Auth POSTs are simulated entirely in memory. Save/Submit stay disabled and are tested for zero write requests; no successful persistence/upload/submission simulation is claimed because its contract is unknown. The local `/report` POST only records test results.

Fixture HTML removes remote scripts/styles and rewrites asset paths; fixture CSS removes remote font imports. Production HTML and assets are not rewritten on disk. A restrictive fixture CSP also blocks real API connections and form submissions. Consequently the clean console result covers local application code/dependencies, not omitted third-party production scripts/fonts.

## Manual fallback and visual review

If browser launch is unavailable under the environment's security policy, record that limitation instead of weakening it. On an environment that permits local HTTP browsing:

```powershell
node tests/preview-server.cjs
```

Open `http://127.0.0.1:8765/` in a fresh browser profile. The suite runs in the iframe and prints PASS/FAIL results. The server binds loopback only, serves test pages/assets, blocks external resources with CSP, and never proxies an API request. Use Ctrl+C to stop it. The separate headless runner is the tested route in this sandbox because direct loopback browsing was denied.

After the suite completes:

1. Select **Desktop form** or **Mobile form**. Verify the heading clears the header, the mobile menu opens/closes, the page scrolls, and all fields/actions fit.
2. Confirm synthetic account details are filled, fields accept local changes, and Save Draft/Submit remain disabled with an explanation. **Check details** should identify missing required values.
3. Choose a nonempty JPG/PNG for photo/signature or PDF/JPG/PNG for certificates. Check invalid MIME, empty and over-1-MiB files are rejected. Select BPharm-Lateral to reveal its additional required fields.
4. Select **Mobile status**; click Continue Application and check that it opens the editable synthetic draft. Sign out, then sign in using `student@example.invalid` and any synthetic password; the mock returns the saved fixture.
5. For explicit scenarios, run the following in the **top harness page's** console (not the iframe). These helpers only navigate fixture pages:

```javascript
await open('apply.html', {auth:false}); // sign-in redirect
await open('signup.html', {auth:false}); // enter synthetic account, then any 6-digit OTP
await open('apply.html', {data:{...baseApplicant,application_form:null}}); // NOT_STARTED
await open('apply.html', {data:{...baseApplicant,application_form:{application_status:'DRAFT',father_name:'Saved Parent'}}});
await open('apply.html', {data:{...baseApplicant,is_form_submitted:true,application_form:{application_status:'SUBMITTED'}}}); // locked
await open('apply.html', {kind:'expired'}); // local JWT expiry
await open('apply.html', {kind:'unauthorized'}); // server 401
await open('apply.html', {kind:'forbidden'}); // server 403, retained session
await open('application-status.html', {data:{...baseApplicant,application_form:null}});
await open('application-status.html', {data:{...baseApplicant,is_form_submitted:true,application_form:{application_status:'APPROVED'}}});
```

6. Inspect browser console and Network. There must be no uncaught application errors or external API traffic. `window.calls` contains intercepted API intent only; the harness reports any unexpected operation.
7. Repeat form/status review at 1280, 768, 390 and 320 pixels. The automated checks cover horizontal overflow, control widths, mobile navigation and header overlap; screenshots cover desktop form, mobile form and mobile status.

The harness auto-confirms discard dialogs for repeatability; manually verify the real unsaved-changes prompt and back/forward cache behavior in staging. Native OS file-picker interactions and physical mobile devices are not tested here.

## Before production

See `../MCP_APPLICANT_FLOW_README.md` for endpoint evidence and exact missing contracts. A real staging journey must cover OTP delivery, partial draft persistence across logout/login, document storage, final submission/status refresh, cross-user denial, token expiry, retry behavior and backend consistency. Do not enable writes based solely on these mocks or historical requests. Exclude `tests/` from public deployment.
