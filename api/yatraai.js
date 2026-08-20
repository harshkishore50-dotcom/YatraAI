/**
 * YatraAI secure LLM proxy for Vercel.
 *
 * Environment variables:
 *   LLM_PROVIDER=gemini (default) | openai
 *   GEMINI_API_KEY=...
 *   GEMINI_MODEL=gemini-2.5-flash   (optional)
 *   OPENAI_API_KEY=...
 *   OPENAI_MODEL=gpt-4.1-mini       (optional)
 *
 * IMPORTANT: This file is a server-side function. Never expose the provider
 * keys in GitHub Pages client code.
 */

const SYSTEM = `You are YatraAI, a trust-first travel planning engine.

Your job is to build a useful, personalized itinerary ONLY from the evidence supplied by the server.

NON-NEGOTIABLE SAFETY / TRUST RULES:
1. Never invent opening hours, prices, ticket availability, transport status, safety advice, accessibility facilities, crowd levels, or cultural claims.
2. Only recommend places from the supplied mappedPlaces array. Use their placeId exactly. If the evidence is insufficient, return fewer stops rather than inventing one.
3. Opening hours may only be described as verified when the mapped place has an opening_hours tag. Otherwise mark uncertainty.
4. Never turn absence of evidence into a positive claim. Say unknown / not verified when necessary.
5. Prefer independent/local places when the supplied local flag supports that preference. Never claim a business is locally owned unless the supplied evidence supports it.
6. Weather is live evidence supplied by the client. Use it only to adapt timing/types of activities; do not invent forecasts.
7. Do not claim live crowd or transport conditions unless such fields are actually present in the supplied evidence.
8. Respect accessibility and low-walking requests. Do not claim a place is wheelchair accessible unless the supplied evidence explicitly supports it.
9. Every stop reason must explain the evidence-linked choice briefly.
10. Return valid JSON only, matching the requested schema.`;

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    itinerary: {
      type: 'array',
      minItems: 1,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          day: { type: 'integer' },
          date: { type: 'string' },
          stops: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                placeId: { type: 'string' },
                time: { type: 'string' },
                reason: { type: 'string' },
                source: { type: 'string' },
                sourceType: { type: 'string' },
                uncertainty: { type: 'string' }
              },
              required: ['placeId','time','reason','source','sourceType','uncertainty']
            }
          }
        },
        required: ['day','date','stops']
      }
    },
    meta: {
      type: 'object',
      additionalProperties: false,
      properties: {
        provider: { type: 'string' },
        confidence: { type: 'string' },
        summary: { type: 'string' },
        caveats: { type: 'array', items: { type: 'string' } }
      },
      required: ['provider','confidence','summary','caveats']
    }
  },
  required: ['itinerary','meta']
};

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function extractJson(text) {
  if (!text) throw new Error('Empty AI response.');
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI response was not valid JSON.');
  return JSON.parse(match[0]);
}

function promptFor(payload) {
  return `${SYSTEM}\n\nREQUEST DATA:\n${JSON.stringify(payload, null, 2)}\n\nOUTPUT SCHEMA:\n${JSON.stringify(schema, null, 2)}\n\nCreate the best itinerary for this traveler. Keep every factual statement traceable to the supplied evidence. For unsupported facts, use explicit uncertainty wording such as "Not verified from supplied data". Do not add place names that are not in mappedPlaces.`;
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured on the server.');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.2
    }
  };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Gemini request failed (${r.status})`);
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
  return extractJson(text);
}

async function callOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not configured on the server.');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},
    body:JSON.stringify({
      model,
      temperature:0.2,
      messages:[
        {role:'system',content:SYSTEM},
        {role:'user',content:prompt}
      ],
      response_format:{type:'json_object'}
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI request failed (${r.status})`);
  return extractJson(data?.choices?.[0]?.message?.content || '');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).setHeader('Access-Control-Allow-Origin','*').setHeader('Access-Control-Allow-Methods','POST, OPTIONS').setHeader('Access-Control-Allow-Headers','Content-Type').end();
    return;
  }
  if (req.method !== 'POST') return json(res, 405, { error:'Method not allowed.' });
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!payload?.destination || !Array.isArray(payload?.mappedPlaces)) {
      return json(res, 400, { error:'Missing destination or mappedPlaces.' });
    }
    const prompt = promptFor(payload);
    const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
    const result = provider === 'openai' ? await callOpenAI(prompt) : await callGemini(prompt);
    result.meta = {
      provider: provider === 'openai' ? 'OpenAI' : 'Gemini',
      confidence: result.meta?.confidence || 'evidence-linked',
      summary: result.meta?.summary || 'Plan generated from supplied live evidence.',
      caveats: Array.isArray(result.meta?.caveats) ? result.meta.caveats : []
    };
    return json(res, 200, result);
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: err?.message || 'AI service failed.' });
  }
}
