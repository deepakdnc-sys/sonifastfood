# SONI FAST FOOD v3.2

## Install
1. Back up your current Apps Script and Google Sheet.
2. Replace Code.gs in the EXISTING Apps Script project (do not run setup() or change SHEET_ID).
3. Run initializeTrackingSecret() ONCE in Apps Script editor. This is required for new orders and tracking. Do not reset SFF_TRACKING_SECRET later.
4. Deploy > Manage deployments > Edit > New version > Deploy. Keep the existing /exec URL.
5. Upload updated index.html, admin.html, admin.js, assets/app.js, assets/admin.js, assets/tracking.js, assets/style.css and backend/Code.gs to GitHub. Keep config.js values unchanged.
6. Hard refresh the website and admin page.

## Features
- Order tracking uses a private per-order HMAC tracking code, provided on new orders; existing orders have no customer tracking code.
- Dashboard polls every 20 seconds when open and visible; audio alerts must be enabled with a click. No background push notification service is included.
- Mobile dashboard with call/map buttons and status controls.
- Date presets, COD/UPI breakdown and CSV report export (up to 2000 rows).
- Order and payment workflows unchanged, including no delivery OTP.

## Tests
1. Place a new COD order, save its private tracking URL, verify PLACED.
2. Login to owner dashboard, enable sound, place another order, verify new-order count.
3. ACCEPT > PREPARING > OUT_FOR_DELIVERY > DELIVERED, check tracking page after each change.
4. Mark PAID only after receiving cash or verifying UPI in bank.
5. Check Today, 7 Days, This Month, and export CSV.
6. Verify old orders and current customer checkout still work.

Security: do not publish owner password, tracking secret, or session tokens. Anyone with a tracking link can view the limited order status; keep links private.
