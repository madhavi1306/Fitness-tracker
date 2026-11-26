import { z } from 'zod';

export const ASSISTANT_SYSTEM_PROMPT = 'You are Formline\'s voice fitness assistant, a friendly and motivating coach. Reply to greetings naturally (for "hi" say "Hi! What can I help you with today?"). Answer questions about workouts, exercises, form, nutrition, and progress. Keep replies to 1-3 sentences, plain text only, no markdown or emojis, because replies are spoken aloud. For injuries or medical problems, give general advice and suggest a doctor.';

const assistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(1000),
  }).strict()).max(8).optional().default([]),
  language: z.enum(['en-IN', 'kn-IN']).optional().default('en-IN'),
}).strict();

export async function chatAssistant(req, res) {
  const parsed = assistantRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Enter a question up to 500 characters',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { message, history, language } = parsed.data;
  const { AI_ENABLED, AI_API_URL, AI_API_KEY, AI_MODEL } = process.env;
  if (AI_ENABLED !== 'true' || !AI_API_URL || !AI_API_KEY || !AI_MODEL) {
    return res.status(503).json({
      error: 'Conversational AI is not configured. Set AI_ENABLED, AI_API_URL, AI_API_KEY, and AI_MODEL in backend/.env.',
    });
  }

  let endpoint;
  try {
    endpoint = new URL(AI_API_URL);
  } catch {
    return res.status(503).json({ error: 'The conversational AI endpoint URL is invalid.' });
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    return res.status(503).json({ error: 'The conversational AI endpoint must use HTTP or HTTPS.' });
  }

  let providerResponse;
  try {
    providerResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
          { role: 'system', content: 'You do not have access to the user’s account, workout, food, or progress records. Do not claim to know personal records or perform actions in the app. Conversation history contains only messages from this active conversation.' },
          ...(language === 'kn-IN'
            ? [{ role: 'system', content: 'Reply naturally in Kannada (ಕನ್ನಡ). Keep the reply brief and suitable for speech.' }]
            : []),
          ...history,
          { role: 'user', content: message },
        ],
        max_tokens: 180,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    console.error('Conversational AI request failed.');
    return res.status(502).json({ error: 'Could not reach the conversational AI provider. Please try again.' });
  }

  if (!providerResponse.ok) {
    console.error(`Conversational AI provider returned HTTP ${providerResponse.status}.`);
    return res.status(502).json({ error: 'The conversational AI provider could not answer. Please try again.' });
  }

  let payload;
  try {
    payload = await providerResponse.json();
  } catch {
    return res.status(502).json({ error: 'The conversational AI provider returned an invalid response.' });
  }

  const answer = payload?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) {
    return res.status(502).json({ error: 'The conversational AI provider returned an empty reply. Please try again.' });
  }

  return res.json({ response: answer.trim().slice(0, 1000), aiStatus: 'used' });
}
