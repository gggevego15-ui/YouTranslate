browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "youtranslate:translate") return undefined;
  return translateText(message.text, message.source, message.target)
    .then(text => ({ ok: true, text }))
    .catch(error => ({ ok: false, error: error?.message || "Translation failed" }));
});

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
