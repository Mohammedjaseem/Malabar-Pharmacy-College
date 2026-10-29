(function (window) {
  "use strict";

  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  const truth = (value) => value === true || value === 1 || value === "true" || value === "1";
  const draftStatuses = ["NOT_STARTED", "DRAFT"];

  function snapshot(applicant) {
    if (!object(applicant)) throw new Error("The API response did not contain applicant details.");
    const hasForm = has(applicant, "application_form");
    if (hasForm && applicant.application_form !== null && !object(applicant.application_form)) {
      throw new Error("The API returned an invalid application form. Please contact admissions.");
    }
    const form = object(applicant.application_form) ? applicant.application_form : null;
    // An explicit null form means no draft exists. Missing data is not an empty form.
    let status = MCPAuth.normalizeStatus(form?.application_status || applicant.application_status);
    const submitted = truth(applicant.is_form_submitted) || Boolean(form?.submitted_at) || MCPAuth.isFinalStatus(status);
    if (submitted && draftStatuses.includes(status)) status = "SUBMITTED";
    if (!submitted && hasForm && !form) status = "NOT_STARTED";
    if (!hasForm && !submitted) status = "UNKNOWN";
    if (!status) status = submitted ? "SUBMITTED" : "UNKNOWN";
    // Unknown statuses are read-only. No unverified backend edit-permission key is assumed.
    return { applicant, form: form || {}, status, exists: Boolean(form),
      submitted, editable: !submitted && draftStatuses.includes(status) };
  }

  function accept(response) {
    const session = MCPAuth.getSession();
    if (!session) throw new Error("Your session has expired. Please sign in again.");
    const form = response.data;
    const account = response.applicant || {};
    const number = form?.application_no || account.application_no || session.applicationNo;
    const email = form?.registered_email || account.email || session.email;
    if ((session.applicationNo && number && String(number) !== String(session.applicationNo)) ||
        (session.email && email && email.toLowerCase() !== session.email.toLowerCase())) {
      throw new Error("The returned application does not match your signed-in account. Contact admissions.");
    }
    const applicant = { ...(session.user || {}), ...account,
      id: session.applicantId, application_no: number, email,
      full_name: account.full_name || session.fullName,
      phone_number: account.phone_number || session.phoneNumber,
      // The current response supersedes stale login/session status flags.
      application_form: form, application_status: form?.application_status || "",
      is_form_submitted: Boolean(form && form.application_status !== "DRAFT") };
    const result = snapshot(applicant);
    MCPAuth.updateSession({ applicationNo: number, applicationStatus: result.status,
      isFormCreated: result.exists, isFormSubmitted: result.submitted,
      applicationSubmitted: result.submitted, user: applicant,
      fullName: applicant.full_name, phoneNumber: applicant.phone_number });
    return result;
  }

  async function load() {
    if (!MCPAuth.requireAuth(window.location.pathname.split("/").pop())) return null;
    return accept(await MCPAdmissionContract.load());
  }
  async function saveDraft(values) {
    const response = await MCPAdmissionContract.saveDraft(values);
    const result = accept(response);
    if (result.status !== "DRAFT") throw new Error("Draft status could not be confirmed. Reload your application.");
    return result;
  }
  async function submit(values) {
    const response = await MCPAdmissionContract.submit(values);
    const result = accept(response);
    if (result.status !== "SUBMITTED") throw new Error("Submission status could not be confirmed. Reload your application.");
    return result;
  }
  window.MCPApplication = Object.freeze({ snapshot, load, saveDraft, submit });
})(window);
