(function (window) {
  "use strict";
  // Verified against admissions.zip: urls.py, form views, serializer and model.
  // This adapter is authored from that source; no supplied patch was available.
  const writableFields = Object.freeze([
    "full_name", "father_name", "father_occupation", "mother_name", "mother_occupation",
    "correspondence_address", "permanent_address", "student_email", "parent_email",
    "date_of_birth", "gender", "nationality", "category", "religion", "caste",
    "contact_number", "quota", "student_photo", "signature", "program_type",
    "dpharm_register_number", "dpharm_year_month_of_passing", "dpharm_total_mark",
    "dpharm_percentage", "dpharm_certificate", "kspc_registration_number",
    "hs_register_number", "hs_year_month_of_passing", "hs_board_of_examination",
    "hs_physics_mark", "hs_chemistry_mark", "hs_biology_mark", "hs_mathematics_mark",
    "hs_total_mark", "hs_overall_percentage", "hs_pcb_pcm_higher_value", "hs_certificate",
    "high_school_register_number", "high_school_year_month_of_passing",
    "high_school_total_percentage", "high_school_certificate", "declaration_accepted",
  ]);
  const fileFields = Object.freeze(["student_photo", "signature", "dpharm_certificate", "hs_certificate", "high_school_certificate"]);
  function formData(values) {
    const body = new FormData();
    for (const key of writableFields) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
      const value = values[key];
      if (fileFields.includes(key)) {
        // Never send saved URLs or empty file inputs: omission preserves the file.
        if (value instanceof Blob && value.size) body.append(key, value, value.name || key);
      } else if (value !== undefined) {
        body.append(key, value == null ? "" : String(value));
      }
    }
    return body;
  }
  function decode(payload, write = false) {
    if (payload?.status !== true || !Object.prototype.hasOwnProperty.call(payload, "data") ||
        (payload.data !== null && (typeof payload.data !== "object" || Array.isArray(payload.data))) ||
        (write && !payload.data)) {
      throw new Error("The admissions API returned an unexpected response. Reload your application before trying again.");
    }
    return payload;
  }
  async function load() { return decode(await MCPAuth.apiFetch("/application/", { method: "GET" })); }
  async function write(path, method, values) {
    return decode(await MCPAuth.apiFetch(path, { method, body: formData(values) }), true);
  }
  window.MCPAdmissionContract = Object.freeze({
    writableFields, fileFields, formData, decode, load,
    saveDraft: values => write("/application/save-draft/", "PATCH", values),
    submit: values => write("/application/submit/", "POST", values),
  });
})(window);
