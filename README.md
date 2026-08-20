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


## Troubleshooting on GitHub Pages

- The planner uses Open-Meteo directly from the browser for destination geocoding and weather.
- Nearby places use Overpass via GET requests to reduce CORS/preflight problems on static hosting.
- The map uses Leaflet with OpenStreetMap tiles. No map API key is required.
- If a live source is unavailable, YatraAI labels the data as unavailable instead of inventing facts.
- Add your own photographs as `assets/travel-01.jpg` through `assets/travel-05.jpg`.

### Demo test
Enter `Jaipur` (or another city) and click **Build my itinerary**. You should see API status cards, a non-empty itinerary, and a map.

## Real AI engine (Gemini by default)

This package now includes a secure serverless AI backend at `api/yatraai.js`. The browser sends only travel preferences plus live evidence to that endpoint; the provider secret stays in the server environment.

The backend supports:

- **Gemini** (default): set `LLM_PROVIDER=gemini` and `GEMINI_API_KEY` in Vercel Environment Variables.
- **OpenAI**: set `LLM_PROVIDER=openai` and `OPENAI_API_KEY` in Vercel Environment Variables.

Optional model variables:

```text
GEMINI_MODEL=gemini-2.5-flash
OPENAI_MODEL=gpt-4.1-mini
```

### Recommended deployment for a GitHub Pages frontend

1. Import the same repository into Vercel.
2. Add `GEMINI_API_KEY` (or `OPENAI_API_KEY`) in **Project Settings → Environment Variables**.
3. Leave `LLM_PROVIDER=gemini` for the default Gemini setup.
4. Deploy the project. Vercel serves `api/yatraai.js` as the secure API.
5. Copy the deployed endpoint, for example:
   `https://your-project.vercel.app/api/yatraai`
6. Put that URL into `config.js` as `AI_ENDPOINT`.
7. Your GitHub Pages frontend continues to be the public website, while Vercel securely calls Gemini/OpenAI.

### Why the LLM cannot invent places

The browser sends a short, source-linked `mappedPlaces` list with stable IDs and coordinates. The server prompt requires the model to select only those IDs. The frontend then discards any AI stop whose ID is not present in the supplied evidence. This makes the LLM a reasoning layer over evidence instead of a free-form travel fact generator.

The backend also uses structured JSON output for Gemini so the frontend receives a predictable itinerary object. Google documents structured JSON output for Gemini's Generate Content API. See: https://ai.google.dev/gemini-api/docs/structured-output
