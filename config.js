window.YATRA_CONFIG = {
  // Deploy the included /api/yatraai.js on Vercel (or your own serverless host)
  // and paste that public HTTPS URL here. Never put a Gemini/OpenAI key here.
  AI_ENDPOINT: 'https://YOUR-VERCEL-APP.vercel.app/api/yatraai',
  OVERPASS_ENDPOINTS: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ]
};
