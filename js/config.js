// ============================================================================
// PROJECT / BOOKING-SHEET CONFIG
// Fill these in with your real details — I don't have your actual logo,
// RERA number, or address, so I've left them as placeholders rather than
// making anything up (this ends up on a legal-facing document).
// ============================================================================

const PROJECT_NAME = "Sahjeevan";
const PROJECT_ADDRESS = "S. No. 254, Sus, Mulshi, Pune"; // from the Parking Sheet cost-center line — confirm/replace if needed
const PROJECT_RERA_NUMBER = "YOUR_RERA_NUMBER_HERE";

// Put your logo file at assets/logo.png (any image works; recommended ~300x120px, transparent background).
// If the file is missing, the booking sheet just shows a placeholder box instead of a broken image.
const PROJECT_LOGO_PATH = "assets/logo.png";

// What the QR code encodes. Defaults to a simple text reference; point this at
// a real verification URL once you have one (e.g. a page showing booking status).
function qrContentForBooking(flat, booking) {
  return `${PROJECT_NAME} BOOKING\nFlat: ${flat.id}\nBooking ID: ${booking.id}`;
}
