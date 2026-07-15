let adminFlats = [];
let adminBookings = [];

async function initAdminView() {
  document.getElementById("admin-username").textContent = currentUser.full_name || currentUser.username;

  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchAdminTab(btn.dataset.tab));
  });

  await refreshAdminData();
  switchAdminTab("dashboard");

  document.getElementById("admin-search").oninput = (e) => {
    renderAdminSeatMap(e.target.value.trim().toUpperCase());
  };

  window.removeEventListener("flats:refresh", adminRefreshHandler);
  window.addEventListener("flats:refresh", adminRefreshHandler);
}

async function adminRefreshHandler() {
  await refreshAdminData();
  renderDashboard();
  renderAdminSeatMap(document.getElementById("admin-search").value.trim().toUpperCase());
  renderBookingsTable();
}

function switchAdminTab(tab) {
  document.querySelectorAll(".admin-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".admin-panel").forEach((p) => p.classList.toggle("active", p.id === "admin-panel-" + tab));

  if (tab === "dashboard") renderDashboard();
  if (tab === "inventory") renderAdminSeatMap("");
  if (tab === "bookings") renderBookingsTable();
  if (tab === "users") loadUsers();
}

async function refreshAdminData() {
  const [{ data: flats, error: flatsErr }, { data: bookings, error: bookErr }] = await Promise.all([
    sb.rpc("get_flats", { p_token: currentToken }),
    sb.rpc("get_bookings", { p_token: currentToken }),
  ]);
  if (flatsErr) toast(flatsErr.message, "error");
  if (bookErr) toast(bookErr.message, "error");
  adminFlats = flats || [];
  adminBookings = bookings || [];
}

// ---------------------------------------------------------------- DASHBOARD
function renderDashboard() {
  const total = adminFlats.length;
  const booked = adminFlats.filter((f) => f.status === "Booked").length;
  const available = adminFlats.filter((f) => f.status === "Available").length;
  const bookable = adminFlats.filter((f) => f.is_selectable && f.status === "Available").length;

  const activeBookings = adminBookings.filter((b) => b.status === "Active");
  const cancelledBookings = adminBookings.filter((b) => b.status === "Cancelled");
  const totalPackageBooked = activeBookings.reduce((s, b) => s + Number(b.package_total || 0), 0);
  const totalAgreementBooked = activeBookings.reduce((s, b) => s + Number(b.effective_agreement_value || 0), 0);
  const avgPackage = activeBookings.length ? totalPackageBooked / activeBookings.length : 0;

  const potentialFlats = adminFlats.filter((f) => f.is_selectable && f.status === "Available");
  const totalPotentialValue = potentialFlats.reduce((s, f) => s + Number(f.package_total || 0), 0);

  const totalAttempts = adminBookings.length;
  const cancellationRate = totalAttempts ? (cancelledBookings.length / totalAttempts) * 100 : 0;

  document.getElementById("kpi-total").textContent = total;
  document.getElementById("kpi-booked").textContent = booked;
  document.getElementById("kpi-available").textContent = available;
  document.getElementById("kpi-bookable").textContent = bookable;
  document.getElementById("kpi-package-total").textContent = formatINR(totalPackageBooked);
  document.getElementById("kpi-agreement-total").textContent = formatINR(totalAgreementBooked);
  document.getElementById("kpi-potential-value").textContent = formatINR(totalPotentialValue);
  document.getElementById("kpi-avg-package").textContent = formatINR(avgPackage);
  document.getElementById("kpi-cancelled").textContent = `${cancelledBookings.length} (${cancellationRate.toFixed(0)}%)`;

  renderBreakdownTable("breakdown-by-tower", groupCount(adminFlats, (f) => f.tower));
  renderBreakdownTable("breakdown-by-config", groupCount(adminFlats, (f) => f.configuration_type));
  renderBreakdownTable("breakdown-by-owner", groupCount(adminFlats, (f) => f.ownership_detail || "Unknown"));
  renderBreakdownTable("breakdown-by-status", groupCount(adminFlats, (f) => f.status));
  renderBreakdownTable("breakdown-by-salesperson", groupCount(activeBookings, (b) => b.booked_by_name || "Unknown"));
  renderBreakdownTable(
    "breakdown-by-month",
    groupCount(activeBookings, (b) => new Date(b.booked_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }))
  );
}

function groupCount(list, keyFn) {
  const m = {};
  list.forEach((item) => {
    const k = keyFn(item);
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

function renderBreakdownTable(elId, map) {
  const el = document.getElementById(elId);
  const max = Math.max(1, ...Object.values(map));
  el.innerHTML = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([label, count]) => `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
        <span class="bar-value">${count}</span>
      </div>`
    )
    .join("");
}

// ---------------------------------------------------------------- INVENTORY
function renderAdminSeatMap(filter) {
  const list = filter
    ? adminFlats.filter((f) => f.id.toUpperCase().includes(filter) || f.unit_no.toUpperCase().includes(filter))
    : adminFlats;
  const container = document.getElementById("admin-seatmap");
  renderSeatMap(container, list, (flat) => openFlatDetail(flat, true));
}

// ---------------------------------------------------------------- BOOKINGS
function renderBookingsTable() {
  const tbody = document.getElementById("bookings-tbody");
  tbody.innerHTML = adminBookings
    .map((b) => {
      return `
      <tr>
        <td>${escapeHtml(b.flat_id)}</td>
        <td>${escapeHtml(b.buyer_name)}</td>
        <td>${escapeHtml(b.buyer_phone || "-")}</td>
        <td>${escapeHtml(b.booked_by_name || "-")}</td>
        <td>${formatINR(b.package_total)}</td>
        <td>${b.cc_included ? formatINR(b.cc_amount) : "-"}</td>
        <td><span class="badge ${b.status === "Active" ? "available" : "booked"}">${b.status}</span></td>
        <td>${new Date(b.booked_at).toLocaleDateString()}</td>
        <td>${
          b.status === "Active"
            ? `<button class="btn danger small" data-id="${b.id}">Cancel</button>`
            : "-"
        }</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reason = prompt("Reason for cancellation:");
      if (reason === null) return;
      const { error } = await sb.rpc("cancel_booking", {
        p_token: currentToken,
        p_booking_id: btn.dataset.id,
        p_reason: reason,
      });
      if (error) {
        toast(error.message, "error");
      } else {
        toast("Booking cancelled");
        await refreshAdminData();
        renderBookingsTable();
        renderDashboard();
      }
    });
  });
}

// ---------------------------------------------------------------- USERS
async function loadUsers() {
  const { data: users, error } = await sb.rpc("admin_list_users", { p_token: currentToken });
  if (error) {
    toast(error.message, "error");
    return;
  }

  const tbody = document.getElementById("users-tbody");
  tbody.innerHTML = users
    .map(
      (u) => `
    <tr>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.full_name || "-")}</td>
      <td>${escapeHtml(roleLabel(u.role))}</td>
      <td>${u.active ? "Active" : "Deactivated"}</td>
      <td>${u.role === "site_head" ? (u.can_edit_booking_date ? "Can edit booking date" : "-") : "-"}</td>
      <td>
        <button class="btn secondary small" data-edit="${u.id}">Edit</button>
        <button class="btn secondary small" data-reset="${u.id}">Reset Password</button>
        <button class="btn danger small" data-delete="${u.id}">Delete</button>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("button[data-reset]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const newPass = prompt("Enter new password (min 6 characters):");
      if (!newPass) return;
      const { error } = await sb.rpc("admin_reset_password", {
        p_token: currentToken,
        p_user_id: btn.dataset.reset,
        p_new_password: newPass,
      });
      if (error) toast(error.message, "error");
      else toast("Password reset. That user has been logged out everywhere.");
    });
  });

  tbody.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = users.find((x) => x.id === btn.dataset.edit);
      const fullName = prompt("Full name:", u.full_name || "");
      if (fullName === null) return;
      const role = prompt("Designation (admin / sales / site_head):", u.role);
      if (role === null || !["admin", "sales", "site_head"].includes(role)) {
        if (role !== null) toast("Role must be 'admin', 'sales', or 'site_head'", "error");
        return;
      }
      const activeStr = prompt("Active? (yes/no):", u.active ? "yes" : "no");
      if (activeStr === null) return;
      const active = activeStr.trim().toLowerCase().startsWith("y");

      let canEditBookingDate = u.can_edit_booking_date;
      if (role === "site_head") {
        const permStr = prompt(
          "Allow this Site Head to edit booking dates? (yes/no):",
          u.can_edit_booking_date ? "yes" : "no"
        );
        if (permStr === null) return;
        canEditBookingDate = permStr.trim().toLowerCase().startsWith("y");
      } else {
        canEditBookingDate = false; // permission only applies to site_head
      }

      const { error } = await sb.rpc("admin_update_user", {
        p_token: currentToken,
        p_user_id: u.id,
        p_full_name: fullName,
        p_role: role,
        p_active: active,
        p_can_edit_booking_date: canEditBookingDate,
      });
      if (error) toast(error.message, "error");
      else {
        toast("User updated");
        loadUsers();
      }
    });
  });

  tbody.querySelectorAll("button[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = users.find((x) => x.id === btn.dataset.delete);
      if (!confirm(`Permanently delete the login "${u.username}"? This cannot be undone.`)) return;
      const { error } = await sb.rpc("admin_delete_user", {
        p_token: currentToken,
        p_user_id: u.id,
      });
      if (error) toast(error.message, "error");
      else {
        toast("User deleted");
        loadUsers();
      }
    });
  });
}

function roleLabel(role) {
  if (role === "site_head") return "Site Head";
  if (role === "admin") return "Admin";
  return "Sales";
}

document.getElementById("create-user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("new-username").value.trim();
  const password = document.getElementById("new-password").value;
  const fullName = document.getElementById("new-fullname").value.trim();
  const role = document.getElementById("new-role").value;
  const canEditBookingDate = document.getElementById("new-can-edit-booking-date").checked;

  const { error } = await sb.rpc("admin_create_user", {
    p_token: currentToken,
    p_username: username,
    p_password: password,
    p_full_name: fullName,
    p_role: role,
    p_can_edit_booking_date: role === "site_head" ? canEditBookingDate : false,
  });

  if (error) {
    toast(error.message, "error");
  } else {
    toast("User created");
    document.getElementById("create-user-form").reset();
    loadUsers();
  }
});

// ---------------------------------------------------------------- DANGER ZONE
document.getElementById("open-reset-btn").addEventListener("click", () => {
  document.getElementById("reset-confirm-input").value = "";
  document.getElementById("reset-confirm-error").textContent = "";
  openModal("modal-reset-confirm");
});

document.getElementById("reset-confirm-btn").addEventListener("click", async () => {
  const typed = document.getElementById("reset-confirm-input").value.trim();
  const errEl = document.getElementById("reset-confirm-error");
  if (typed !== "RESET") {
    errEl.textContent = 'Please type RESET exactly to confirm.';
    return;
  }
  const { error } = await sb.rpc("admin_reset_system_data", {
    p_token: currentToken,
    p_confirm: typed,
  });
  if (error) {
    errEl.textContent = error.message;
    return;
  }
  toast("System data reset — all flats are Available again.");
  closeModal("modal-reset-confirm");
  await refreshAdminData();
  renderDashboard();
  renderAdminSeatMap("");
  renderBookingsTable();
});

// ---------------------------------------------------------------- EXPORT AS EXCEL
document.getElementById("export-excel-btn").addEventListener("click", () => {
  try {
    const flatsSheet = adminFlats.map((f) => ({
      "Flat ID": f.id,
      Tower: f.tower,
      "Unit No": f.unit_no,
      Floor: f.floor_number,
      Configuration: f.configuration_type,
      "Carpet Area": f.carpet_area,
      "Saleable Area": f.saleable_area,
      Status: f.status,
      Ownership: f.ownership,
      "Ownership Detail": f.ownership_detail,
      "Bookable (WPC LLP / Unblocked)": f.is_selectable ? "Yes" : "No",
      "Manually Unblocked": f.manually_unblocked ? "Yes" : "No",
      Facing: f.facing,
      "Floor Band": f.floor_band,
      "Agreement Value": f.agreement_value,
      "Stamp Duty Rate": f.stamp_duty_rate,
      "Stamp Duty": f.stamp_duty,
      Registration: f.registration,
      GST: f.gst,
      "Package Total": f.package_total,
      "Furniture Cost Enabled": f.cc_enabled ? "Yes" : "No",
      "Furniture Cost Amount": f.cc_amount,
    }));

    const bookingsSheet = adminBookings.map((b) => ({
      "Flat ID": b.flat_id,
      Tower: b.tower,
      "Unit No": b.unit_no,
      Configuration: b.configuration_type,
      "Buyer Name": b.buyer_name,
      Phone: b.buyer_phone,
      Email: b.buyer_email,
      "Agreement Value (as entered)": b.agreement_value,
      "Furniture Cost Opted": b.cc_included ? "Yes" : "No",
      "Furniture Cost Amount": b.cc_included ? b.cc_amount : 0,
      "Effective Agreement Value": b.effective_agreement_value,
      "Stamp Duty Rate": b.stamp_duty_rate,
      "Stamp Duty": b.stamp_duty,
      Registration: b.registration,
      GST: b.gst,
      "Package Total": b.package_total,
      "Amount Received": b.amount_received,
      "CP Name": b.cp_name || "",
      "CP Firm Name": b.cp_firm_name || "",
      "CP Number": b.cp_number || "",
      "CP Email": b.cp_email || "",
      Status: b.status,
      "Booked By": b.booked_by_name,
      "Booked At": b.booked_at ? new Date(b.booked_at).toLocaleString() : "",
      "Cancelled At": b.cancelled_at ? new Date(b.cancelled_at).toLocaleString() : "",
      "Cancellation Reason": b.cancellation_reason || "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flatsSheet), "Flats");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookingsSheet), "Bookings");

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `sahjeevan-inventory-export-${stamp}.xlsx`);
    toast("Excel file downloaded");
  } catch (e) {
    toast("Export failed: " + e.message, "error");
  }
});
