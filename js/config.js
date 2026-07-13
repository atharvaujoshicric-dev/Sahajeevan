// ============================================================================
// PROJECT / BOOKING-SHEET CONFIG
// Fill these in with your real details — I don't have your actual logo,
// RERA number, or address, so I've left them as placeholders rather than
// making anything up (this ends up on a legal-facing document).
// ============================================================================

const PROJECT_NAME = "Sahjeevan";
const PROJECT_ADDRESS = "S. No. 254, Sus, Mulshi, Pune"; // from the Parking Sheet cost-center line — confirm/replace if needed
const PROJECT_RERA_NUMBER = "MAHA-RERA Reg No. PR1260002600468";

// Put your logo file at assets/logo.png (any image works; recommended ~300x120px, transparent background).
// If the file is missing, the booking sheet just shows a placeholder box instead of a broken image.
const PROJECT_LOGO_PATH = "assets/logo.png";

// What the QR code encodes. Defaults to a simple text reference; point this at
// a real verification URL once you have one (e.g. a page showing booking status).
function qrContentForBooking(flat, booking) {
  return `${PROJECT_NAME} BOOKING\nFlat: ${flat.id}\nBooking ID: ${booking.id}`;
}

// Construction-linked payment schedule shown on the booking sheet.
// "percent" is applied to the booking's Agreement Value (not the Package
// Total — stamp duty/registration/GST are separate government dues, paid on
// their own schedule, not part of this construction-linked plan).
// Percentages sum to 100 — check this still holds if you edit the list.
const PAYMENT_SLABS = [
  { stage: "Booking Amount (on or before execution of Agreement)", percent: 10 },
  { stage: "On execution of Agreement", percent: 15 },
  { stage: "On completion of the Plinth of the building", percent: 15 },
  { stage: "On casting of 1st Slab", percent: 5 },
  { stage: "On casting of 3rd Slab", percent: 5 },
  { stage: "On casting of 5th Slab", percent: 5 },
  { stage: "On casting of 7th Slab", percent: 5 },
  { stage: "On casting of 9th Slab", percent: 5 },
  { stage: "On casting of 12th Slab", percent: 5 },
  { stage: "On casting of 14th Slab", percent: 5 },
  { stage: "On completion of walls, internal plaster, flooring, doors & windows", percent: 5 },
  { stage: "On completion of sanitary fittings, staircases, lift wells & lobbies up to the floor level", percent: 5 },
  { stage: "On completion of external plumbing, external plaster, elevation & terrace waterproofing", percent: 5 },
  { stage: "On completion of lifts, water pumps and other services", percent: 5 },
  { stage: "At possession (on or after receipt of Occupancy Certificate/Completion Certificate, whichever is earlier)", percent: 5 },
];

// Standard Terms & Conditions — generic real-estate boilerplate. Please have
// your legal team review/customize these before relying on them; I've kept
// them general rather than inventing project-specific legal commitments.
const STANDARD_TERMS = [
  "This booking is provisional and shall be confirmed only upon execution of the Agreement for Sale and receipt of the payments as per the agreed schedule.",
  "The payment schedule mentioned herein is construction-linked; stamp duty, registration charges, and GST are payable separately and are not included in the slab percentages above.",
  "In case of cancellation of booking by the customer, the refund (if any) shall be subject to deduction of charges as per the Agreement for Sale and applicable law.",
  "The Saleable Area, Carpet Area, and layout indicated are as per the sanctioned plan and are subject to change as may be required by competent authorities, with proportionate adjustment in consideration, if applicable.",
  "Possession of the flat shall be subject to force majeure conditions, including but not limited to natural calamities, government orders, or circumstances beyond the developer's reasonable control.",
  "All applicable taxes, including GST, shall be borne by the customer at the rate prevailing at the time of payment.",
  "Car parking allotment, if any, is separate from this booking and shall be governed by a separate agreement/allotment letter.",
  "Society/association formation charges, maintenance deposits, and other incidental charges shall be payable by the customer separately, as applicable at the time of possession.",
  "The developer reserves the right to make changes in specifications, design, or amenities as may be necessitated by technical, statutory, or other requirements, without materially affecting the overall value of the flat.",
  "Any dispute arising out of or in connection with this booking shall be subject to the jurisdiction of the competent courts/authorities at Pune.",
];
