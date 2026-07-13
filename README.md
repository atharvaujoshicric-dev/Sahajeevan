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

1. Create a project at https://supabase.com (note your Project URL and anon key from **Settings → API**).
2. Open **SQL Editor → New query**, paste in the entire contents of `supabase/schema.sql`, and run it. This creates all tables, locks them down, and creates all the functions the app uses.
3. Then run `supabase/seed_data.sql` the same way — this loads all 126 flats from your sheet (Ownership Detail values have been cleaned/normalized to just `WPC LLP`, `DEVKAR`, `J & G NIMHAN`).

That's it on the Supabase side — no Edge Function, no manual user creation, no service-role key to configure.

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

You mentioned you'll share the exact PDF layout separately. For now, the booking detail screen has a "Print Booking Sheet" button that uses the browser's print dialog as a placeholder. Once you share the format, I'll build a proper generated PDF (matching your letterhead/layout) that pulls the live booking data automatically.

---

## 6. A few things worth knowing

- All 126 flats show in the seat map; flats not owned by "WPC LLP" are visible but greyed out and cannot be selected/booked — enforced both in the UI and inside the database functions, so it can't be bypassed by editing the page.
- The original sheet's Stamp Duty/GST/Package figures were recomputed slightly differently by row (small rounding differences). This system seeds each flat's **Agreement Value** from your sheet and then always derives Stamp Duty/GST/Package **live** from the formula above — so the first time you open a flat, the shown figures may differ by a rounding rupee or two from the original sheet, then stay perfectly consistent from then on.
- Session tokens last 30 days; resetting someone's password immediately signs them out everywhere, so they'll need the new password next time.
- Because there's no traditional server, all authorization checks (who can cancel a booking, who can reset a password, etc.) live inside the Postgres functions in `schema.sql` — worth a read if you ever want to change a business rule.
