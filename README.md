# Pixel Solutions

A small GST invoicing app for an Indian service business that also exports services. It does four things: Settings, Clients, Invoices (three templates, PDF), and monthly GST reports with CSV download. There is no accounting, inventory or payment handling.

**Stack:** React + Vite, Firebase (Auth + Firestore), PDFs built in the browser with `@react-pdf/renderer`. No Cloud Functions are needed, so it runs on the free Spark plan.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests: tax, numbering, rules, CSV, acceptance cases
npm run build
```

With no Firebase details the app runs in **demo mode**: no login, and data stays in this browser's localStorage. Use *Settings → Load sample data* (or the link on the empty dashboard) to get one business profile, four clients and a few invoices.

## Connect Firebase

1. Create a Firebase project and add a **Web app**. Copy `.env.example` to `.env` and fill in the six values.
2. **Authentication → Sign-in method:** enable *Email/Password*, then **Users → Add user** to create your one login. (There is deliberately no sign-up screen.)
3. **Firestore Database:** create a database, then deploy the rules in `firestore.rules` (each user can only access `users/{their uid}/**`):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules
   ```
4. Restart `npm run dev`. To host it: `npm run build && npx firebase-tools deploy --only hosting`.

## Data model

All money is stored as **integer minor units** (paise / cents). Tax is rounded per line to the minor unit, then summed; INR invoices get a visible *Round off* line to the nearest rupee. Foreign-currency totals are not rounded to whole units.

| Path | Contents |
| --- | --- |
| `users/{uid}/meta/settings` | Supplier profile, GST registration, LUT, bank details, prefixes, last exchange rates |
| `users/{uid}/clients/{id}` | Client master data and invoice defaults (archived, never hard-deleted once invoiced) |
| `users/{uid}/invoices/{id}` | Invoice with client snapshot, lines, calculated amounts (document currency and INR), status, payment info, and the supplier snapshot taken at issue |
| `users/{uid}/counters/{template}_{FY}` | Last number used per series per financial year |

Numbers (`INV/26-27/001`, `BOS/…`, `EXP/…`) are assigned **only when an invoice is issued**, inside a Firestore transaction, so there are no gaps. Issued invoices are read-only; cancelling keeps the number and reports it as cancelled.

## Where things live

- `src/config/gst.js`: all GST constants (state codes, rates, currencies, declarations, GSTR-1 CSV headers). Edit headers here when the GST portal changes them.
- `src/lib/tax.js`, `rules.js`, `numbering.js`, `reports.js`: tax calculation, template and blocking rules, numbering, report builders (pure functions, unit tested).
- `src/db/`: storage adapters (Firebase and localStorage) behind one interface.
- `src/components/InvoicePDF.jsx`: the A4 PDF layout for all three templates.

## Choices to review with your CA

- **LUT exports in GSTR-1 files:** the rate is written as `0` and the export type as `WOPAY`. With IGST payment it is `WPAY` at the line rate.
- **HSN summary:** exports go in `hsn_b2c.csv` as the brief says. SAC codes must be at least 4 digits (6 if you tick the ₹5 crore toggle in Settings).
- **Composition:** only Bills of Supply to clients in your own state; inter-state and overseas clients are blocked. The composition tax is computed only in Reports.
- **Documents table:** one row per series (Tax Invoice / Bill of Supply / Export). Cancelled numbers stay in *Total Number* and are also counted under *Cancelled*.
- **Sending email:** opens your mail client with the client's addresses and a greeting, and downloads the PDF to attach. No SMTP.

## Not included (v1)

Expenses and ITC, credit/debit notes, e-invoicing, e-way bills, payment gateways, recurring invoices, inventory, multi-user, GST portal API filing, live exchange rates.

## Backup

*Settings → Download backup* saves everything as JSON; *Restore* replaces all data from such a file.
