const SERVICE_NAME = "danmu-fish-audio-gateway-test";
const MAX_TEXT_LENGTH = 10000;
const MAX_JSON_BYTES = 128 * 1024;
const ALLOWED_FORMATS = ["wav", "pcm", "mp3", "opus"];
const ALLOWED_LATENCIES = ["normal", "balanced", "low"];
const CONTENT_TYPES = {
  wav: "audio/wav",
  pcm: "audio/pcm",
  mp3: "audio/mpeg",
  opus: "audio/ogg"
};

function commonHeaders() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function jsonResponse(payload, status) {
  const headers = commonHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { status, headers });
}

function errorResponse(status, message, code, type) {
  const payload = { success: false, message };
  if (code) payload.code = code;
  if (type) payload.type = type;
  return jsonResponse(payload, status);
}

async function readRequestJson(request) {
  const length = request.headers.get("Content-Length");
  if (length && Number(length) > MAX_JSON_BYTES) {
    throw new RangeError("请求体过大");
  }
  if (!request.body) {
    return {};
  }
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_JSON_BYTES) {
        throw new RangeError("请求体过大");
      }
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function readLimitedText(response, limit) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < limit) {
      const part = await reader.read();
      if (part.done) break;
      const remaining = limit - total;
      const chunk = part.value.byteLength > remaining
        ? part.value.slice(0, remaining)
        : part.value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < part.value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes).trim();
}

function readRequestId(request) {
  const raw = request.headers.get("X-Danmu-Request-Id") || "missing";
  const safe = raw.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 96);
  return safe || "invalid";
}

function recordTtsLog(requestId, upstreamStatus, audioBytes, startedAt) {
  console.log(JSON.stringify({
    event: "tts_gateway",
    requestId,
    route: "/laplace/tts-fishaudio",
    method: "POST",
    upstreamStatus,
    audioBytes,
    durationMs: Date.now() - startedAt
  }));
}

async function handleTts(request) {
  const startedAt = Date.now();
  const requestId = readRequestId(request);
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "Content-Type 必须是 application/json");
  }

  let input;
  try {
    input = await readRequestJson(request);
  } catch (error) {
    return errorResponse(
      error instanceof RangeError ? 413 : 400,
      error instanceof RangeError ? error.message : "JSON 请求体无效"
    );
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return errorResponse(422, "请求体必须是 JSON 对象");
  }

  const text = typeof input.text === "string" ? input.text : "";
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!text.trim()) return errorResponse(422, "Text is required");
  if (text.length > MAX_TEXT_LENGTH) {
    return errorResponse(422, "Text must not exceed 10000 characters");
  }
  if (!token) return errorResponse(401, "Fish Audio API key is required");

  const model = typeof input.model === "string" && input.model.trim()
    ? input.model.trim()
    : "s2.1-pro";
  const voice = typeof input.voice === "string" ? input.voice.trim() : "";
  const format = input.format === undefined ? "mp3" : input.format;
  if (!ALLOWED_FORMATS.includes(format)) {
    return errorResponse(422, "format 必须是 wav、pcm、mp3 或 opus");
  }

  const latency = input.latency === undefined ? "normal" : input.latency;
  if (!ALLOWED_LATENCIES.includes(latency)) {
    return errorResponse(422, "latency 必须是 normal、balanced 或 low");
  }

  const chunkLength = input.chunk_length === undefined ? 300 : input.chunk_length;
  if (!Number.isInteger(chunkLength) || chunkLength < 100 || chunkLength > 300) {
    return errorResponse(422, "chunk_length 必须是 100 到 300 之间的整数");
  }
  if (input.references !== undefined) {
    return errorResponse(422, "references 需要 MessagePack，本 JSON 网关暂不支持");
  }

  const body = {
    text,
    chunk_length: chunkLength,
    format,
    normalize: typeof input.normalize === "boolean" ? input.normalize : true,
    latency
  };
  if (voice) body.reference_id = voice;

  if (input.prosody !== undefined) {
    const prosody = input.prosody;
    const speed = prosody && typeof prosody === "object" ? prosody.speed : undefined;
    const volume = prosody && typeof prosody === "object" ? prosody.volume : undefined;
    const normalizeLoudness = prosody && typeof prosody === "object"
      ? prosody.normalize_loudness
      : undefined;
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
      return errorResponse(422, "prosody.speed 必须是 0.5 到 2 之间的数字");
    }
    if (!Number.isFinite(volume) || volume < -96 || volume > 0) {
      return errorResponse(422, "prosody.volume 必须是 -96 到 0 之间的数字");
    }
    if (normalizeLoudness !== true && normalizeLoudness !== false) {
      return errorResponse(422, "prosody.normalize_loudness 必须是布尔值");
    }
    body.prosody = {
      speed,
      volume,
      normalize_loudness: normalizeLoudness
    };
  }

  if (format === "wav" || format === "pcm") {
    const sampleRate = String(input.sample_rate === undefined ? "44100" : input.sample_rate);
    if (!["8000", "16000", "24000", "32000", "44100"].includes(sampleRate)) {
      return errorResponse(422, "sample_rate 无效");
    }
    body.sample_rate = Number(sampleRate);
  } else if (format === "mp3") {
    const bitrate = String(input.mp3_bitrate === undefined ? "128" : input.mp3_bitrate);
    if (!["64", "128", "192"].includes(bitrate)) {
      return errorResponse(422, "mp3_bitrate 无效");
    }
    body.mp3_bitrate = Number(bitrate);
  } else if (format === "opus") {
    const bitrate = String(input.opus_bitrate === undefined ? "-1000" : input.opus_bitrate);
    if (!["-1000", "24000", "32000", "48000", "64000"].includes(bitrate)) {
      return errorResponse(422, "opus_bitrate 无效");
    }
    body.opus_bitrate = Number(bitrate);
  }

  let upstream;
  try {
    upstream = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      signal: request.signal,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        model
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    recordTtsLog(requestId, 0, 0, startedAt);
    return errorResponse(502, "Fish Audio 请求失败");
  }

  if (!upstream.ok) {
    recordTtsLog(requestId, upstream.status, 0, startedAt);
    const raw = await readLimitedText(upstream, 32768);
    let detail = "";
    let code = "";
    let type = "";
    try {
      const parsed = JSON.parse(raw);
      detail = typeof parsed.message === "string"
        ? parsed.message
        : (typeof parsed.detail === "string" ? parsed.detail : "");
      code = typeof parsed.code === "string" ? parsed.code : "";
      type = typeof parsed.type === "string" ? parsed.type : "";
    } catch (error) {
      detail = "";
    }
    const message = detail || ("Fish Audio HTTP " + upstream.status);
    const status = upstream.status >= 400 && upstream.status <= 599
      ? upstream.status
      : 502;
    return errorResponse(status, message, code, type);
  }

  const audio = await upstream.arrayBuffer();
  recordTtsLog(requestId, upstream.status, audio.byteLength, startedAt);

  const headers = commonHeaders();
  const upstreamType = upstream.headers.get("Content-Type") || "";
  headers.set(
    "Content-Type",
    upstreamType.toLowerCase().startsWith("audio/")
      ? upstreamType
      : CONTENT_TYPES[format]
  );
  return new Response(audio, { status: 200, headers });
}

async function handle(request) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: commonHeaders() });
  }
  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true, service: SERVICE_NAME }, 200);
  }
  if (request.method !== "POST" || url.pathname !== "/laplace/tts-fishaudio") {
    return errorResponse(404, "Not Found");
  }
  return handleTts(request);
}

export default {
  async fetch(request) {
    return handle(request);
  }
};
