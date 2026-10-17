browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "youtranslate:captions") {
    return fetchCaptionData(message.url)
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: error?.message || "Не удалось загрузить субтитры" }));
  }
  if (message?.type !== "youtranslate:translate") return undefined;
  return translateText(message.text, message.source, message.target)
    .then(text => ({ ok: true, text }))
    .catch(error => ({ ok: false, error: error?.message || "Translation failed" }));
});

async function fetchCaptionData(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || !/(^|\.)youtube\.com$/.test(url.hostname)) {
    throw new Error("Недопустимый адрес субтитров YouTube.");
  }
  // YouTube can return caption URLs on youtube.com or www.youtube.com.
  // Ask explicitly for JSON3 and preserve the signed URL parameters.
  url.searchParams.set("fmt", "json3");
  const response = await fetch(url.toString(), {
    credentials: "include",
    redirect: "follow",
    cache: "no-store"
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error("YouTube не отдал субтитры (HTTP " + response.status + ").");
  }
  try {
    return JSON.parse(body);
  } catch (_) {
    const contentType = response.headers.get("content-type") || "неизвестный тип";
    throw new Error("YouTube вернул не JSON субтитров (" + contentType + ").");
  }
}

const translationCache = new Map();
const translationInFlight = new Map();

async function translateText(text, source, target) {
  if (typeof text !== "string" || !text.trim()) return "";
  const normalized = text.trim();
  const cacheKey = JSON.stringify([source || "auto", target || "ru", normalized]);
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
  if (translationInFlight.has(cacheKey)) return translationInFlight.get(cacheKey);
  const request = (async () => {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source || "auto");
  url.searchParams.set("tl", target || "ru");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error("Сервис перевода ответил ошибкой HTTP " + response.status);
  const data = await response.json();
  const translated = (data[0] || []).map(part => part[0] || "").join("").trim() || text;
  translationCache.set(cacheKey, translated);
  if (translationCache.size > 2000) translationCache.delete(translationCache.keys().next().value);
  return translated;
  })();
  translationInFlight.set(cacheKey, request);
  try { return await request; }
  finally { translationInFlight.delete(cacheKey); }
}
