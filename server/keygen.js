// Server-only MindDo key lookup. Never import this file into browser code.

let cached = null;

class KeygenError extends Error {
  constructor(message, fix, cause) {
    super(message);
    this.name = "KeygenError";
    this.error = { message, fix };
    this.cause = cause;
  }
}

function readConfig() {
  const url = process.env.KEYGEN_URL;
  const token = process.env.KEYGEN_TOKEN;

  if (!url || !token || url === "paste-here" || token === "paste-here") {
    throw new KeygenError(
      "The AI key service is not configured.",
      "Put your MindDo URL and token in the server .env file."
    );
  }

  return { url: url.replace(/\/$/, ""), token };
}

function isUsable(entry) {
  return entry && entry.apiKey && Number.isFinite(entry.expiresAtMs) && Date.now() < entry.expiresAtMs;
}

/**
 * Get the current AI key. Server code only.
 * Pass forceRefresh after OpenAI reports that the current key is invalid.
 */
async function getKey({ forceRefresh = false } = {}) {
  if (!forceRefresh && isUsable(cached)) return cached.apiKey;
  if (forceRefresh) cached = null;

  const { url, token } = readConfig();
  let response;
  let data;

  try {
    response = await fetch(`${url}/api/lookup-key`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    data = await response.json();
  } catch (cause) {
    throw new KeygenError(
      "The AI key service could not be reached.",
      "Check the MindDo URL and the server network connection.",
      cause
    );
  }

  if (!response.ok || !data?.apiKey || !data?.expiresAt) {
    throw new KeygenError(
      "The AI key service returned an invalid response.",
      "Check the MindDo URL and token, then try again."
    );
  }

  const expiresAtMs = Date.parse(data.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new KeygenError(
      "The AI key service returned an expired key.",
      "Check the MindDo key service and request a fresh key."
    );
  }

  cached = { apiKey: data.apiKey, expiresAtMs };
  return cached.apiKey;
}

/** Call this after OpenAI says the current key is invalid. */
function invalidateKey() {
  cached = null;
}

/** Show only error.message to users and log error.fix on the server. */
function safeError(error) {
  const detail = error?.error || {
    message: "The AI request failed.",
    fix: "Check the server logs and try again.",
  };
  console.error(detail.fix);
  return { error: { message: detail.message, fix: detail.fix } };
}

module.exports = { getKey, invalidateKey, safeError, KeygenError };
