// Opens a new tab with a printable booking sheet — two copies (Sales Copy and
// Customer Copy), each with the project letterhead, RERA number + QR code,
// full buyer/flat/pricing details, and signature blocks at the bottom.
// The person can then use the browser's own "Print to PDF" to save/print it.

function openBookingSheet(flat, booking) {
  if (!booking) {
    toast("No booking found for this flat yet.", "error");
    return;
  }

  const win = window.open("", "_blank");
  if (!win) {
    toast("Please allow pop-ups to view the booking sheet.", "error");
    return;
  }

  const fig = {
    agreementValue: Number(booking.agreement_value),
    stampDuty: Number(booking.stamp_duty),
    registration: Number(booking.registration),
    gst: Number(booking.gst),
    packageTotal: Number(booking.package_total),
  };

  const bookedDate = new Date(booking.booked_at).toLocaleDateString("en-IN");
  const qrText = qrContentForBooking(flat, booking);

  function renderCopy(label, qrId) {
    return `
      <div class="copy">
        <div class="letterhead">
          <img src="${PROJECT_LOGO_PATH}" class="logo" onerror="this.style.display='none'" />
          <div class="project-title">
            <div class="pname">${escapeHtml(PROJECT_NAME)}</div>
            <div class="paddr">${escapeHtml(PROJECT_ADDRESS)}</div>
          </div>
          <div class="rera-block">
            <div class="rera-no">RERA No: ${escapeHtml(PROJECT_RERA_NUMBER)}</div>
            <div id="${qrId}" class="qr"></div>
          </div>
        </div>

        <div class="copy-label">${label}</div>
        <h2>Flat Booking Confirmation</h2>

        <table class="info-table">
          <tr><td class="k">Flat</td><td>${escapeHtml(flat.id)} — Tower ${escapeHtml(flat.tower)}, Floor ${flat.floor_number}</td>
              <td class="k">Configuration</td><td>${escapeHtml(flat.configuration_type)}</td></tr>
          <tr><td class="k">Carpet Area</td><td>${flat.carpet_area} sq.ft</td>
              <td class="k">Saleable Area</td><td>${flat.saleable_area} sq.ft</td></tr>
          <tr><td class="k">Facing</td><td>${escapeHtml(flat.facing || "-")}</td>
              <td class="k">Booking Date</td><td>${bookedDate}</td></tr>
        </table>

        <h3>Buyer Details</h3>
        <table class="info-table">
          <tr><td class="k">Name</td><td colspan="3">${escapeHtml(booking.buyer_name)}</td></tr>
          <tr><td class="k">Phone</td><td>${escapeHtml(booking.buyer_phone || "-")}</td>
              <td class="k">Email</td><td>${escapeHtml(booking.buyer_email || "-")}</td></tr>
        </table>

        <h3>Pricing</h3>
        <table class="info-table">
          <tr><td class="k">Agreement Value</td><td>${formatINR(fig.agreementValue)}</td>
              <td class="k">Stamp Duty (${(booking.stamp_duty_rate * 100).toFixed(0)}%)</td><td>${formatINR(fig.stampDuty)}</td></tr>
          <tr><td class="k">Registration</td><td>${formatINR(fig.registration)}</td>
              <td class="k">GST (5%)</td><td>${formatINR(fig.gst)}</td></tr>
          <tr><td class="k">Package Total</td><td colspan="3"><strong>${formatINR(fig.packageTotal)}</strong></td></tr>
          ${booking.cc_included ? `<tr><td class="k">Cash Component</td><td colspan="3">${formatINR(booking.cc_amount)}</td></tr>` : ""}
        </table>

        <div class="signatures">
          <div class="sig-block">
            <div class="sig-line"></div>
            <div>Customer Signature</div>
            <div class="sig-meta">Name: _____________________ &nbsp;&nbsp; Date: _____________</div>
          </div>
          <div class="sig-block">
            <div class="sig-line"></div>
            <div>Sales Person Signature</div>
            <div class="sig-meta">Name: _____________________ &nbsp;&nbsp; Date: _____________</div>
          </div>
        </div>
      </div>
    `;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Booking Sheet — ${escapeHtml(flat.id)}</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 0; }
        .copy { padding: 28px 36px; page-break-after: always; }
        .copy:last-child { page-break-after: auto; }
        .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e40af; padding-bottom: 12px; }
        .logo { max-height: 70px; max-width: 200px; object-fit: contain; }
        .project-title { text-align: center; flex: 1; }
        .pname { font-size: 20px; font-weight: bold; color: #1e3a8a; }
        .paddr { font-size: 12px; color: #6b7280; }
        .rera-block { text-align: right; font-size: 11px; }
        .rera-no { margin-bottom: 6px; }
        .qr { display: inline-block; }
        .copy-label { text-align: right; font-size: 11px; font-weight: bold; letter-spacing: 1px; color: #1e40af; margin-top: 10px; }
        h2 { font-size: 16px; margin: 14px 0 6px; }
        h3 { font-size: 13px; margin: 16px 0 4px; color: #1e3a8a; }
        .info-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .info-table td { padding: 5px 8px; border: 1px solid #e5e7eb; }
        .info-table td.k { background: #f8fafc; color: #6b7280; width: 140px; }
        .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
        .sig-block { width: 45%; font-size: 12px; }
        .sig-line { border-top: 1px solid #1f2937; margin-bottom: 6px; height: 40px; }
        .sig-meta { color: #6b7280; margin-top: 4px; }
        .print-bar { padding: 12px 36px; }
        .print-bar button { padding: 8px 18px; border: none; background: #1e40af; color: white; border-radius: 6px; cursor: pointer; font-size: 13px; }
        @media print { .print-bar { display: none; } }
      </style>
    </head>
    <body>
      <div class="print-bar"><button onclick="window.print()">Print / Save as PDF</button></div>
      ${renderCopy("SALES COPY", "qr-sales")}
      ${renderCopy("CUSTOMER COPY", "qr-customer")}
      <script>
        window.addEventListener("load", function () {
          try {
            new QRCode(document.getElementById("qr-sales"), { text: ${JSON.stringify(qrText)}, width: 72, height: 72 });
            new QRCode(document.getElementById("qr-customer"), { text: ${JSON.stringify(qrText)}, width: 72, height: 72 });
          } catch (e) { console.error("QR render failed", e); }
        });
      </script>
    </body>
    </html>
  `);
  win.document.close();
}
