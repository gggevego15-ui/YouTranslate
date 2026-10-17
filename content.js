(() => {
  if (window.__youTranslateLoaded) return;
  window.__youTranslateLoaded = true;

  const DEFAULTS = { targetLanguage: "ru", rate: 1, volume: 0.9, duckOriginal: false };
  let settings = { ...DEFAULTS };
  let enabled = false;
  let captions = [];
  let lastIndex = -1;
  let utterance = null;
  let activeVideo = null;
  let poll = null;
  let panel = null;
  let statusEl = null;
  let button = null;
  let loadToken = 0;

  const languages = [
    ["ru","Русский"],["en","English"],["es","Español"],["de","Deutsch"],
    ["fr","Français"],["it","Italiano"],["pt","Português"],["pl","Polski"],
    ["tr","Türkçe"],["uk","Українська"],["ja","日本語"],["ko","한국어"],
    ["zh-CN","中文"],["ar","العربية"],["hi","हिन्दी"]
  ];

  browser.storage.local.get(DEFAULTS).then(v => { settings = { ...DEFAULTS, ...v }; });

  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  function makePanel() {
    if (panel) return;
    panel = document.createElement("section");
    panel.id = "youtranslate-panel";
    panel.innerHTML = `
      <div class="ytx-head"><span class="ytx-logo">文</span><div><b>YouTranslate</b><small>Перевод голоса</small></div><button class="ytx-close" title="Свернуть">×</button></div>
      <label class="ytx-label" for="ytx-language">Озвучивать на</label>
      <select id="ytx-language">${languages.map(([v,n])=>`<option value="${v}">${n}</option>`).join("")}</select>
      <button class="ytx-main">▶ Включить озвучку</button>
      <div class="ytx-volume"><label for="ytx-volume">Громкость перевода</label><input id="ytx-volume" type="range" min="0" max="1" step=".05" value=".9"></div>
      <div class="ytx-status" role="status">Готов к запуску</div>
      <small class="ytx-note">Используются доступные субтитры YouTube. Перевод и синтез речи выполняются онлайн/браузером.</small>`;
    const style = document.createElement("style");
    style.textContent = `
      #youtranslate-panel{position:fixed;z-index:2147483647;right:22px;bottom:90px;width:260px;padding:16px;border:1px solid #ffffff38;border-radius:20px;background:rgba(20,22,29,.88);backdrop-filter:blur(24px) saturate(160%);box-shadow:0 18px 55px #0007;color:#f7f7fb;font:13px/1.4 system-ui,-apple-system,sans-serif}
      #youtranslate-panel *{box-sizing:border-box}#youtranslate-panel .ytx-head{display:flex;align-items:center;gap:10px;margin-bottom:16px}#youtranslate-panel .ytx-logo{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);font-size:21px}#youtranslate-panel .ytx-head div{display:grid;gap:2px;flex:1}#youtranslate-panel .ytx-head b{font-size:15px}#youtranslate-panel .ytx-head small,#youtranslate-panel .ytx-note{color:#a8aab8}#youtranslate-panel .ytx-close{border:0;background:#ffffff12;color:#fff;border-radius:9px;font-size:21px;width:30px;height:30px;cursor:pointer}
      #youtranslate-panel .ytx-label,#youtranslate-panel .ytx-volume label{display:block;color:#c9cbd5;margin:10px 0 6px}#youtranslate-panel select{width:100%;padding:10px;border:1px solid #ffffff24;border-radius:11px;background:#2b2d38;color:white;outline:none}#youtranslate-panel .ytx-main{width:100%;margin:13px 0 2px;padding:11px;border:0;border-radius:12px;background:linear-gradient(100deg,#8b5cf6,#4f75ff);color:white;font-weight:650;cursor:pointer;transition:transform .18s,filter .18s}#youtranslate-panel .ytx-main:hover{filter:brightness(1.12);transform:translateY(-1px)}#youtranslate-panel .ytx-volume input{width:100%;accent-color:#9b8cff}#youtranslate-panel .ytx-status{padding:9px 10px;border-radius:10px;background:#ffffff0c;color:#d8d6ff;margin:10px 0}#youtranslate-panel .ytx-note{display:block;font-size:10px;line-height:1.45}
      #youtranslate-fab{position:fixed;z-index:2147483646;right:22px;bottom:22px;border:1px solid #ffffff3d;border-radius:999px;padding:11px 15px;background:rgba(24,25,34,.82);backdrop-filter:blur(18px);box-shadow:0 8px 30px #0006;color:#fff;font:600 13px system-ui;cursor:pointer;display:flex;align-items:center;gap:8px;transition:transform .2s}#youtranslate-fab:hover{transform:translateY(-2px) scale(1.02)}#youtranslate-fab span{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#3b82f6)}
    `;
    document.documentElement.append(style, panel);
    statusEl = panel.querySelector(".ytx-status");
    button = panel.querySelector(".ytx-main");
    const lang = panel.querySelector("#ytx-language");
    const volume = panel.querySelector("#ytx-volume");
    lang.value = settings.targetLanguage;
    volume.value = settings.volume;
    panel.querySelector(".ytx-close").onclick = () => panel.hidden = true;
    lang.onchange = async () => {
      settings.targetLanguage = lang.value;
      await browser.storage.local.set({ targetLanguage: lang.value });
      if (enabled) { await loadCaptions(); }
    };
    volume.oninput = async () => {
      settings.volume = Number(volume.value);
      await browser.storage.local.set({ volume: settings.volume });
    };
    button.onclick = () => enabled ? stopSpeaking() : startSpeaking();
    const fab = document.createElement("button");
    fab.id = "youtranslate-fab";
    fab.innerHTML = "<span>文</span> Перевод голоса";
    fab.onclick = () => { panel.hidden = !panel.hidden; };
    document.documentElement.append(fab);
  }

  function playerResponse() {
    try {
      if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
      const p = document.getElementById("movie_player");
      if (p?.getPlayerResponse) return p.getPlayerResponse();
    } catch (_) {}
    return null;
  }

  async function loadCaptions() {
    const token = ++loadToken;
    captions = [];
    lastIndex = -1;
    const response = playerResponse();
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) {
      setStatus("У этого видео не найдены субтитры. Включи субтитры YouTube и попробуй снова.");
      return false;
    }
    const chosen = tracks.find(t => t.languageCode === settings.targetLanguage)
      || tracks.find(t => t.languageCode === "en")
      || tracks[0];
    setStatus("Загружаю субтитры…");
    try {
      const url = new URL(chosen.baseUrl);
      url.searchParams.set("fmt", "json3");
      const res = await fetch(url.toString(), { credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (token !== loadToken) return false;
      captions = (data.events || []).filter(e => e.segs?.length && Number.isFinite(e.tStartMs))
        .map(e => ({ start: e.tStartMs / 1000, duration: (e.dDurationMs || 1800) / 1000,
          text: e.segs.map(s => s.utf8 || "").join("").replace(/\s+/g, " ").trim(), translated: "" }))
        .filter(c => c.text && !/^\[.*\]$/.test(c.text));
      if (!captions.length) throw new Error("Нет текстовых реплик");
      setStatus(`Субтитры загружены: ${captions.length} реплик. Перевожу…`);
      // Translate in small batches to avoid oversized requests.
      for (let i = 0; i < captions.length; i += 8) {
        if (token !== loadToken) return false;
        const batch = captions.slice(i, i + 8);
        await Promise.all(batch.map(async c => {
          try { c.translated = await translate(c.text, chosen.languageCode); }
          catch (_) { c.translated = c.text; }
        }));
        setStatus(`Перевожу реплики: ${Math.min(i + batch.length, captions.length)} / ${captions.length}`);
      }
      if (token !== loadToken) return false;
      setStatus(`Готово. Язык: ${languages.find(l=>l[0]===settings.targetLanguage)?.[1] || settings.targetLanguage}`);
      return true;
    } catch (e) {
      console.warn("[YouTranslate] captions error", e);
      setStatus("Не удалось получить субтитры. Попробуй другое видео с субтитрами.");
      return false;
    }
  }

  async function translate(text, source) {
    if (!text) return "";
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", source || "auto");
    url.searchParams.set("tl", settings.targetLanguage);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Translation request failed");
    const data = await res.json();
    return (data[0] || []).map(part => part[0] || "").join("").trim() || text;
  }

  function currentCaptionIndex(time) {
    let low = 0, high = captions.length - 1, answer = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (captions[mid].start <= time) { answer = mid; low = mid + 1; }
      else high = mid - 1;
    }
    if (answer >= 0 && time <= captions[answer].start + captions[answer].duration + 0.4) return answer;
    return -1;
  }

  function speakCaption(index) {
    const c = captions[index];
    if (!c || !c.translated || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    utterance = new SpeechSynthesisUtterance(c.translated);
    utterance.lang = settings.targetLanguage;
    utterance.volume = Math.max(0, Math.min(1, settings.volume));
    utterance.rate = settings.rate;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase() === settings.targetLanguage.toLowerCase())
      || voices.find(v => v.lang.toLowerCase().startsWith(settings.targetLanguage.split("-")[0].toLowerCase()));
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
  }

  async function startSpeaking() {
    enabled = true;
    button.textContent = "Ⅱ Остановить озвучку";
    const ok = await loadCaptions();
    if (!ok) { enabled = false; button.textContent = "▶ Включить озвучку"; return; }
    activeVideo = document.querySelector("video");
    if (!activeVideo) { setStatus("Видеоплеер не найден."); enabled = false; return; }
    if (poll) clearInterval(poll);
    poll = setInterval(() => {
      if (!enabled) return;
      const video = document.querySelector("video");
      if (!video) return;
      if (video !== activeVideo) { activeVideo = video; loadCaptions(); return; }
      if (video.paused || video.ended) { speechSynthesis.cancel(); lastIndex = -1; return; }
      const index = currentCaptionIndex(video.currentTime);
      if (index !== lastIndex) {
        lastIndex = index;
        if (index >= 0) speakCaption(index);
        else speechSynthesis.cancel();
      }
    }, 180);
  }

  function stopSpeaking() {
    enabled = false;
    loadToken++;
    if (poll) clearInterval(poll);
    poll = null;
    speechSynthesis.cancel();
    if (button) button.textContent = "▶ Включить озвучку";
    setStatus("Озвучка остановлена.");
  }

  function init() {
    if (!location.pathname.startsWith("/watch") && !location.pathname.startsWith("/shorts/")) return;
    makePanel();
  }
  init();
  const observer = new MutationObserver(() => {
    if (!document.getElementById("youtranslate-fab") && (location.pathname.startsWith("/watch") || location.pathname.startsWith("/shorts/"))) {
      panel = null; statusEl = null; button = null; init();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("yt-navigate-finish", () => { stopSpeaking(); if (panel) { panel.hidden = false; setStatus("Новое видео — можно запускать озвучку."); } });
})();