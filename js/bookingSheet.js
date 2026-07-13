// Opens a new tab with a printable, A4-formatted booking sheet — two copies
// (Sales Copy and Customer Copy), each laid out as two pages:
//   Page 1: letterhead, flat/buyer/pricing details, signature block
//   Page 2: payment schedule + terms & conditions (kept together), signature block
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

  function signatureBlock() {
    return `
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
    `;
  }

  function renderCopy(label) {
    const paymentRows = PAYMENT_SLABS.map((row) => {
      return `<tr><td>${escapeHtml(row.stage)}</td><td class="pct">${row.percent}%</td></tr>`;
    }).join("");

    const termsList = STANDARD_TERMS.map((t) => `<li>${escapeHtml(t)}</li>`).join("");

    const page1 = `
      <div class="page">
        <img src="${PROJECT_LOGO_PATH}" class="watermark" onerror="this.style.display='none'" />
        <div class="letterhead">
          <img src="${PROJECT_LOGO_PATH}" class="logo" onerror="this.style.display='none'" />
          <div class="project-title">
            <div class="pname">${escapeHtml(PROJECT_NAME)}</div>
            <div class="paddr">${escapeHtml(PROJECT_ADDRESS_LINE1)}</div>
            <div class="paddr">${escapeHtml(PROJECT_ADDRESS_LINE2)}</div>
          </div>
          <div class="rera-block">
            <img src="${PROJECT_RERA_QR_PATH}" class="qr" onerror="this.style.display='none'" />
            <div class="rera-no">${escapeHtml(PROJECT_RERA_NUMBER)}</div>
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

        ${signatureBlock()}
      </div>
    `;

    const page2 = `
      <div class="page">
        <img src="${PROJECT_LOGO_PATH}" class="watermark" onerror="this.style.display='none'" />
        <div class="running-header">
          <span>${escapeHtml(PROJECT_NAME)} — Flat ${escapeHtml(flat.id)}</span>
          <span class="copy-label-inline">${label}</span>
        </div>

        <h3>Payment Schedule (construction-linked, on Agreement Value)</h3>
        <table class="info-table payment-table">
          <tr><th>Stage</th><th>Payment</th></tr>
          ${paymentRows}
        </table>

        <h3>Terms &amp; Conditions</h3>
        <ol class="terms-list">${termsList}</ol>

        ${signatureBlock()}
      </div>
    `;

    return page1 + page2;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Booking Sheet — ${escapeHtml(flat.id)}</title>
      <style>
        @page { size: A4; margin: 14mm 12mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; }

        .page {
          position: relative;
          width: 100%;
          max-width: 186mm; /* A4 minus margins */
          margin: 0 auto;
          padding: 6mm 0;
          page-break-after: always;
        }
        .page:last-of-type { page-break-after: auto; }

        .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 75%;
          max-width: 480px;
          opacity: 0.07;
          z-index: -1;
          pointer-events: none;
        }

        .letterhead {
          display: grid;
          grid-template-columns: 1fr 2fr 1fr;
          align-items: flex-start;
          border-bottom: 2px solid #1e40af;
          padding-bottom: 12px;
        }
        .logo { max-height: 95px; max-width: 260px; object-fit: contain; }
        .project-title { text-align: center; }
        .pname { font-size: 22px; font-weight: bold; color: #1e3a8a; }
        .paddr { font-size: 12px; color: #6b7280; margin-top: 2px; }
        .rera-block { text-align: right; font-size: 11px; display: flex; flex-direction: column; align-items: flex-end; }
        .rera-no { margin-top: 6px; }
        .qr { display: inline-block; width: 80px; height: 80px; object-fit: contain; }

        .running-header {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #1e3a8a;
          font-weight: bold;
          border-bottom: 2px solid #1e40af;
          padding-bottom: 8px;
          margin-bottom: 4px;
        }
        .copy-label-inline { letter-spacing: 1px; }

        .copy-label { text-align: right; font-size: 11px; font-weight: bold; letter-spacing: 1px; color: #1e40af; margin-top: 10px; }
        h2 { font-size: 16px; margin: 14px 0 6px; }
        h3 { font-size: 13px; margin: 16px 0 4px; color: #1e3a8a; }

        .info-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .info-table td, .info-table th { padding: 5px 8px; border: 1px solid #e5e7eb; }
        .info-table td.k { background: #f8fafc; color: #6b7280; width: 140px; }

        .payment-table th { background: #1e3a8a; color: white; text-align: left; }
        .payment-table td.pct { text-align: right; white-space: nowrap; }

        .terms-list { font-size: 10.5px; color: #374151; padding-left: 18px; margin: 4px 0 0; }
        .terms-list li { margin-bottom: 4px; }

        .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
        .sig-block { width: 45%; font-size: 12px; }
        .sig-line { border-top: 1px solid #1f2937; margin-bottom: 6px; height: 40px; }
        .sig-meta { color: #6b7280; margin-top: 4px; }

        .print-bar { padding: 12px 0; max-width: 186mm; margin: 0 auto; }
        .print-bar button { padding: 8px 18px; border: none; background: #1e40af; color: white; border-radius: 6px; cursor: pointer; font-size: 13px; }
        @media print { .print-bar { display: none; } }
      </style>
    </head>
    <body>
      <div class="print-bar"><button onclick="window.print()">Print / Save as PDF</button></div>
      ${renderCopy("SALES COPY")}
      ${renderCopy("CUSTOMER COPY")}
    </body>
    </html>
  `);
  win.document.close();
}
