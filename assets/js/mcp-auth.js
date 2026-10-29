(function (window) {
  "use strict";

  const CONFIG = Object.freeze({
    API_BASE_URL: "https://conext.in/admissions/api/mcp",
    ORG_ID: "8",
    SESSION_KEY: "mcpApplicantSession",
    PENDING_EMAIL_KEY: "mcpPendingVerificationEmail",
    DEFAULT_AFTER_LOGIN: "apply.html",
    STATUS_PAGE: "application-status.html",
  });

  function safeJsonParse(value, fallback = null) {
    if (!value) return fallback;

    try {
      return JSON.parse(value);
    } catch (_error) {
      return fallback;
    }
  }

  function getNestedValue(source, paths) {
    if (!source || typeof source !== "object") {
      return null;
    }

    for (const path of paths) {
      const value = String(path)
        .split(".")
        .reduce(function (current, key) {
          if (current && Object.prototype.hasOwnProperty.call(current, key)) {
            return current[key];
          }

          return undefined;
        }, source);

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }

    return null;
  }

  function normalizeBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value === 1;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      return (
        normalized === "true" || normalized === "1" || normalized === "yes"
      );
    }

    return Boolean(value);
  }

  function normalizeStatus(value) {
    return String(value || "")
      .trim()
      .replace(/[\s-]+/g, "_")
      .toUpperCase();
  }

  function isSuccessfulPayload(response, payload) {
    if (!response.ok) {
      return false;
    }

    if (payload && payload.status === false) {
      return false;
    }

    if (payload && payload.success === false) {
      return false;
    }

    return true;
  }

  function flattenMessage(value) {
    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(flattenMessage).filter(Boolean).join(" ");
    }

    if (typeof value === "object") {
      return Object.entries(value)
        .map(function ([key, item]) {
          const text = flattenMessage(item);

          return text ? `${key.replace(/_/g, " ")}: ${text}` : "";
        })
        .filter(Boolean)
        .join(" ");
    }

    return String(value);
  }

  function getErrorMessage(
    payload,
    fallback = "Something went wrong. Please try again.",
  ) {
    if (!payload) {
      return fallback;
    }

    const direct =
      payload.message ||
      payload.detail ||
      payload.error ||
      payload.non_field_errors ||
      payload.errors;

    return flattenMessage(direct) || flattenMessage(payload) || fallback;
  }

  async function parseResponse(response) {
    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (_error) {
      const error = new Error("The admissions service returned an unexpected response. Please try again later.");
      error.status = response.status;
      throw error;
    }
  }

  function createApiError(response, payload) {
    const error = new Error(
      getErrorMessage(
        payload,
        `Request failed with status ${response.status}.`,
      ),
    );

    error.status = response.status;
    error.data = payload;

    return error;
  }

  function getSession() {
    return safeJsonParse(sessionStorage.getItem(CONFIG.SESSION_KEY), null);
  }

  function saveSession(payload, fallbackEmail = "") {
    const applicant =
      getNestedValue(payload, [
        "applicant",
        "data.applicant",
        "user",
        "data.user",
      ]) || {};

    const accessToken =
      getNestedValue(payload, [
        "access_token",
        "access",
        "token",
        "tokens.access",
        "data.access_token",
        "data.access",
        "data.token",
        "data.tokens.access",
      ]) || "";

    const refreshToken =
      getNestedValue(payload, [
        "refresh_token",
        "refresh",
        "tokens.refresh",
        "data.refresh_token",
        "data.refresh",
        "data.tokens.refresh",
      ]) || "";

    const tokenType =
      getNestedValue(payload, ["token_type", "data.token_type"]) || "Bearer";

    const email =
      getNestedValue(payload, [
        "applicant.email",
        "data.applicant.email",
        "user.email",
        "data.user.email",
        "email",
        "data.email",
      ]) || fallbackEmail;

    const fullName =
      getNestedValue(payload, [
        "applicant.full_name",
        "data.applicant.full_name",
        "user.full_name",
        "data.user.full_name",
        "full_name",
        "name",
        "data.full_name",
      ]) || "";

    const phoneNumber =
      getNestedValue(payload, [
        "applicant.phone_number",
        "data.applicant.phone_number",
        "user.phone_number",
        "data.user.phone_number",
        "phone_number",
        "phone",
        "data.phone_number",
      ]) || "";

    const applicationNo =
      getNestedValue(payload, [
        "applicant.application_no",
        "data.applicant.application_no",
        "application_no",
        "data.application_no",
      ]) || "";

    const applicationStatus = normalizeStatus(
      getNestedValue(payload, [
        "applicant.application_status",
        "data.applicant.application_status",
        "application_status",
        "data.application_status",
      ]) || "",
    );

    const isFormCreated = normalizeBoolean(
      getNestedValue(payload, [
        "applicant.is_form_created",
        "data.applicant.is_form_created",
        "is_form_created",
        "data.is_form_created",
      ]),
    );

    const isFormSubmitted = normalizeBoolean(
      getNestedValue(payload, [
        "applicant.is_form_submitted",
        "data.applicant.is_form_submitted",
        "is_form_submitted",
        "data.is_form_submitted",
        "application_submitted",
        "is_application_submitted",
        "is_reg_completed",
        "data.application_submitted",
        "data.is_application_submitted",
        "data.is_reg_completed",
      ]),
    );

    const session = {
      authenticated: Boolean(accessToken),

      accessToken: String(accessToken),
      refreshToken: String(refreshToken),
      tokenType: String(tokenType || "Bearer"),

      applicantId:
        applicant.id !== undefined && applicant.id !== null
          ? String(applicant.id)
          : "",

      email: String(email || "")
        .trim()
        .toLowerCase(),

      fullName: String(fullName || ""),
      phoneNumber: String(phoneNumber || ""),

      applicationNo: String(applicationNo || ""),
      applicationStatus,

      isFormCreated,
      isFormSubmitted,

      applicationSubmitted: isFormSubmitted || isFinalStatus(applicationStatus),

      isVerified: normalizeBoolean(applicant.is_verified),

      user: applicant,
      raw: payload || {},
      savedAt: new Date().toISOString(),
    };

    if (!session.authenticated) {
      clearSession();
      throw new Error("Sign in did not return an access token. Please contact admissions.");
    }
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));

    return session;
  }

  function updateSession(changes = {}) {
    const currentSession = getSession() || {};

    const updatedSession = {
      ...currentSession,
      ...changes,
      updatedAt: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(changes, "applicationStatus")) {
      updatedSession.applicationStatus = normalizeStatus(
        changes.applicationStatus,
      );
    }

    if (Object.prototype.hasOwnProperty.call(changes, "isFormSubmitted")) {
      updatedSession.isFormSubmitted = normalizeBoolean(
        changes.isFormSubmitted,
      );
    }

    if (Object.prototype.hasOwnProperty.call(changes, "applicationSubmitted")) {
      updatedSession.applicationSubmitted = normalizeBoolean(
        changes.applicationSubmitted,
      );
    }

    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(updatedSession));

    return updatedSession;
  }

  function clearSession() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
  }

  function isAuthenticated() {
    const session = getSession();
    if (!session || !session.authenticated || !session.accessToken) return false;
    // Decoding exp is only a UX check. The backend must verify the JWT signature.
    try {
      const part = session.accessToken.split(".")[1];
      const claims = JSON.parse(window.atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) {
        clearSession();
        return false;
      }
    } catch (_error) {
      // Token validity remains the server's responsibility.
    }
    return true;
  }

  function isFinalStatus(status) {
    return ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].includes(normalizeStatus(status));
  }

  function getApplicationNumber(session = getSession()) {
    if (!session) {
      return "";
    }

    return String(
      session.applicationNo ||
        session.user?.application_no ||
        session.raw?.applicant?.application_no ||
        session.raw?.data?.applicant?.application_no ||
        "",
    );
  }

  function getApplicationStatus(session = getSession()) {
    if (!session) {
      return "";
    }

    return normalizeStatus(
      session.applicationStatus ||
        session.user?.application_status ||
        session.raw?.applicant?.application_status ||
        session.raw?.data?.applicant?.application_status ||
        "",
    );
  }

  function isFormSubmitted(session = getSession()) {
    if (!session) {
      return false;
    }

    if (typeof session.isFormSubmitted === "boolean") {
      return session.isFormSubmitted || isFinalStatus(session.applicationStatus);
    }
    return normalizeBoolean(
      session.isFormSubmitted ||
        session.applicationSubmitted ||
        session.user?.is_form_submitted ||
        session.raw?.applicant?.is_form_submitted ||
        session.raw?.data?.applicant?.is_form_submitted,
    );
  }

  function shouldOpenStatusPage(session = getSession()) {
    if (!session) {
      return false;
    }

    if (isFormSubmitted(session)) {
      return true;
    }

    const status = getApplicationStatus(session);

    return isFinalStatus(status);
  }

  function buildStatusUrl(applicationNumber) {
    // Application identity comes from the authenticated session, never a URL.
    return CONFIG.STATUS_PAGE;
  }

  function getSafeNextUrl(
    search = window.location.search,
    fallback = CONFIG.DEFAULT_AFTER_LOGIN,
  ) {
    const params = new URLSearchParams(search || "");

    const requested = params.get("next");

    if (!requested) {
      return fallback;
    }

    try {
      const resolved = new URL(requested, window.location.href);

      if (resolved.origin !== window.location.origin) {
        return fallback;
      }

      const directory = new URL(".", window.location.href).pathname;
      const page = resolved.pathname.slice(directory.length);
      if (!resolved.pathname.startsWith(directory) ||
          !["apply.html", "application-status.html"].includes(page)) return fallback;
      return page;
    } catch (_error) {
      return fallback;
    }
  }

  function buildSignInUrl(next = CONFIG.DEFAULT_AFTER_LOGIN) {
    const safeNext = getSafeNextUrl("?next=" + encodeURIComponent(next));
    return "signin.html?next=" + encodeURIComponent(safeNext);
  }

  function requireAuth(next = CONFIG.DEFAULT_AFTER_LOGIN) {
    if (isAuthenticated()) {
      return getSession();
    }

    window.location.replace(buildSignInUrl(next));

    return null;
  }

  function getAuthHeaders(extraHeaders = {}) {
    const session = getSession();

    const headers = {
      ...extraHeaders,
    };

    if (session && session.accessToken) {
      const tokenType = session.tokenType || "Bearer";

      headers.Authorization = `${tokenType} ${session.accessToken}`;
    }

    return headers;
  }

  async function apiFetch(path, options = {}) {
    const { authenticated = true, ...requestOptions } = options;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (normalizedPath.startsWith("//") || normalizedPath.includes("..")) {
      throw new Error("Invalid admissions API path.");
    }
    if (authenticated && !isAuthenticated()) {
      const error = new Error("Your session has expired. Please sign in again.");
      error.status = 401;
      window.location.replace(buildSignInUrl(window.location.pathname.split("/").pop()));
      throw error;
    }
    const headers = authenticated ? getAuthHeaders(requestOptions.headers || {}) : (requestOptions.headers || {});

    const response = await fetch(`${CONFIG.API_BASE_URL}${normalizedPath}`, {
      ...requestOptions,
      credentials: "omit",
      headers,
    });

    if (authenticated && response.status === 401) {
      clearSession();
      window.location.replace(buildSignInUrl(window.location.pathname.split("/").pop()));
      const error = new Error("Your session has expired. Please sign in again.");
      error.status = 401;
      throw error;
    }
    const payload = await parseResponse(response);

    if (!isSuccessfulPayload(response, payload)) {
      throw createApiError(response, payload);
    }

    return payload;
  }

  async function postJson(path, body, options = {}) {
    return apiFetch(path, {
      authenticated: !["/login/", "/register/", "/verify-otp/", "/resend-otp/", "/request-password-reset/", "/reset-password/"].includes(path),
      ...options,

      method: "POST",

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },

      body: JSON.stringify(body),
    });
  }

  function setPendingVerificationEmail(email) {
    sessionStorage.setItem(
      CONFIG.PENDING_EMAIL_KEY,
      String(email || "")
        .trim()
        .toLowerCase(),
    );
  }

  function getPendingVerificationEmail() {
    return sessionStorage.getItem(CONFIG.PENDING_EMAIL_KEY) || "";
  }

  function clearPendingVerificationEmail() {
    sessionStorage.removeItem(CONFIG.PENDING_EMAIL_KEY);
  }

  window.MCPAuth = Object.freeze({
    CONFIG,

    apiFetch,
    postJson,

    getSession,
    saveSession,
    updateSession,
    clearSession,

    isAuthenticated,
    requireAuth,

    normalizeStatus,
    isFinalStatus,

    getApplicationNumber,
    getApplicationStatus,
    isFormSubmitted,
    shouldOpenStatusPage,
    buildStatusUrl,

    getSafeNextUrl,
    buildSignInUrl,
    getAuthHeaders,
    getErrorMessage,

    setPendingVerificationEmail,
    getPendingVerificationEmail,
    clearPendingVerificationEmail,
  });
})(window);
