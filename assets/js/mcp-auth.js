(function (window) {
  "use strict";

  const CONFIG = Object.freeze({
    API_BASE_URL: "https://conext.in/admissions/api/mcp",
    ORG_ID: "8",
    SESSION_KEY: "mcpApplicantSession",
    PENDING_EMAIL_KEY: "mcpPendingVerificationEmail",
    DEFAULT_AFTER_LOGIN: "apply.html",
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
    for (const path of paths) {
      const value = path.split(".").reduce((current, key) => {
        if (current && Object.prototype.hasOwnProperty.call(current, key)) {
          return current[key];
        }
        return undefined;
      }, source);
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  }

  function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
    return Boolean(value);
  }

  function isSuccessfulPayload(response, payload) {
    if (!response.ok) return false;
    if (payload && payload.status === false) return false;
    if (payload && payload.success === false) return false;
    return true;
  }

  function flattenMessage(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value))
      return value.map(flattenMessage).filter(Boolean).join(" ");
    if (typeof value === "object") {
      return Object.entries(value)
        .map(([key, item]) => {
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
    if (!payload) return fallback;
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
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { message: text };
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
    const root =
      payload && payload.data && typeof payload.data === "object"
        ? payload.data
        : payload || {};
    const accessToken = getNestedValue(payload, [
      "access",
      "access_token",
      "token",
      "tokens.access",
      "data.access",
      "data.access_token",
      "data.token",
      "data.tokens.access",
    ]);
    const refreshToken = getNestedValue(payload, [
      "refresh",
      "refresh_token",
      "tokens.refresh",
      "data.refresh",
      "data.refresh_token",
      "data.tokens.refresh",
    ]);
    const user =
      getNestedValue(payload, [
        "user",
        "applicant",
        "data.user",
        "data.applicant",
      ]) || {};
    const email =
      getNestedValue(payload, [
        "email",
        "user.email",
        "applicant.email",
        "data.email",
        "data.user.email",
        "data.applicant.email",
      ]) || fallbackEmail;

    const session = {
      authenticated: true,
      accessToken: accessToken || "",
      refreshToken: refreshToken || "",
      email: String(email || "")
        .trim()
        .toLowerCase(),
      user,
      fullName:
        getNestedValue(payload, [
          "full_name",
          "name",
          "user.full_name",
          "user.name",
          "applicant.full_name",
          "data.full_name",
          "data.user.full_name",
          "data.user.name",
        ]) || "",
      phoneNumber:
        getNestedValue(payload, [
          "phone_number",
          "phone",
          "user.phone_number",
          "user.phone",
          "applicant.phone_number",
          "data.phone_number",
          "data.user.phone_number",
        ]) || "",
      applicationSubmitted: normalizeBoolean(
        getNestedValue(payload, [
          "application_submitted",
          "is_application_submitted",
          "is_reg_completed",
          "data.application_submitted",
          "data.is_application_submitted",
          "data.is_reg_completed",
        ]),
      ),
      raw: root,
      savedAt: new Date().toISOString(),
    };

    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
  }

  function isAuthenticated() {
    const session = getSession();
    return Boolean(session && session.authenticated);
  }

  function getSafeNextUrl(
    search = window.location.search,
    fallback = CONFIG.DEFAULT_AFTER_LOGIN,
  ) {
    const params = new URLSearchParams(search || "");
    const requested = params.get("next");
    if (!requested) return fallback;

    try {
      const resolved = new URL(requested, window.location.href);
      if (resolved.origin !== window.location.origin) return fallback;
      const relative = `${resolved.pathname}${resolved.search}${resolved.hash}`;
      return relative.replace(/^\//, "") || fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function buildSignInUrl(next = CONFIG.DEFAULT_AFTER_LOGIN) {
    return `signin.html?next=${encodeURIComponent(next)}`;
  }

  function requireAuth(next = CONFIG.DEFAULT_AFTER_LOGIN) {
    if (isAuthenticated()) return getSession();
    window.location.replace(buildSignInUrl(next));
    return null;
  }

  function getAuthHeaders(extraHeaders = {}) {
    const session = getSession();
    const headers = { ...extraHeaders };
    if (session && session.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
    return headers;
  }

  async function apiFetch(path, options = {}) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const headers = getAuthHeaders(options.headers || {});
    const response = await fetch(`${CONFIG.API_BASE_URL}${normalizedPath}`, {
      ...options,
      headers,
    });
    const payload = await parseResponse(response);

    if (!isSuccessfulPayload(response, payload)) {
      if (response.status === 401 || response.status === 403) {
        clearSession();
      }
      throw createApiError(response, payload);
    }

    return payload;
  }

  async function postJson(path, body, options = {}) {
    return apiFetch(path, {
      method: "POST",
      ...options,
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
    clearSession,
    isAuthenticated,
    requireAuth,
    getSafeNextUrl,
    buildSignInUrl,
    getErrorMessage,
    setPendingVerificationEmail,
    getPendingVerificationEmail,
    clearPendingVerificationEmail,
  });
})(window);
