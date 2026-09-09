// Cliente puro de la API de Anthropic (Messages API) — mismo criterio que
// mercado-pago-client.ts/whatsapp-client.ts/meta-client.ts: una función
// parametrizada por credenciales explícitas, nunca lee variables de
// entorno directamente, para poder mockear `fetch` en los tests sin pegarle
// a la red real (punto 94 del pedido: nunca se inventó un formato — la
// forma del request/response es la documentada por Anthropic para
// POST /v1/messages).
export interface AiCredentials {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class AiRequestError extends Error {}

export async function generateInsights(
  credentials: AiCredentials,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(`${credentials.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': credentials.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: credentials.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AiRequestError(`La API de IA respondió ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((block) => block.type === 'text')?.text;
  if (!text) {
    throw new AiRequestError('La API de IA no devolvió texto en la respuesta.');
  }
  return text;
}
