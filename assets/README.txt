Put these two files here:

logo.png     - your project logo (referenced by js/config.js)
               Recommended: ~300x120px, transparent background, PNG or SVG.
               Used on: the login/create-admin screens, and as the letterhead
               logo + large watermark on every page of the booking sheet.

rera-qr.png  - your actual MAHA-RERA QR code image (the one RERA issued you)
               Used on: the login/create-admin screens, and the booking sheet
               letterhead (top-right, above the RERA number).

If either file isn't here, the app just quietly hides the broken image
instead of showing an error.
