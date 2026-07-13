# Sahjeevan Live Inventory System

A multi-login flat inventory & booking system:
- **Admin** login — full analytics, manages all sales/admin logins (create, reset password without needing the old one, deactivate), toggles the "Cash Component" per flat, can cancel bookings.
- **Sales** logins (created by admin) — search any flat, view full details, edit Agreement Value / Package Total (auto-recalculates Stamp Duty, GST, Registration), choose 6% or 7% stamp duty, book a flat. Sales **cannot** cancel a booking.
- Flats are shown as a **seat-map** (like a cinema/BookMyShow seat picker) — all 126 flats from your sheet are visible, but **only flats with Ownership Detail = "WPC LLP" are clickable/bookable** for now. Others are shown greyed-out.

---

## 1. Architecture (important — please read)

GitHub Pages can only host static files (HTML/CSS/JS). It **cannot** run a backend or safely hold secret keys. So:

- **Frontend** (`index.html` + `/css` + `/js`) → hosted on GitHub Pages.
- **Database + Auth** → hosted on Supabase, talked to directly from the browser using the public **anon key** (safe to expose — access is locked down with Row Level Security).
- **Admin actions that need elevated privileges** (creating a login, resetting someone's password without knowing the old one) → this genuinely requires Supabase's admin/service-role key. That key must **never** be placed in any file that goes to GitHub Pages, or anyone could view-source it and get full control of your database.
  → Instead, it lives only inside a small **Supabase Edge Function** (`supabase/functions/admin-users`), which runs on Supabase's own servers. The admin's browser calls this function; the function checks the caller really is an admin, then does the privileged action.

So you will deploy to **two places**: GitHub Pages (frontend) and Supabase (database + this one function). This is the standard, secure way to do this — there's no way to do password resets from a pure static site without it.

---

## 2. Supabase setup

1. Create a project at https://supabase.com (note your Project URL and anon key from **Settings → API**).
2. Open **SQL Editor → New query**, paste in the entire contents of `supabase/schema.sql`, and run it.
3. Then run `supabase/seed_data.sql` the same way — this loads all 126 flats from your sheet (Ownership Detail values have been cleaned/normalized: `WPC LLP`, `DEVKAR`, `J & G NIMHAN`).
4. Deploy the Edge Function (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy admin-users
   ```
   The function automatically has access to `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — Supabase injects these for you, you don't need to set them manually.
5. Create your **first Super Admin** manually (one-time only — after this, that admin can create everyone else from the Users tab in the app):
   - Go to **Authentication → Users → Add user**, email = `youradminid@sahjeevan.internal`, set a password, confirm email = yes.
   - Go to **Table Editor → profiles → Insert row**: `id` = the UUID of the user you just created (copy from the Authentication page), `username` = `youradminid`, `role` = `admin`, `active` = `true`.
   - You can now log into the app with ID `youradminid` and that password.

---

## 3. Frontend setup

1. Open `js/supabaseClient.js` and fill in:
   ```js
   const SUPABASE_URL = "https://xxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJ...";           // the anon/public key, NOT service role
   const ADMIN_USERS_FUNCTION_URL = "https://xxxx.supabase.co/functions/v1/admin-users";
   ```
2. That's it — no build step. Drag-and-drop the whole folder into a GitHub repo, then in **Settings → Pages**, set source to your main branch (root). Your app will be live at `https://yourusername.github.io/yourrepo/`.

---

## 4. How the pricing engine works

For each flat: `Package Total = Agreement Value + Stamp Duty + Registration (₹30,000) + GST (5%)`, where `Stamp Duty = Agreement Value × rate` and rate is **6%** or **7%**, picked manually by the sales user per booking (no gender field is stored — it's a free choice as you requested).

- Editing **Agreement Value** recalculates Stamp Duty/GST/Package Total automatically.
- Editing **Package Total** instead back-solves the Agreement Value from it, then recalculates everything else — both directions work.
- These are enforced by the database itself (generated columns + an RPC function), so the numbers can never drift out of sync no matter which field was edited.

**Cash Component (CC):** admin turns this on for a specific flat and sets an amount. Once enabled, the sales user sees it on that flat's detail screen and can choose to include it when booking. Sales cannot turn it on/off or change the amount — only admin can.

**Cancellations:** only the admin's login can cancel an active booking (Bookings tab, or from a flat's detail screen) — the flat then goes back to Available. This action is blocked at the database level for sales logins, not just hidden in the UI.

---

## 5. About the booking-sheet PDF

You mentioned you'll share the exact PDF layout separately. For now, the booking detail screen has a "Print Booking Sheet" button that uses the browser's print dialog as a placeholder. Once you share the format, I'll build a proper generated PDF (matching your letterhead/layout) that pulls the live booking data automatically.

---

## 6. A few things worth knowing

- All 126 flats show in the seat map; flats not owned by "WPC LLP" are visible but greyed out and cannot be selected/booked, per your instruction — this is enforced both in the UI and in the database function, so it can't be bypassed by editing the page.
- The original sheet's Stamp Duty/GST/Package figures were recomputed slightly differently by row (small rounding differences). This system seeds each flat's **Agreement Value** from your sheet and then always derives Stamp Duty/GST/Package **live** from the formula above — so the first time you open a flat, the shown figures may differ by a rounding rupee or two from the original sheet, then stay perfectly consistent from then on.
- "ID" typed at login is just a username — under the hood it's mapped to a fake email (`id@sahjeevan.internal`) so we can use Supabase's standard, well-tested auth system without asking your team to remember an email address.
