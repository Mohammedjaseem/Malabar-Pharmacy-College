# MCP Applicant Authentication and Application Flow

## Implemented flow

1. Every **Apply Now** link opens `signin.html?next=apply.html`.
2. Existing applicants sign in through the MCP login API.
3. New applicants open `signup.html`, register, verify the email OTP, and return to sign in.
4. Successful sign-in data is stored in `sessionStorage` under `mcpApplicantSession`.
5. `apply.html` is protected. Unauthenticated visitors are redirected to sign in.
6. The application form opens a review modal before submission.
7. **Confirm & Submit** sends a multipart request containing the form fields and uploaded documents.
8. Forgot-password supports requesting an OTP and resetting the password.

## API configuration

All endpoint configuration is centralized in:

`assets/js/mcp-auth.js`

Current values:

```js
API_BASE_URL: "https://conext.in/admissions/api/mcp"
ORG_ID: "8"
```

Endpoints used:

| Feature | Method | Endpoint |
|---|---:|---|
| Register applicant | POST | `/register/` |
| Verify registration OTP | POST | `/verify-otp/` |
| Resend registration OTP | POST | `/resend-otp/` |
| Applicant login | POST | `/login/` |
| Request password reset OTP | POST | `/request-reset-password/` |
| Reset password | POST | `/reset-password/` |
| Submit application | POST | `/application/submit/` |

## Authentication handling

`mcp-auth.js` supports common response token structures, including:

- `access` / `refresh`
- `access_token` / `refresh_token`
- `token`
- `tokens.access` / `tokens.refresh`
- the same keys inside `data`

When an access token exists, the application request includes:

```http
Authorization: Bearer <access-token>
```

Requests also use `credentials: "include"`, allowing the backend to use secure cookies instead of exposing tokens to JavaScript.

## Application multipart field mapping

The frontend sends the backend field names shown in the MCP API collection, including:

- `full_name`
- `father_name`
- `father_occupation`
- `mother_name`
- `mother_occupation`
- `correspondence_address`
- `permanent_address`
- `student_email`
- `parent_email`
- `date_of_birth`
- `gender`
- `nationality`
- `category`
- `religion`
- `caste`
- `contact_number`
- `quota`
- `program_type`
- DPharm lateral-entry fields
- Higher-secondary marks and certificate
- High-school details and certificate
- `student_photo`
- `signature`
- `declaration_accepted`

Do not manually set the `Content-Type` header for application submission. The browser creates the required multipart boundary.

## Important backend requirements

The backend must allow requests from the website origin and support either:

- Bearer token authentication, or
- secure cookie authentication with CORS credentials enabled.

For Bearer authentication, return an access token from `/login/`.

For cookie authentication across origins, the backend cookie must normally use `Secure` and an appropriate `SameSite` value, and CORS must allow credentials for the exact website origin.

The production site should be served through HTTPS. Do not test API requests by opening HTML files directly with a `file://` URL; use a local HTTP server.

Example local server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/index.html
```

## Main files

- `signin.html` — applicant sign-in
- `signup.html` — registration and OTP verification
- `forgot-password.html` — password reset OTP flow
- `apply.html` — protected application form, review modal, API submission
- `assets/js/mcp-auth.js` — API configuration, session storage, token and request helpers
- `login.html` — compatibility redirect to `signin.html`
- `register.html` — compatibility redirect to `signup.html`
- `otp-verification.html` — compatibility redirect to `signup.html`
- `reset-password.html` — compatibility redirect to `forgot-password.html`

## Manual acceptance test

1. Open the home page and click each visible Apply Now button.
2. Confirm it reaches `signin.html`.
3. Open Sign Up and submit a new full name, email, phone number, and password.
4. Confirm OTP verification and resend OTP work.
5. Sign in with the verified account.
6. Confirm redirect to `apply.html` and applicant email prefill.
7. Complete all required fields and upload files no larger than 1 MB.
8. Click Preview & Review Application.
9. Confirm values in the modal.
10. Click Confirm & Submit and inspect the network request:
    - URL ends with `/admissions/api/mcp/application/submit/`
    - request method is POST
    - body is multipart/form-data
    - Authorization header is present when the login response contains an access token
11. Confirm backend validation errors appear beside matching form fields.
12. Confirm successful submission disables the form and displays the application reference when returned.
