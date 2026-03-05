# Ottawa Collision Analysis Dashboard

A research-grade traffic collision analysis tool for city planners, built on Ottawa's Open Data portal.

## Features

- 🗺 Interactive Leaflet map with collision markers colour-coded by severity
- 🔍 Address/intersection search (Nominatim geocoding)
- 📍 Click-anywhere-on-map querying with adjustable radius (250m / 500m / 1km / 2km)
- 📊 Live stats panel:
  - Total / Fatal / Injury KPIs
  - Severity breakdown pie chart
  - Year-over-year trend line (2017–2024)
  - Collision type horizontal bar chart
  - Road/weather conditions breakdown
- 🔄 Live data from City of Ottawa Open Data ArcGIS API

## Data Source

City of Ottawa – Traffic Collision Data (2017–2024)  
https://open.ottawa.ca/datasets/146fb790d2ce4357b8f9651b797dd7d3_0

---

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Netlify

### Option A — Connect GitHub repo (recommended)

1. Push this folder to a GitHub repository
2. Go to https://app.netlify.com → **Add new site → Import an existing project**
3. Connect your GitHub repo
4. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Click **Deploy site**

### Option B — Drag & drop

```bash
npm install
npm run build
```

Drag the `dist/` folder into https://app.netlify.com/drop

---

## Project Structure

```
src/
  main.jsx        # React entry point
  App.jsx         # Main layout, search, radius controls
  CollisionMap.jsx # Leaflet map component
  StatsPanel.jsx   # Charts and KPI sidebar
  utils.js         # API fetching, geocoding, label helpers
  index.css        # Global styles
index.html
vite.config.js
netlify.toml
package.json
```
