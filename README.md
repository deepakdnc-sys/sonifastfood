# SONI FAST FOOD — GitHub Pages Website

A mobile-friendly restaurant website for **SONI FAST FOOD**, Moti Chowk, Taxi Stand, Jodhpur, Rajasthan.

## Features

- Responsive premium white / charcoal / gold theme
- Food categories and menu
- Home delivery cart with quantity controls
- Customer details, GPS permission and address
- Order requests to Google Apps Script and Google Sheets (once configured)
- Tomorrow-only dine-in *request* with one item and one quantity
- Server-side price, stock, radius, slot and duplicate booking request validation
- No delivery OTP

**Important limitations:** This is a customer-facing starter website, **not a finished restaurant platform**. The owner admin dashboard, verified UPI payment flow, secure QR invoice, voucher redemption, order tracking, printable invoices, automated notifications, map pin picker and Android app are **not included**. Dine-in requests are not approved bookings and do not collect payments. The sample backend does not send customer confirmations or process refunds. Do not turn on services until you have operationally tested your processes. Public Apps Script endpoints need additional abuse controls before large-scale deployment.

## Publish free with GitHub Pages

1. Create a new public GitHub repository named `soni-fast-food`.
2. Upload **the contents of this folder** (`index.html`, `assets/`, `backend/`, `README.md`) to the repository root, or use Git to push them.
3. In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
4. Wait for deployment. Your website will be at `https://YOUR_USERNAME.github.io/soni-fast-food/`.
5. Changes pushed to `main` will publish automatically.

## Configure the Google Apps Script backend

1. Open [script.google.com](https://script.google.com) and create a new standalone project.
2. Replace `Code.gs` with `backend/Code.gs` and set the manifest to `backend/appsscript.json` (enable manifest file in project settings).
3. Run `setup()` in the Apps Script editor and authorize access. Find the new Sheet URL in **Executions / Logs**.
4. Open the Sheet's `Settings` tab. Set `shopLatitude` and `shopLongitude` to **your actual shop GPS coordinates**, not a guessed location. Review `deliveryRadiusKm`, `minOrder`, and `deliveryBaseCharge`.
5. Review `Menu` prices, descriptions and stock. The provided entries are **illustrative**, not confirmed restaurant prices.
6. **Only after testing**, set `deliveryEnabled` to `TRUE` if you can manually fulfill orders. For dine-in, set `dineEnabled` to `TRUE` only if you have an independent way to collect and verify payment. Both default to `FALSE`.
7. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone**. Note: this creates a public API; review privacy and abuse risks first.
8. Copy the deployed `/exec` URL into `assets/config.js` as `API_URL`.
9. Commit and push the changed config file. Never put a password or API secret into this public file.

## Important operating and security notes

- GitHub Pages serves static files only; the backend must be deployed separately.
- Apps Script Web App URLs are public when access is set to Anyone. The sample backend exposes **only public menu and customer request actions**, no admin or personal-data retrieval API.
- Google Sheets is not a transactional database. The included LockService reduces simultaneous write collisions but cannot provide full rollback across all sheets. Review failed partial writes before production use.
- Manual UPI selection sets `PENDING_VERIFICATION`; it **does not generate a payment QR, verify a transfer, or authorize a booking**.
- The current UI captures device GPS, but does not offer an interactive pin correction. Require a precise written address and manually confirm any ambiguous location.
- Public forms can be abused. Add request rate limits, monitoring, data retention and appropriate privacy notices before opening to the public.
- The sample backend does not implement the owner password `123456` because there is **no owner login** in this starter. Never expose that password in a public GitHub repository.
- Avoid putting private customer details in QR codes or public pages.

## Project files

```text
soni-fast-food/
├── index.html
├── assets/
│   ├── app.js
│   ├── config.js
│   └── style.css
├── backend/
│   ├── Code.gs
│   └── appsscript.json
└── README.md
```

## Local preview

Open `index.html` in a browser, or run `python -m http.server 8000` in the project directory and visit `http://localhost:8000`.
