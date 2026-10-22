# AGENTS.md

Context for AI coding tools working on **Invoice Baji**, a small single-user GST invoicing web app for an Indian service business that also exports services. Read this before changing anything. `README.md` covers setup; this file covers intent, rules and traps.

## What the product is (and is not)

Four jobs only: **Settings** (supplier profile), **Clients**, **Invoices** (three templates, PDF), **Reports** (GSTR-1 CSVs, GSTR-3B helper, composition summary, registers). Plus a Dashboard.

Out of scope for v1, do not add unless asked: expenses/ITC, credit/debit notes, e-invoicing (IRN/QR), e-way bills, payment gateways, recurring invoices, inventory, multi-user/multi-company, GST portal API filing, live exchange rates. Keep the data model clean enough that credit notes can be added later.

## Stack and commands

React 18 + Vite 6, React Router 6 (`HashRouter`), Firebase 11 (Auth + Firestore + Hosting), `@react-pdf/renderer` (PDFs are built in the browser, no Cloud Functions), `jszip`, Vitest. Plain CSS, no UI framework.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest: tax, numbering, rules, CSV, acceptance cases
npm run build
```

Deploy (hosting only, specific site; see "Firebase" below):

```bash
npm run build && npx firebase-tools deploy --only hosting:invoicebaji101 --project client-manager-v1-f095e
```

## Storage modes

`src/db/index.js` picks an adapter. If `VITE_FIREBASE_API_KEY` is set (in `.env`) it uses Firebase; otherwise a **localStorage demo mode** with no login. Both adapters implement the same interface (`getSettings`, `saveSettings`, `list`, `get`, `put`, `remove`, `issueInvoice`, `exportAll`, `importAll`, `clearAll`, `auth`). Add any new storage operation to **both** adapters.

To run demo mode while `.env` exists, start Vite with `VITE_FIREBASE_API_KEY=` (empty). `.claude/launch.json` has a `demo` config for this (port 5174).

`.env` holds Firebase web config, is git-ignored, and must never be committed. `.env.example` lists the variables.

## Firestore layout (all under the signed-in user)

| Path | Contents |
| --- | --- |
| `users/{uid}/meta/settings` | Supplier profile, registration, LUT, banks, prefixes, `lastRates` |
| `users/{uid}/clients/{id}` | Clients |
| `users/{uid}/invoices/{id}` | Invoices |
| `users/{uid}/counters/{template}_{FY}` | `{ last }` per series per financial year |

`firestore.rules` restricts each user to `users/{their uid}/**`. Firestore rejects `undefined`; adapters pass data through `clone()` (JSON round trip) before writing.

## Core rules (do not break these)

1. **Money is integer minor units** (paise / cents). Never sum floats. Parse user input with `toMinor`, display with `fmtMoney`. Exchange rate is a decimal; INR value = `Math.round(minor * rate)`.
2. **Tax** (`src/lib/tax.js`): computed per line, rounded to the minor unit, then summed. Intra-state = CGST + SGST (each half), else IGST. Bill of Supply has no tax. Exports are IGST only when export mode is `IGST`; under `LUT` tax is 0.
3. **Round off** to the nearest rupee applies to **INR documents only**. Foreign-currency totals are not rounded.
4. **Numbering** (`src/lib/numbering.js`): `PREFIX/FY/NNN`, e.g. `INV/26-27/001`; separate series per template (`tax` INV, `bos` BOS, `exp` EXP) restarting each financial year (1 April). Max 16 chars, only letters, digits, `-` and `/`. Drafts have **no number**; it is assigned only on Issue, atomically, inside the adapter (Firestore transaction) via `prepareIssue()` in `src/db/shared.js`. No gaps.
5. **Templates by registration**: Regular -> Tax Invoice (domestic) / Export of Services (overseas). Composition -> Bill of Supply only, own-state clients only; inter-state and overseas are blocked (`src/lib/rules.js`). Composition tax (default 6%, split CGST/SGST) is computed in reports only, never printed on bills.
6. **Reports count only Issued and Paid** invoices. Cancelled ones appear only in the documents table (Table 13) and the sales register. All report amounts are INR.
7. **Dates** are ISO `YYYY-MM-DD` strings. Financial year starts 1 April; labels look like `26-27`. GSTR-1 CSV dates are `dd-mmm-yyyy`.
8. **All GST constants** (state codes, rates, currencies, declarations, GSTR-1 CSV headers) live in `src/config/gst.js`. Do not scatter them. The portal's CSV headers change occasionally; edit them only there.

## Invoice lifecycle and editing

Statuses: `draft` -> `issued` -> `paid`, or `cancelled`.

- Drafts are freely editable. Validation messages appear only after the user clicks Save draft or Issue (the `showErrors` flag in `InvoiceEditor.jsx`).
- **Issued/paid invoices can be amended in place** via `/invoices/:id?edit=1` (`updateIssued` in `src/lib/service.js`). Number, series, template and FY are locked, the date must stay inside the invoice's FY, and the issue-time supplier snapshot is kept. This was an explicit later request and differs from the original brief (which made issued invoices read-only); the UI warns that filed returns should be amended by credit/debit note.
- Cancelled invoices are read-only; the number stays in the series.
- Issued invoices store a **supplier snapshot** (`inv.supplier`) so reprints never drift; PDFs render from it (`supplierFor`).

An invoice document holds: `template`, `number`, `seq`, `fy`, `date`, `dueDate`, `client` (snapshot), `currency`, `pos` (place of supply state code, `96` for exports), `reverseCharge`, `exportMode`, `exchangeRate`, `rateDate`, `lines[]` (`desc`, `sac`, `qty`, `unit`, `rate`, `discount`, `gstRate`), `calc` (`lines`, `totals`, `inr`), `payment`, `supplier`, timestamps. `calc.totals` is in the document currency; `calc.inr` is in INR and is what reports and the dashboard use.

## Code map

- `src/config/gst.js` constants and CSV headers
- `src/lib/` pure logic: `money`, `tax`, `rules`, `numbering`, `gstin` (format + checksum), `dates`, `csv`, `reports` (GSTR-1 sets, 3B, composition, registers), `service` (db-backed actions), `pdfActions`
- `src/db/` adapters (`firebase.js`, `local.js`), `shared.js`, `seed.js` (sample data through the real issue path)
- `src/pages/` Dashboard, Invoices, InvoiceEditor, Clients, Reports, Settings, Login
- `src/components/InvoicePDF.jsx` A4 layout for all three templates; `ui.jsx` shared inputs/modal; `PaidModal.jsx`
- `src/test/gst.test.js` unit and acceptance tests
- `src/theme.js` Auto/Light/Dark preference (localStorage), applied as `data-theme` on `<html>`

## UI conventions

- Visual direction: "modern tool" (Linear-like): hairline borders, one purple accent, Inter / Inter Tight / JetBrains Mono, radius max 12, no glow, no emoji, ease-out motion that respects `prefers-reduced-motion`.
- All colours come from CSS variables in `src/styles.css`. Light is the base; dark is defined twice (OS media query guarded by `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`). If you change a dark value, change both.
- Use `.mono` for IDs/amounts, `tabular-nums` for money columns.
- Indian number formatting for INR (`₹1,23,456.00`), standard for foreign currencies.
- Dashboard shows: this month's invoiced total, unpaid total, drafts, LUT warning, current vs previous FY table, and a month-wise bar chart (hand-written SVG, no chart library).

## PDF gotchas

- Noto Sans (via `@fontsource/noto-sans` woff files) is used. Its Latin subset has **no ₹ glyph**, so the symbol is drawn with the Devanagari-subset face (`Amt` component). Do not use the built-in Helvetica for INR.
- Noto needs generous line height; large text without an explicit `lineHeight` (~1.4-1.5) overlaps the next line.
- react-pdf only accepts TTF/WOFF, not WOFF2.
- The PDF module is large and is lazy-loaded (`src/lib/pdfActions.js`). Keep it that way.

## Firebase / deployment facts

- Project: `client-manager-v1-f095e`. **This project is shared with another app.** Never deploy to the default hosting site, and never run a bare `firebase deploy` (it would also push rules). Deploy only `hosting:invoicebaji101` (see `firebase.json`, which pins `"site": "invoicebaji101"`).
- Do not overwrite Firestore rules wholesale. This app only needs `users/{uid}/**` access for the owner; merge that block into any existing rules rather than replacing them.
- Live URL: https://invoicebaji101.web.app. Single login created manually in Firebase Authentication (there is deliberately no sign-up screen).
- Repo: https://github.com/navs7/InvoiceBaji101 (branch `main`).

## Testing expectations

Run `npm test` and `npm run build` before declaring work done. The tests encode the acceptance cases from the original brief (assuming supplier in 08-Rajasthan, regular, 18%):

1. Rajasthan B2B ₹10,000 -> CGST ₹900 + SGST ₹900, total ₹11,800, row in b2b with `08-Rajasthan`.
2. Maharashtra B2B -> IGST ₹1,800, `27-Maharashtra`.
3. Delhi unregistered ₹1,50,000 -> b2cl; ₹50,000 -> b2cs.
4. USD 2,000 at ₹88.50 under LUT -> INR ₹1,77,000.00, `exp` row `WOPAY`, IGST 0.
5. Composition: Bill of Supply ₹10,000, no tax; quarterly tax ₹600 (₹300 + ₹300); Maharashtra/US clients blocked.
6. 5 issued + 1 cancelled -> docs table total 5, cancelled 1, no gaps.
7. Selecting a client on a new invoice prefills currency, template, place of supply, SAC and terms.

When changing tax, numbering, rules or report code, add or update tests in `src/test/gst.test.js`. UI changes can be checked in demo mode (see "Storage modes"), since the real login is not available to tools.

## Deliberate choices worth knowing

- In GSTR-1 export rows, LUT exports carry rate `0` and type `WOPAY`; with IGST payment, type `WPAY` at the line rate. Exports go in the B2C HSN file.
- SAC codes must be at least 4 digits (6 if "turnover above ₹5 crore" is ticked in Settings).
- GSTIN validation checks 15 characters, format, state-code match and the checksum character. Sample data uses `withChecksum()` to produce valid GSTINs.
- "Send" opens a `mailto:` link and downloads the PDF to attach; there is no SMTP.
- Logo and signature images are resized client-side and stored as data URLs inside the settings document (keep under Firestore's 1 MB document limit).
- Hash routing (`#/invoices`) is intentional, so hosting needs no rewrite for deep links.
- Users should have their CA confirm SAC codes, GST rates, composition eligibility and LUT validity; the app does not give tax advice.

## Working agreements

- Keep changes small and in the existing style (match naming, comment density, plain CSS).
- Don't add dependencies without a clear need; avoid chart or UI libraries.
- Never commit `.env`, `.firebase/` or `.claude/` (already git-ignored).
- Commit, push and deploy only when the owner asks.
