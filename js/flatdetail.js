// Shared "flat detail" modal — used by both the sales view and the admin view.
// isAdmin=true adds the Furniture Cost toggle control and (if booked) a Cancel Booking button.

let _detailFlat = null;

function renderPaymentScheduleTable(agreementValue) {
  const rows = PAYMENT_SLABS.map((row) => {
    const amount = Math.round(Number(agreementValue) * (row.percent / 100));
    return `<tr><td>${escapeHtml(row.stage)}</td><td class="pct">${row.percent}%</td><td class="pct">${formatINR(amount)}</td></tr>`;
  }).join("");
  return `
    <table class="info-table" id="fd-payment-schedule">
      <tr><th>Stage</th><th>Payment</th><th>Amount</th></tr>
      ${rows}
    </table>
  `;
}

async function openFlatDetail(flat, isAdmin) {
  _detailFlat = flat;
  const body = document.getElementById("flat-detail-body");
  const title = document.getElementById("flat-detail-title");
  title.textContent = `${flat.id} — ${flat.configuration_type}`;

  const rate = Number(flat.stamp_duty_rate) || 0.07;
  const fig = computeFigures(flat.agreement_value, rate, flat.registration);

  let booking = null;
  if (flat.status === "Booked") {
    const { data } = await sb.rpc("get_booking_for_flat", { p_token: currentToken, p_flat_id: flat.id });
    booking = data;
  }

  const canEditPricing = flat.is_selectable && flat.status === "Available";

  body.innerHTML = `
    <div class="detail-grid">
      <div><label>Tower / Unit</label><div>${escapeHtml(flat.tower)} - ${escapeHtml(flat.unit_no)} (Floor ${flat.floor_number})</div></div>
      <div><label>Configuration</label><div>${escapeHtml(flat.configuration_type)}</div></div>
      <div><label>Carpet Area</label><div>${flat.carpet_area} sq.ft</div></div>
      <div><label>Saleable Area</label><div>${flat.saleable_area} sq.ft</div></div>
      <div><label>Facing</label><div>${escapeHtml(flat.facing || "-")}</div></div>
      <div><label>Floor Band</label><div>${escapeHtml(flat.floor_band || "-")}</div></div>
      <div><label>Ownership</label><div>${escapeHtml(flat.ownership || "-")} (${escapeHtml(flat.ownership_detail || "-")})</div></div>
      <div><label>Status</label><div><span class="badge ${seatClass(flat)}">${flat.status}${flat.is_selectable ? "" : " · not bookable yet"}</span></div></div>
    </div>

    ${!flat.is_selectable ? `<p class="note">Only flats with Ownership Detail "WPC LLP" can be booked right now. This flat belongs to ${escapeHtml(flat.ownership_detail || "another party")}.</p>` : ""}

    ${isAdmin && flat.ownership_detail !== "WPC LLP" ? `
      <div class="note" style="background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a;">
        <strong>Admin override:</strong> this flat's owner is "${escapeHtml(flat.ownership_detail || "unknown")}", not WPC LLP.
        ${flat.manually_unblocked
          ? `It is currently <strong>unblocked</strong> — sales can select and book it.
             <button class="btn secondary small" id="fd-revoke-unblock" style="margin-left:8px;">Revoke</button>`
          : `<button class="btn secondary small" id="fd-unblock" style="margin-left:8px;">Unblock for booking</button>`}
      </div>
    ` : ""}

    <hr/>
    <h4>Pricing</h4>
    <div class="detail-grid">
      <div>
        <label>Agreement Value</label>
        <input type="number" id="fd-agreement-value" value="${fig.agreementValue}" ${canEditPricing ? "" : "disabled"} />
      </div>
      <div>
        <label>Stamp Duty Rate</label>
        <div class="radio-row">
          <label><input type="radio" name="fd-rate" value="0.07" ${rate === 0.07 ? "checked" : ""} ${canEditPricing ? "" : "disabled"}/> 7% (Male)</label>
          <label><input type="radio" name="fd-rate" value="0.06" ${rate === 0.06 ? "checked" : ""} ${canEditPricing ? "" : "disabled"}/> 6% (Female)</label>
        </div>
      </div>
      <div><label>Registration</label><div id="fd-registration">${formatINR(fig.registration)}</div></div>
      <div><label>Stamp Duty</label><div id="fd-stampduty">${formatINR(fig.stampDuty)}</div></div>
      <div><label>GST (5%)</label><div id="fd-gst">${formatINR(fig.gst)}</div></div>
      <div>
        <label>Package Total (editable — auto back-calculates Agreement Value)</label>
        <input type="number" id="fd-package" value="${fig.packageTotal}" ${canEditPricing ? "" : "disabled"} />
      </div>
    </div>

    <h4>Payment Schedule</h4>
    <div id="fd-payment-schedule-wrap">${renderPaymentScheduleTable(fig.agreementValue)}</div>

    ${flat.cc_enabled ? `
      <div class="cc-box">
        <strong>Furniture Cost available for this flat:</strong> ${formatINR(flat.cc_amount)}
      </div>` : ""}

    ${isAdmin ? `
      <hr/>
      <h4>Admin: Furniture Cost</h4>
      <div class="detail-grid">
        <div><label><input type="checkbox" id="fd-cc-enabled" ${flat.cc_enabled ? "checked" : ""}/> Enable Furniture Cost</label></div>
        <div><label>Amount</label><input type="number" id="fd-cc-amount" value="${flat.cc_amount || 0}"/></div>
      </div>
      <p class="note">If opted at booking, this amount is deducted from the Agreement Value before Stamp Duty/GST are calculated. It is never shown on the booking sheet.</p>
      <button class="btn secondary" id="fd-save-cc">Save Furniture Cost</button>
    ` : ""}

    ${canEditPricing ? `<p class="note">Agreement Value, Stamp Duty Rate, and Package Total above only affect this booking — use them to work out a negotiated price, then click "Book This Flat" to lock it in. There's no separate button to overwrite the flat's listed price, so a stray edit here can't accidentally change it for anyone else.</p>` : ""}

    ${booking ? `
      <hr/>
      <h4>Booking Details</h4>
      <div class="detail-grid">
        <div><label>Buyer</label><div>${escapeHtml(booking.buyer_name)}</div></div>
        <div><label>Phone</label><div>${escapeHtml(booking.buyer_phone || "-")}</div></div>
        <div><label>Email</label><div>${escapeHtml(booking.buyer_email || "-")}</div></div>
        <div><label>Booked On</label><div>${new Date(booking.booked_at).toLocaleString()}</div></div>
        <div><label>Package Paid</label><div>${formatINR(booking.package_total)}</div></div>
        ${isAdmin ? `<div><label>Furniture Cost</label><div>${booking.cc_included ? formatINR(booking.cc_amount) : "Not opted"}</div></div>` : ""}
        ${isAdmin ? `<div><label>Amount Received</label><div>${formatINR(booking.amount_received || 0)}</div></div>` : ""}
      </div>

      ${isAdmin && (booking.cp_name || booking.cp_firm_name || booking.cp_number || booking.cp_email) ? `
        <h4 style="margin-top:16px;">Channel Partner</h4>
        <div class="detail-grid">
          <div><label>Name</label><div>${escapeHtml(booking.cp_name || "-")}</div></div>
          <div><label>Firm Name</label><div>${escapeHtml(booking.cp_firm_name || "-")}</div></div>
          <div><label>Number</label><div>${escapeHtml(booking.cp_number || "-")}</div></div>
          <div><label>Email</label><div>${escapeHtml(booking.cp_email || "-")}</div></div>
        </div>
      ` : ""}

      <button class="btn secondary" id="fd-print">Print Booking Sheet</button>
      ${isAdmin ? `<button class="btn secondary" id="fd-edit-booking">Edit Booking</button>` : ""}
      ${isAdmin ? `<button class="btn danger" id="fd-cancel-booking">Cancel Booking</button>` : ""}
    ` : ""}

    ${canEditPricing ? `<button class="btn primary" id="fd-book-btn">Book This Flat</button>` : ""}
  `;

  wireFlatDetailEvents(flat, booking, isAdmin);
  openModal("modal-flat-detail");
}

function wireFlatDetailEvents(flat, booking, isAdmin) {
  const avInput = document.getElementById("fd-agreement-value");
  const pkgInput = document.getElementById("fd-package");
  const rateRadios = document.querySelectorAll("input[name='fd-rate']");

  function currentRate() {
    const checked = document.querySelector("input[name='fd-rate']:checked");
    return checked ? Number(checked.value) : 0.07;
  }

  function refreshPaymentSchedule(av) {
    document.getElementById("fd-payment-schedule-wrap").innerHTML = renderPaymentScheduleTable(av);
  }

  function refreshFromAV() {
    const fig = computeFigures(avInput.value, currentRate(), flat.registration);
    pkgInput.value = fig.packageTotal;
    document.getElementById("fd-stampduty").textContent = formatINR(fig.stampDuty);
    document.getElementById("fd-gst").textContent = formatINR(fig.gst);
    refreshPaymentSchedule(fig.agreementValue);
  }

  function refreshFromPackage() {
    const av = packageToAgreementValue(Number(pkgInput.value), currentRate(), flat.registration);
    avInput.value = av;
    const fig = computeFigures(av, currentRate(), flat.registration);
    document.getElementById("fd-stampduty").textContent = formatINR(fig.stampDuty);
    document.getElementById("fd-gst").textContent = formatINR(fig.gst);
    refreshPaymentSchedule(av);
  }

  if (avInput) avInput.addEventListener("input", refreshFromAV);
  if (pkgInput) pkgInput.addEventListener("input", refreshFromPackage);
  rateRadios.forEach((r) => r.addEventListener("change", refreshFromAV));

  const saveCcBtn = document.getElementById("fd-save-cc");
  if (saveCcBtn) {
    saveCcBtn.addEventListener("click", async () => {
      const enabled = document.getElementById("fd-cc-enabled").checked;
      const amount = Number(document.getElementById("fd-cc-amount").value) || 0;
      const { error } = await sb.rpc("set_flat_cc", {
        p_token: currentToken,
        p_flat_id: flat.id,
        p_enabled: enabled,
        p_amount: amount,
      });
      if (error) {
        toast(error.message, "error");
      } else {
        toast("Furniture cost saved");
        closeModal("modal-flat-detail");
        window.dispatchEvent(new Event("flats:refresh"));
      }
    });
  }

  const bookBtn = document.getElementById("fd-book-btn");
  if (bookBtn) {
    bookBtn.addEventListener("click", () => {
      openBookingForm(flat, Number(avInput.value), currentRate());
    });
  }

  const editBookingBtn = document.getElementById("fd-edit-booking");
  if (editBookingBtn) {
    editBookingBtn.addEventListener("click", () => {
      openEditBookingForm(booking);
    });
  }

  const cancelBtn = document.getElementById("fd-cancel-booking");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", async () => {
      const reason = prompt("Reason for cancellation:");
      if (reason === null) return;
      const { error } = await sb.rpc("cancel_booking", {
        p_token: currentToken,
        p_booking_id: booking.id,
        p_reason: reason,
      });
      if (error) {
        toast(error.message, "error");
      } else {
        toast("Booking cancelled, flat is Available again");
        closeModal("modal-flat-detail");
        window.dispatchEvent(new Event("flats:refresh"));
      }
    });
  }

  const printBtn = document.getElementById("fd-print");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      openBookingSheet(flat, booking);
    });
  }

  const unblockBtn = document.getElementById("fd-unblock");
  if (unblockBtn) {
    unblockBtn.addEventListener("click", async () => {
      const { error } = await sb.rpc("admin_set_flat_unblock", {
        p_token: currentToken,
        p_flat_id: flat.id,
        p_unblock: true,
      });
      if (error) toast(error.message, "error");
      else {
        toast("Flat unblocked — sales can now book it.");
        closeModal("modal-flat-detail");
        window.dispatchEvent(new Event("flats:refresh"));
      }
    });
  }

  const revokeBtn = document.getElementById("fd-revoke-unblock");
  if (revokeBtn) {
    revokeBtn.addEventListener("click", async () => {
      const { error } = await sb.rpc("admin_set_flat_unblock", {
        p_token: currentToken,
        p_flat_id: flat.id,
        p_unblock: false,
      });
      if (error) toast(error.message, "error");
      else {
        toast("Unblock revoked.");
        closeModal("modal-flat-detail");
        window.dispatchEvent(new Event("flats:refresh"));
      }
    });
  }
}

function toDatetimeLocalValue(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openEditBookingForm(booking) {
  const body = document.getElementById("booking-form-body");

  body.innerHTML = `
    <div class="detail-grid">
      <div><label>Booking Date &amp; Time</label><input type="datetime-local" id="eb-booked-at" value="${toDatetimeLocalValue(booking.booked_at)}" /></div>
      <div><label>Amount Received</label><input type="number" id="eb-amount-received" value="${Number(booking.amount_received || 0)}" /></div>
    </div>
    <h4 style="margin-top:14px;">Channel Partner (CP) Details</h4>
    <div class="detail-grid">
      <div><label>Name</label><input type="text" id="eb-cp-name" value="${escapeHtml(booking.cp_name || "")}" /></div>
      <div><label>Firm Name</label><input type="text" id="eb-cp-firm" value="${escapeHtml(booking.cp_firm_name || "")}" /></div>
      <div><label>Number</label><input type="text" id="eb-cp-number" value="${escapeHtml(booking.cp_number || "")}" /></div>
      <div><label>Email</label><input type="email" id="eb-cp-email" value="${escapeHtml(booking.cp_email || "")}" /></div>
    </div>
    <button class="btn primary" id="eb-submit">Save Changes</button>
  `;

  document.getElementById("eb-submit").addEventListener("click", async () => {
    const bookedAtLocal = document.getElementById("eb-booked-at").value;
    const amountReceived = Number(document.getElementById("eb-amount-received").value) || 0;
    const cpName = document.getElementById("eb-cp-name").value.trim();
    const cpFirm = document.getElementById("eb-cp-firm").value.trim();
    const cpNumber = document.getElementById("eb-cp-number").value.trim();
    const cpEmail = document.getElementById("eb-cp-email").value.trim();

    const { error } = await sb.rpc("admin_update_booking_details", {
      p_token: currentToken,
      p_booking_id: booking.id,
      p_booked_at: bookedAtLocal ? new Date(bookedAtLocal).toISOString() : null,
      p_amount_received: amountReceived,
      p_cp_name: cpName || null,
      p_cp_firm_name: cpFirm || null,
      p_cp_number: cpNumber || null,
      p_cp_email: cpEmail || null,
    });

    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Booking details updated");
    closeModal("modal-booking-form");
    closeModal("modal-flat-detail");
    window.dispatchEvent(new Event("flats:refresh"));
  });

  openModal("modal-booking-form");
}

function openBookingForm(flat, agreementValue, rate) {
  const body = document.getElementById("booking-form-body");
  const ccOption = flat.cc_enabled
    ? `<label><input type="checkbox" id="bk-cc"/> Include Furniture Cost (${formatINR(flat.cc_amount)}) — deducted from Agreement Value</label>`
    : "";

  function figureNote(includeCc) {
    const effectiveAv = agreementValue - (includeCc ? Number(flat.cc_amount) : 0);
    const fig = computeFigures(effectiveAv, rate, flat.registration);
    return `
      <p class="note">
        ${includeCc ? `Furniture Cost: ${formatINR(flat.cc_amount)} (deducted) · ` : ""}
        Agreement Value: ${formatINR(fig.agreementValue)} · Stamp Duty Rate: ${(rate * 100).toFixed(0)}%<br/>
        Stamp Duty: ${formatINR(fig.stampDuty)} · GST: ${formatINR(fig.gst)} · Package Total: ${formatINR(fig.packageTotal)}
      </p>
    `;
  }

  body.innerHTML = `
    <div class="detail-grid">
      <div><label>Buyer Name *</label><input type="text" id="bk-name" required/></div>
      <div><label>Phone</label><input type="text" id="bk-phone"/></div>
      <div><label>Email</label><input type="email" id="bk-email"/></div>
    </div>
    ${ccOption}
    <div id="bk-figure-note">${figureNote(false)}</div>
    <button class="btn primary" id="bk-submit">Confirm Booking</button>
  `;

  const ccCheckbox = document.getElementById("bk-cc");
  if (ccCheckbox) {
    ccCheckbox.addEventListener("change", () => {
      document.getElementById("bk-figure-note").innerHTML = figureNote(ccCheckbox.checked);
    });
  }

  document.getElementById("bk-submit").addEventListener("click", async () => {
    const name = document.getElementById("bk-name").value.trim();
    if (!name) {
      toast("Buyer name is required", "error");
      return;
    }
    const phone = document.getElementById("bk-phone").value.trim();
    const email = document.getElementById("bk-email").value.trim();
    const includeCc = document.getElementById("bk-cc") ? document.getElementById("bk-cc").checked : false;

    const { error } = await sb.rpc("book_flat", {
      p_token: currentToken,
      p_flat_id: flat.id,
      p_buyer_name: name,
      p_buyer_phone: phone,
      p_buyer_email: email,
      p_agreement_value: agreementValue,
      p_stamp_duty_rate: rate,
      p_include_cc: includeCc,
    });

    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Flat booked successfully!");
    closeModal("modal-booking-form");
    closeModal("modal-flat-detail");
    window.dispatchEvent(new Event("flats:refresh"));
  });

  openModal("modal-booking-form");
}
