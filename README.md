# Sahjeevan Live Inventory System

A multi-login flat inventory & booking system:
- **Admin** (Super Admin) — full analytics, creates/edits/deletes sales & admin logins, resets anyone's password without needing the old one, toggles the "Cash Component" per flat, and is the only one who can cancel a booking.
- **Sales** logins (created by admin) — search any flat, view full details, edit Agreement Value / Package Total (auto-recalculates Stamp Duty, GST, Registration), choose 6% or 7% stamp duty, book a flat. Sales **cannot** cancel a booking.
- Flats are shown as a **seat-map** (like a cinema/BookMyShow seat picker) — all 126 flats from your sheet are visible, but **only flats with Ownership Detail = "WPC LLP" are clickable/bookable** for now. Others are shown greyed-out.

---

## 1. Architecture

Everything runs on just two pieces, no Edge Functions:

- **Frontend** (`index.html` + `/css` + `/js`) → static files, hosted on GitHub Pages.
- **Database** → Supabase (Postgres). The app talks to it directly from the browser using only the public **anon key**.

There is **no Supabase Auth** in this build and **no service_role key anywhere**. Instead, logins, sessions, and password resets are handled entirely by this app's own tables and database functions (`supabase/schema.sql`), using Postgres's `pgcrypto` extension to hash passwords. A login gets a random session token back, which the browser stores in `localStorage` and sends along with each request; every privileged action (creating a user, resetting a password, cancelling a booking, etc.) is checked **inside the database function itself** — the underlying tables are locked down so the anon key alone can't touch them directly, only through these functions. This is why it's safe to have the anon key sit in a public JS file, and why no separate secret-holding service is needed.

**First run:** since there are no admin logins yet, the app detects that and shows a **"Create Admin Account"** screen instead of the login form. Fill that in once — it becomes your Super Admin login — and from then on everyone (including that admin) signs in through the normal login screen. From the admin's **Users** tab you can then create, edit, reset the password for, or delete any sales/admin login.

---

## 2. Supabase setup

**Always use this exact sequence, in order:**
1. `supabase/full_rebuild.sql` — drops every table/function this app has ever created, under any signature it's ever had. Safe to run even on a brand-new project (everything is `if exists`).
2. `supabase/schema.sql` — creates everything fresh, with every fix included.
3. `supabase/seed_data.sql` — loads all 126 flats.

Then reload the app — you'll land on "Create Admin Account" since it's a clean slate.

**Why always start with the rebuild, even the first time?** Earlier iterations of this schema (before you had this version) used Supabase Auth and a different table (`profiles`). If your project ever ran an older version of the schema, some tables/functions can be left over with slightly different definitions than the current ones — and that mismatch is exactly what caused the `_fkey` errors you saw. Running `full_rebuild.sql` first guarantees there's nothing old left to conflict with, regardless of what you've run before. The `fix_ambiguous_columns.sql` file from earlier is now obsolete — everything it did is already included in `schema.sql`, so you don't need it anymore.

## 2a. Unblocking a non-WPC-LLP flat

Only WPC LLP flats are bookable by default. From a flat's detail screen, admin now sees an **"Unblock for booking"** button for any other flat — clicking it lets sales select and book that flat too. Admin can **Revoke** that override again at any time, as long as the flat hasn't already been booked (revoking a booked flat isn't allowed, since that would leave an active booking on a flat sales could no longer normally touch).

---

## 3. Frontend setup

1. Open `js/supabaseClient.js` and fill in:
   ```js
   const SUPABASE_URL = "https://xxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJ...";   // the anon/public key only
   ```
2. That's it — no build step. Drag-and-drop the whole folder into a GitHub repo, then in **Settings → Pages**, set source to your main branch (root). Your app will be live at `https://yourusername.github.io/yourrepo/`.
3. Open the live URL — since no admin exists yet, you'll land on **"Create Admin Account."** Fill it in, and you're logged in as Super Admin immediately. Go to the **Users** tab to create your sales team's logins.

---

## 4. How the pricing engine works

For each flat: `Package Total = Agreement Value + Stamp Duty + Registration (₹30,000) + GST (5%)`, where `Stamp Duty = Agreement Value × rate` and rate is **6%** or **7%**, picked manually by the sales user per booking.

- Editing **Agreement Value** recalculates Stamp Duty/GST/Package Total automatically.
- Editing **Package Total** instead back-solves the Agreement Value from it, then recalculates everything else — both directions work.
- These are enforced by the database itself (generated columns + a dedicated function), so the numbers can never drift out of sync no matter which field was edited.

**Cash Component (CC):** admin turns this on for a specific flat and sets an amount. Once enabled, the sales user sees it on that flat's detail screen and can choose to include it when booking. Sales cannot turn it on/off or change the amount — only admin can (enforced in the database, not just hidden in the UI).

**Cancellations:** only the admin's login can cancel an active booking (Bookings tab, or from a flat's detail screen) — the flat then goes back to Available. This is blocked at the database level for sales logins.

**User management:** admin can create, edit (name/role/active status), reset the password for, or permanently delete any login from the Users tab. A safety rule prevents deleting/demoting the very last remaining admin account, so you can never accidentally lock yourself out.

---

## 5. About the booking-sheet PDF

Done — click **"Print Booking Sheet"** on a booked flat's detail screen. It opens a new tab with a print-ready sheet: your project letterhead (logo top-left, RERA number + QR code top-right), full buyer/flat/pricing details, and **two copies** — a **Sales Copy** and a **Customer Copy** — each ending in signature lines for both the customer and the sales person (with space for name and date). Use the "Print / Save as PDF" button at the top (hidden when actually printing) — in the browser's print dialog, choose "Save as PDF" to get a PDF file, or print directly.

**Three things you need to fill in yourself** (in `js/config.js`) — I didn't invent these since they end up on a legal-facing document:
- `PROJECT_LOGO_PATH` — defaults to `assets/logo.png`. Drop your real logo file at `assets/logo.png` (a placeholder note is already in that folder).
- `PROJECT_RERA_NUMBER` — currently a placeholder, replace with your actual RERA registration number.
- `PROJECT_ADDRESS` — I filled this in from the address on your Parking Sheet ("S. No. 254, Sus, Mulshi, Pune") — double check it's correct/complete.

The QR code currently just encodes a simple text reference (project name, flat ID, booking ID) — if you'd like it to link to an actual verification page instead, update the `qrContentForBooking()` function in `js/config.js`.

---

## 6. If you ever see two screens overlapping (e.g. login + dashboard at once)

This happens if the browser (or GitHub Pages' CDN) is serving a **mix of old and new files** — for example an old `index.html` cached alongside a newer `js/auth.js`. To avoid this:
- Always replace **all** files together when you update, not just one or two.
- Do a hard refresh after deploying (Ctrl+Shift+R / Cmd+Shift+R), or open in a private/incognito window.
- The asset links in `index.html` already include a `?v=...` cache-busting parameter — bump that version string any time you redeploy changed files, so browsers are forced to fetch the new versions instead of a cached copy.

## 7. Resetting system data

Admin → **Users tab → Danger Zone → Reset System Data**. This permanently deletes all bookings, returns every flat to Available, and clears any Cash Component flags — logins are untouched. You'll be asked to type `RESET` to confirm before anything happens; there's no way to undo it afterward.

## 8. A few things worth knowing


- All 126 flats show in the seat map; flats not owned by "WPC LLP" are visible but greyed out and cannot be selected/booked — enforced both in the UI and inside the database functions, so it can't be bypassed by editing the page.
- The original sheet's Stamp Duty/GST/Package figures were recomputed slightly differently by row (small rounding differences). This system seeds each flat's **Agreement Value** from your sheet and then always derives Stamp Duty/GST/Package **live** from the formula above — so the first time you open a flat, the shown figures may differ by a rounding rupee or two from the original sheet, then stay perfectly consistent from then on.
- Session tokens last 30 days; resetting someone's password immediately signs them out everywhere, so they'll need the new password next time.
- Because there's no traditional server, all authorization checks (who can cancel a booking, who can reset a password, etc.) live inside the Postgres functions in `schema.sql` — worth a read if you ever want to change a business rule.
