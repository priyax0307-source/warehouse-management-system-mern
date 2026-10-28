# Warehouse Management System (MERN)

A MERN implementation of the features described in the project report: persistent account authentication and roles, product and location management, bin-level inventory, receiving, picking, dispatch, cycle counting and stock reconciliation, supplier lookup, dashboard alerts, search, reports and activity history.

## Requirements

- Node.js 20+
- MongoDB Community Server or MongoDB Atlas

## Run locally

1. In `server`, copy `.env.example` to `.env` and set `MONGODB_URI` and `JWT_SECRET`.
2. Run `npm install` and then `npm run dev` in `server`.
3. In `client`, run `npm install` and `npm run dev`.
4. Open the Vite URL shown in the terminal. This local Stockroom setup uses the API at `http://localhost:5010` and the client at `http://localhost:5174`.

## Deploy

GitHub Pages hosts the React client only. The Express API and MongoDB must run separately; this repository includes a GitHub Pages workflow and a Render Blueprint for the API.

1. Push this repository to GitHub on the `main` branch.
2. In GitHub, enable Pages with **GitHub Actions** as the publishing source.
3. Create a MongoDB Atlas database using a replica set, then deploy `render.yaml` as a Render Blueprint. Supply `MONGODB_URI` and set `CLIENT_ORIGIN` to the GitHub Pages origin, for example `https://your-user.github.io` (origin only, no repository path). Render generates `JWT_SECRET`.
4. Copy the deployed API URL from Render. In the GitHub repository, add an Actions variable named `VITE_API_URL` with the API URL ending in `/api`, such as `https://your-api.onrender.com/api`.
5. Run the **Deploy Stockroom client to GitHub Pages** workflow. The site is published when the workflow succeeds.

Never commit `.env` files, MongoDB connection strings, or JWT secrets. GitHub Pages does not run the Express server.

## Sample warehouse data

Run `npm run seed` in `server` to add example products, warehouses, storage bins, inventory, receipts, pick tasks, dispatch orders and activity. The seed is idempotent and skips databases that already contain warehouse records. Create or sign in to your account through the website to view and manage the data.

Reports include inventory lots, stock health and reorder risk, bin utilization, receiving, supplier activity, picking, dispatch, cycle-count variances and combined inbound/outbound movements. Date filters apply to dated records, and the summary cards update with the selected range. Cycle counts compare a physical bin count with the recorded quantity and reconcile the difference transactionally, with an activity entry for the audit trail.

The first registered account is an administrator to make local setup possible. Later public registrations receive the staff role. Change the first-admin behavior before deploying to a shared environment.

## Project structure

- `client/`: React, Vite, responsive dashboard and operational screens.
- `server/`: Express API, Mongoose models, JWT authentication and role middleware.

Core stock-changing actions use MongoDB transactions and therefore require a replica set (Atlas provides this; local MongoDB can be started as a single-node replica set). For standalone MongoDB development, configure a replica set before using receive/pick/dispatch actions.

## Notes

The website starts with an empty database. Add a product, warehouse and bin, then record receiving to populate inventory. Reports and dashboard counts are derived from live database records.
