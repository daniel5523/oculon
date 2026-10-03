// Função do Supabase: faz a ponte entre o site e a API da Anthropic.
// A chave da API fica só aqui, nos segredos do Supabase, nunca no site.
//
// Segredos usados:
//   ANTHROPIC_API_KEY  (obrigatório) chave da API da Anthropic
//   ACCESS_CODE        (obrigatório) código que o site precisa enviar
//   ALLOWED_ORIGINS    (recomendado) endereços do site, separados por vírgula
//                      ex.: https://seu-usuario.github.io
//   MODEL_QUICK / MODEL_DEFAULT / MODEL_COMPLEX  (opcionais) trocam os modelos

const MODELS: Record<string, string> = {
  quick: Deno.env.get("MODEL_QUICK") ?? "claude-haiku-4-5-20251001",
  default: Deno.env.get("MODEL_DEFAULT") ?? "claude-sonnet-5-5",
  complex: Deno.env.get("MODEL_COMPLEX") ?? "claude-opus-5-5",
};
const MAX_TOKENS: Record<string, number> = { quick: 2048, default: 4096, complex: 8192 };
const MAX_BODY = 200_000;
const MAX_MESSAGES = 60;
const MAX_TOOLS = 5;

// Limite simples por IP (10 minutos). Cada instância da função tem a sua
// própria contagem, então isto reduz abuso mas não substitui o limite de gasto
// que você deve definir na conta da Anthropic.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 40;
}

// Comparação que não vaza, pelo tempo, quantos caracteres estavam certos.
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const originOk = allowed.length === 0 || allowed.includes(origin);
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": allowed.length === 0 ? "*" : origin,
    "Access-Control-Allow-Headers": "content-type, x-access-code",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "content-type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: originOk ? 204 : 403, headers: cors });
  }
  if (!originOk) return json(403, { error: "origem não permitida" });
  if (req.method !== "POST") return json(405, { error: "use POST" });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const code = Deno.env.get("ACCESS_CODE");
  if (!apiKey || !code) {
    return json(500, { error: "Configure os segredos ANTHROPIC_API_KEY e ACCESS_CODE." });
  }
  if (!same(req.headers.get("x-access-code") ?? "", code)) {
    return json(401, { error: "código de acesso inválido" });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (limited(ip)) return json(429, { error: "muitas requisições, espere um pouco" });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "pedido grande demais" });
  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  const tier = typeof body.tier === "string" && Object.prototype.hasOwnProperty.call(MODELS, body.tier)
    ? body.tier
    : "default";
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) {
    return json(400, { error: "messages inválido" });
  }

  const payload: Record<string, unknown> = {
    model: MODELS[tier],
    max_tokens: MAX_TOKENS[tier],
    stream: true,
    messages: body.messages,
  };
  if (typeof body.system === "string") payload.system = body.system.slice(0, 12_000);
  if (Array.isArray(body.tools) && body.tools.length > 0) payload.tools = body.tools.slice(0, MAX_TOOLS);

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json(502, { error: "não consegui falar com a Anthropic" });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...cors,
      "content-type": upstream.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-store",
    },
  });
});
