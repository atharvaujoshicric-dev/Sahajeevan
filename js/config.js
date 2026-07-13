// ============================================================================
// PROJECT / BOOKING-SHEET CONFIG
// Fill these in with your real details — I don't have your actual logo,
// RERA number, or address, so I've left them as placeholders rather than
// making anything up (this ends up on a legal-facing document).
// ============================================================================

const PROJECT_NAME = "Sahjeevan";
const PROJECT_ADDRESS_LINE1 = "Near Onella Nest Phase 1, Thaksen Nagar, Sus,";
const PROJECT_ADDRESS_LINE2 = "Pune, Maharashtra 411021";
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

// Project-specific Terms & Conditions, as provided.
const STANDARD_TERMS = [
  "Booking Amount: ₹2,00,000/- only.",
  "Balance Payment: 10% to be paid within 2 weeks from the date of booking.",
  "Legal Charges: ₹15,000/- to be paid at the time of agreement.",
  "100% refund on booking cancellation within 15 days. After 15 days, interest as per RERA on the booked amount will be deducted and the balance amount will be refunded.",
  "One Covered Parking is included in the Package Cost Above.",
  "GST, Stamp duty, Registration charges, and all applicable government charges are as per the current rates, and in future, it may change as per government notification which would be borne by the customer.",
  "Flat registration to be done within 15 days from the date of booking.",
  "The above areas are shown in square feet only to make it easy for the purchaser to understand. The sale of the said unit is on the basis of the RERA carpet area only.",
  "Maintenance Charges are payable for 24 months of ₹4/- PSF on carpet area at the time of possession.",
  "Loan facilities are available from all leading banks and home loan sanctioning is the customer's responsibility, the developer however will assist in the process.",
  "All legal documents will be executed in square meters only.",
  "Booking is non-transferable.",
  "The promoters reserve the right to change the above prices and the offer given at any time without prior notice.",
  "The information on this paper is provided in good faith and does not constitute part of the contract.",
];
