# YatraAI — Travel that adapts to reality

A GitHub Pages-friendly, API-first redesign for the hackathon problem statement.

## What is included

- White, premium landing page with a local-image gallery.
- Functional "Plan my trip" flow.
- Live destination geocoding via Open-Meteo.
- Live weather via Open-Meteo.
- Nearby attractions, food and local places via OpenStreetMap/Overpass.
- Adaptive itinerary generation using preferences, pace, walking/accessibility needs and weather.
- Source / uncertainty labels — opening hours are shown only when mapped data actually contains them.
- Leaflet + OpenStreetMap journey map.
- Local-first recommendations with explicit provenance.
- Optional AI enrichment through your own serverless endpoint.

## Put your images in the repository

Create an `assets` folder beside `index.html` and upload:

- `travel-01.jpg` — main hero image
- `travel-02.jpg` — local-life image
- `travel-03.jpg` — landscape image
- `travel-04.jpg` — culture image
- `travel-05.jpg` — slow-travel image

The image blocks are designed to look good even before you upload files.

## GitHub Pages

1. Upload the folder contents to a GitHub repository.
2. Go to **Settings → Pages**.
3. Select **Deploy from a branch**, choose `main` and `/root`.
4. Save. GitHub will publish `index.html`.

## Optional AI API

GitHub Pages is static, so a secret LLM API key must NOT be stored in `app.js` or `config.js`.

For an AI-powered final response layer, put your own serverless endpoint (Cloudflare Worker, Vercel Function, Netlify Function, etc.) in `config.js`:

```js
window.YATRA_CONFIG = {
  AI_ENDPOINT: 'https://your-domain.example.com/yatraai'
};
```

The endpoint receives a JSON payload containing the destination, trip preferences, accessibility selections, weather snapshot and nearby mapped places. It can return an optional `{ "itinerary": ... }` object.

## API / attribution notes

This demo deliberately uses user-triggered calls and visible attribution. OpenStreetMap's public Nominatim service has strict rate/usage rules, so this project uses Open-Meteo for geocoding and Overpass/OpenStreetMap for mapped places instead. If you grow the app beyond a hackathon demo, add caching and/or your own backend/proxy and replace public endpoints with a suitable production provider.

OpenStreetMap data is © OpenStreetMap contributors. Weather data is from Open-Meteo.
