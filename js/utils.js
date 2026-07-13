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
