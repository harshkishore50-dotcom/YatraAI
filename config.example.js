// Rename this file to config.js only if you have your own public/serverless AI endpoint.
// NEVER put a private OpenAI/Gemini/Anthropic key in this GitHub repository.
window.YATRA_CONFIG = {
  AI_ENDPOINT: 'https://YOUR-SERVERLESS-ENDPOINT.example.com/yatraai',
  OVERPASS_ENDPOINTS: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ]
};
