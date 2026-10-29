(function (window) {
  "use strict";

  // Names, choices and limits match the supplied Django serializer/model.
  const sections = [
    { title: "Personal details", fields: [
      ["full_name", "Full name (as on your school certificate)", "text", true],
      ["date_of_birth", "Date of birth", "date", true],
      ["gender", "Gender", "select", true, ["Male", "Female", "Other"]],
      ["nationality", "Nationality", "text", true],
      ["category", "Category", "select", true, ["General", "OBC", "OEC", "SC", "ST", "Other"]],
      ["religion", "Religion", "text", true], ["caste", "Caste", "text", true],
      ["father_name", "Father's name", "text", true], ["father_occupation", "Father's occupation", "text", true],
      ["mother_name", "Mother's name", "text", true], ["mother_occupation", "Mother's occupation", "text", true],
    ] },
    { title: "Contact and address", fields: [
      ["student_email", "Student email", "email", true], ["parent_email", "Parent email", "email", true],
      ["contact_number", "Contact number", "tel", true],
      ["correspondence_address", "Correspondence address", "textarea", true],
      ["permanent_address", "Permanent address", "textarea", true],
    ] },
    { title: "Program", fields: [
      ["program_type", "Program type", "select", true, ["BPharm", "BPharm-Lateral", "DPharm", "PharmD"]],
      ["quota", "Admission quota", "select", true, ["Merit", "Management", "NRI", "Other"]],
    ] },
    { title: "DPharm qualification for lateral entry", lateral: true, fields: [
      ["dpharm_register_number", "DPharm register number", "text", true],
      ["dpharm_year_month_of_passing", "Year and month of passing", "month", true],
      ["dpharm_total_mark", "DPharm total mark", "number", true],
      ["dpharm_percentage", "DPharm percentage", "number", true],
      ["kspc_registration_number", "KSPC registration number", "text", true],
      ["dpharm_certificate", "DPharm certificate", "file", true],
    ] },
    { title: "Higher secondary education", fields: [
      ["hs_register_number", "Register number", "text", true],
      ["hs_year_month_of_passing", "Year and month of passing", "month", true],
      ["hs_board_of_examination", "Board of examination", "select", true, ["STATE", "CBSE"]],
      ["hs_physics_mark", "Physics mark", "number", true],
      ["hs_chemistry_mark", "Chemistry mark", "number", true],
      ["hs_biology_mark", "Biology mark", "number", true],
      ["hs_mathematics_mark", "Mathematics mark", "number", true],
      ["hs_total_mark", "Total mark", "number", true],
      ["hs_overall_percentage", "Overall percentage", "number", true],
      ["hs_pcb_pcm_higher_value", "PCB / PCM higher percentage", "number", true],
      ["hs_certificate", "Higher secondary certificate", "file", true],
    ] },
    { title: "High school education", fields: [
      ["high_school_register_number", "Register number", "text", true],
      ["high_school_year_month_of_passing", "Year and month of passing", "month", true],
      ["high_school_total_percentage", "Total percentage", "number", true],
      ["high_school_certificate", "High school certificate", "file", true],
    ] },
    { title: "Photo and signature", fields: [
      ["student_photo", "Passport size photo", "file", true],
      ["signature", "Signature", "file", true],
    ] },
  ];
  const fields = sections.flatMap((section) => section.fields);
  const percentage = (key) => key.includes("percentage") || key === "hs_pcb_pcm_higher_value";
  const imageOnly = (key) => ["student_photo", "signature"].includes(key);
  const fileTypes = (key) => imageOnly(key) ? ["image/jpeg", "image/png", "image/webp"] : ["image/jpeg", "image/png", "application/pdf"];

  function fileError(file, key) {
    if (!file) return "";
    if (!file.size) return "Choose a non-empty file.";
    if (file.size > 10 * 1024 * 1024) return "Choose a file no larger than 10 MB.";
    if (!fileTypes(key).includes(file.type)) return imageOnly(key) ? "Choose a JPG, PNG or WebP image." : "Choose a PDF, JPG or PNG file.";
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    if (!(imageOnly(key) ? ["jpg", "jpeg", "png", "webp"] : ["pdf", "jpg", "jpeg", "png"]).includes(extension)) return "Choose a file with a supported extension.";
    return "";
  }

  function safeDocumentUrl(value) {
    if (typeof value !== "string" || !value) return null;
    try {
      const url = new URL(value, MCPAuth.CONFIG.API_BASE_URL + "/");
      return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch (_error) { return null; }
  }

  // Export pure helpers for offline regression tests; no network activity during helper initialization.
  window.MCPApplicationForm = Object.freeze({ sections, fields, fileError, safeDocumentUrl });
  if (!window.document) return;

  const form = document.getElementById("applicationForm");
  const controls = document.getElementById("applicationFields");
  const message = document.getElementById("formMessage");
  const retry = document.getElementById("retryApplication");
  const save = document.getElementById("saveDraftButton");
  const submit = document.getElementById("submitApplicationButton");
  const validateButton = document.getElementById("validateApplication");
  let current = null;
  let dirty = false;
  let loading = false;
  let saving = false;
  let blocked = false;

  function announce(text, error = false) {
    message.textContent = text;
    message.classList.toggle("is-error", error);
  }

  function renderFields() {
    const container = document.getElementById("formSections");
    for (const section of sections) {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "application-section";
      if (section.lateral) fieldset.id = "lateralFields";
      const legend = document.createElement("legend");
      legend.textContent = section.title;
      fieldset.append(legend);
      const grid = document.createElement("div");
      grid.className = "application-grid";
      for (const [key, label, type, required, choices] of section.fields) {
        const wrapper = document.createElement("div");
        wrapper.className = type === "textarea" ? "application-field wide" : "application-field";
        const caption = document.createElement("label");
        caption.htmlFor = key;
        caption.textContent = label + (required ? " *" : "");
        const input = document.createElement(type === "textarea" ? "textarea" : type === "select" ? "select" : "input");
        input.id = input.name = key;
        input.className = "form-control";
        input.required = Boolean(required);
        if (!["select", "textarea"].includes(type)) input.type = type;
        if (type === "textarea") input.rows = 3;
        if (type === "select") {
          for (const choice of ["", ...choices]) input.add(new Option(choice || "Choose an option", choice));
        }
        if (type === "number") {
          input.min = "0";
          input.step = "0.01";
          input.max = key === "dpharm_total_mark" ? "1100" : key === "hs_total_mark" ? "1200" : "200";
          if (percentage(key)) input.max = "100";
        }
        if (["text", "email", "tel"].includes(type)) {
          input.maxLength = type === "email" ? 254 : key === "contact_number" ? 10 : key === "kspc_registration_number" ? 100 : key.includes("register_number") || ["nationality", "religion", "caste"].includes(key) ? 80 : 150;
        }
        if (key === "student_email") input.readOnly = true;
        if (type === "file") input.accept = fileTypes(key).join(",");
        if (type === "date") {
          const today = new Date();
          input.max = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
        }
        const feedback = document.createElement("div");
        feedback.id = "error_" + key;
        feedback.className = "field-error";
        input.setAttribute("aria-describedby", feedback.id);
        wrapper.append(caption, input, feedback);
        if (type === "file") {
          const help = document.createElement("small");
          help.textContent = imageOnly(key) ? "JPG, PNG or WebP, up to 10 MB." : "PDF, JPG or PNG, up to 10 MB.";
          const saved = document.createElement("div");
          saved.id = "saved_" + key;
          saved.className = "saved-document";
          wrapper.append(help, saved);
        }
        grid.append(wrapper);
      }
      fieldset.append(grid);
      container.append(fieldset);
    }
  }

  function updateLateral() {
    const lateral = form.elements.program_type.value === "BPharm-Lateral";
    const fieldset = document.getElementById("lateralFields");
    fieldset.hidden = !lateral;
    fieldset.disabled = !lateral;
  }

  function prefill(values) {
    for (const [key, , type] of fields) {
      const input = form.elements[key];
      const value = values[key];
      if (type === "file") {
        const saved = document.getElementById("saved_" + key);
        saved.replaceChildren();
        input.value = "";
        input.required = Boolean(fields.find((field) => field[0] === key)[3]) && !value;
        if (value) {
          const url = safeDocumentUrl(value);
          if (url) {
            const link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "View saved document";
            saved.append(link);
          } else saved.textContent = "Document recorded. Contact admissions to view it.";
        }
        continue;
      }
      if (value === null || value === undefined) { input.value = ""; continue; }
      if (type === "select" && !Array.from(input.options).some((option) => option.value === String(value))) {
        // Preserve server values even when they are not in the historical choices.
        input.add(new Option(String(value), String(value)));
      }
      input.value = type === "month" ? String(value).slice(0, 7) : String(value);
    }
    form.elements.declaration_accepted.checked = [true, "true", 1, "1"].includes(values.declaration_accepted);
    updateLateral();
  }

  function setError(key, text) {
    const input = form.elements[key];
    const feedback = document.getElementById("error_" + key);
    if (feedback) feedback.textContent = text;
    if (input) input.setAttribute("aria-invalid", text ? "true" : "false");
  }

  function validate(final = true) {
    let firstInvalid = null;
    for (const [key, , type, , choices] of fields) {
      const input = form.elements[key];
      input.setCustomValidity("");
      setError(key, "");
      if (!input.willValidate && key !== "student_email") continue;
      const required = input.required;
      if (!final) input.required = false;
      if (type === "file") input.setCustomValidity(fileError(input.files[0], key));
      if (type === "tel" && input.value && !/^\d{10}$/.test(input.value)) input.setCustomValidity("Enter a valid 10-digit mobile number.");
      if (choices && input.value && !choices.includes(input.value)) input.setCustomValidity("Choose one of the supported options.");
      if (input.required && type !== "file" && !input.value.trim()) input.setCustomValidity("Complete this field.");
      let error = input.validationMessage;
      if (key === "student_email" && current?.applicant.email && input.value.toLowerCase() !== current.applicant.email.toLowerCase()) error = "Student email must match your registered email.";
      input.required = required;
      setError(key, error);
      if (error && !firstInvalid) firstInvalid = input;
    }
    const declaration = form.elements.declaration_accepted;
    setError("declaration_accepted", final && !declaration.checked ? "Accept the declaration before submitting." : "");
    if (final && !declaration.checked && !firstInvalid) firstInvalid = declaration;
    if (firstInvalid) {
      announce(final ? "Please complete the highlighted fields and accept the declaration." : "Please correct the highlighted values before saving your draft.", true);
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  function updateControls() {
    const disabled = loading || saving || blocked || !current?.editable;
    controls.disabled = save.disabled = submit.disabled = validateButton.disabled = disabled;
    form.setAttribute("aria-busy", String(loading || saving));
    save.textContent = saving ? "Please wait…" : "Save Draft";
  }

  function show(result) {
    current = result;
    prefill({ full_name: current.applicant.full_name,
      student_email: current.applicant.email, contact_number: current.applicant.phone_number, ...current.form });
    document.getElementById("applicationState").textContent = current.status.replaceAll("_", " ");
    document.getElementById("accountEmail").textContent = current.applicant.email || "";
    for (const key of [...fields.map(field => field[0]), "declaration_accepted"]) setError(key, "");
  }

  async function load() {
    if (loading || saving) return;
    if (dirty && !window.confirm("Reload your saved application and discard unsaved changes?")) return;
    loading = true;
    blocked = true;
    retry.hidden = true;
    updateControls();
    announce("Loading your application…");
    try {
      const result = await MCPApplication.load();
      if (!result) return;
      show(result);
      dirty = false;
      blocked = false;
      announce(current.editable ? "Save a draft at any time. Submit only when your details and documents are complete." :
        "Your application is read-only. Contact admissions if you need to make a correction.");
    } catch (error) {
      document.getElementById("applicationState").textContent = "UNAVAILABLE";
      announce(error.status === 403 ? "You do not have permission to access this application. Contact admissions." : error.message, true);
      retry.hidden = error.status === 401;
    } finally {
      loading = false;
      updateControls();
    }
  }

  function values() {
    const result = {};
    for (const [key, , type] of fields) {
      const input = form.elements[key];
      if (input.matches(":disabled")) continue;
      if (type === "file") {
        if (input.files[0]) result[key] = input.files[0];
      } else result[key] = input.value.trim();
    }
    result.declaration_accepted = form.elements.declaration_accepted.checked;
    return result;
  }

  async function write(final) {
    if (saving || loading || blocked || !current?.editable || !validate(final)) return;
    if (final && !window.confirm("Submit your application? You will not be able to edit it after submission.")) return;
    const payload = values();
    saving = true;
    retry.hidden = true;
    updateControls();
    announce(final ? "Submitting your application…" : "Saving your draft…");
    try {
      const result = await (final ? MCPApplication.submit(payload) : MCPApplication.saveDraft(payload));
      show(result);
      dirty = false;
      announce(final ? "Application submitted successfully." : "Draft saved successfully. You can return later to continue.");
      if (final) window.location.assign("application-status.html");
    } catch (error) {
      const errors = error.data?.errors;
      let first = null;
      if (errors && typeof errors === "object") {
        const extra = [];
        for (const [key, messages] of Object.entries(errors)) {
          const text = typeof messages === "string" ? messages : Array.isArray(messages) ? messages.join(" ") : JSON.stringify(messages);
          if (form.elements[key]) { setError(key, text); first ||= form.elements[key]; }
          else extra.push(text);
        }
        announce([error.message, ...extra].join(" "), true);
      } else {
        // Network/ambiguous response or changed status: reload before retrying a write.
        blocked = true;
        retry.hidden = error.status === 401;
        announce(error.message + (error.status === 401 ? "" : " Reload your application before trying again."), true);
      }
      if (error.status === 401) { dirty = false; form.reset(); }
      if (error.status === 403) blocked = true;
      saving = false;
      updateControls();
      first?.focus();
    } finally {
      saving = false;
      updateControls();
    }
  }

  if (!MCPAuth.requireAuth("apply.html")) return;
  renderFields();
  form.addEventListener("input", (event) => {
    dirty = true;
    if (event.target.setCustomValidity) event.target.setCustomValidity("");
    const error = document.getElementById("error_" + event.target.name);
    if (error) error.textContent = "";
    event.target.removeAttribute("aria-invalid");
  });
  form.elements.program_type.addEventListener("change", updateLateral);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    write(true);
  });
  save.addEventListener("click", () => write(false));
  validateButton.addEventListener("click", () => { if (current?.editable && validate()) announce("Details passed local validation. You can submit your application."); });
  retry.addEventListener("click", load);
  document.getElementById("logoutButton").addEventListener("click", () => {
    if (dirty && !window.confirm("Your changes have not been saved. Sign out and discard them?")) return;
    dirty = false;
    form.reset();
    MCPAuth.clearSession();
    window.location.replace(MCPAuth.buildSignInUrl("apply.html"));
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); });
  load();
})(window);
