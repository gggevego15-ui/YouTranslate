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
  if (url.protocol !== "https:" || !/(^|\\.)youtube\\.com$/.test(url.hostname)) {
    throw new Error("Недопустимый адрес субтитров YouTube.");
  }
  const response = await fetch(url.toString(), { credentials: "omit" });
  if (!response.ok) throw new Error("YouTube не отдал субтитры (HTTP " + response.status + ").");
  return response.json();
}

async function translateText(text, source, target) {
  if (typeof text !== "string" || !text.trim()) return "";
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", source || "auto");
  url.searchParams.set("tl", target || "ru");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error("Сервис перевода ответил ошибкой HTTP " + response.status);
  const data = await response.json();
  return (data[0] || []).map(part => part[0] || "").join("").trim() || text;
}
