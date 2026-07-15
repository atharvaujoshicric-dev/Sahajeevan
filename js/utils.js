function formatINR(n) {
  if (n === null || n === undefined || isNaN(n)) return "-";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function toast(message, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = "toast show " + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3500);
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Given a target package_total, back-solve the agreement value that would
// produce it, for the "edit package total instead of agreement value" flow.
// package = AV * (1 + rate + 0.05) + registration
function packageToAgreementValue(packageTotal, rate, registration) {
  const av = (packageTotal - registration) / (1 + rate + 0.05);
  return Math.round(av);
}

function computeFigures(agreementValue, rate, registration) {
  const av = Number(agreementValue) || 0;
  const stampDuty = Math.round(av * rate);
  const gst = Math.round(av * 0.05);
  const packageTotal = Math.round(av + stampDuty + registration + gst);
  return { agreementValue: av, stampDuty, gst, registration, packageTotal };
}

// ---------------------------------------------------------------------------
// In-app replacements for window.prompt()/window.confirm() — these use the
// same modal styling as the rest of the app instead of the browser's own
// top-center popups.
// ---------------------------------------------------------------------------

// Ask for a cancellation reason, then call onConfirm(reason).
function openCancelBookingModal(onConfirm) {
  const reasonInput = document.getElementById("cancel-booking-reason");
  const errEl = document.getElementById("cancel-booking-error");
  reasonInput.value = "";
  errEl.textContent = "";

  const btn = document.getElementById("cancel-booking-confirm-btn");
  if (btn._handler) btn.removeEventListener("click", btn._handler);

  const handler = async () => {
    const reason = reasonInput.value.trim();
    if (!reason) {
      errEl.textContent = "Please enter a reason.";
      return;
    }
    closeModal("modal-cancel-booking");
    await onConfirm(reason);
  };
  btn._handler = handler;
  btn.addEventListener("click", handler);
  openModal("modal-cancel-booking");
}

// Ask for a new password (for a named user), then call onConfirm(newPassword).
function openResetPasswordModal(usernameLabel, onConfirm) {
  const input = document.getElementById("reset-password-input");
  const errEl = document.getElementById("reset-password-error");
  input.value = "";
  errEl.textContent = "";
  document.getElementById("reset-password-target").textContent = `Resetting the password for "${usernameLabel}".`;

  const btn = document.getElementById("reset-password-confirm-btn");
  if (btn._handler) btn.removeEventListener("click", btn._handler);

  const handler = async () => {
    const newPass = input.value;
    if (!newPass || newPass.length < 6) {
      errEl.textContent = "Password must be at least 6 characters.";
      return;
    }
    closeModal("modal-reset-password");
    await onConfirm(newPass);
  };
  btn._handler = handler;
  btn.addEventListener("click", handler);
  openModal("modal-reset-password");
}

// Generic yes/no confirmation, replacing window.confirm(). Calls onConfirm()
// only if the person clicks Confirm.
function openConfirmModal(title, message, onConfirm) {
  document.getElementById("confirm-modal-title").textContent = title;
  document.getElementById("confirm-modal-message").textContent = message;

  const btn = document.getElementById("confirm-modal-btn");
  if (btn._handler) btn.removeEventListener("click", btn._handler);

  const handler = async () => {
    closeModal("modal-confirm");
    await onConfirm();
  };
  btn._handler = handler;
  btn.addEventListener("click", handler);
  openModal("modal-confirm");
}
