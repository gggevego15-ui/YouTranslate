(() => {
  if (window.__youTranslateLoaded) return;
  window.__youTranslateLoaded = true;

  const DEFAULTS = { targetLanguage: "ru", rate: 1.1, volume: 0.9, duckOriginal: false };
  let settings = { ...DEFAULTS };
  let enabled = false;
  let captions = [];
  let lastIndex = -1;
  let utterance = null;
  let activeVideo = null;
  let poll = null;
  let previousVideoTime = null;
  let previousWallTime = null;
  let speechCaptionIndex = -1;
  let speechGeneration = 0;
  let speechQueue = [];
  let speechBusy = false;
  let speechWatchdog = null;
  let asrRunning = false;
  let asrRecorder = null;
  let asrStream = null;
  let asrVideo = null;
  let panel = null;
  let statusEl = null;
  let button = null;
  let loadToken = 0;
  let syncVideoId = "";

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
      <small class="ytx-note">Если субтитров нет, пробуем локально распознать звук Whisper. Модель скачивается при первом запуске; аудио обрабатывается в браузере.</small>`;
    const style = document.createElement("style");
    style.textContent = `
      #youtranslate-panel{animation:ytx-in .38s cubic-bezier(.2,.8,.2,1),ytx-glow 6s ease-in-out infinite;position:fixed;z-index:2147483647;right:22px;bottom:90px;width:278px;padding:17px;border:1px solid #ffffff40;border-radius:24px;background:linear-gradient(145deg,rgba(36,38,53,.82),rgba(15,17,27,.78));backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);box-shadow:0 22px 65px #0008,inset 0 1px #ffffff1c;color:#f7f7fb;font:13px/1.45 system-ui,-apple-system,sans-serif}
      @keyframes ytx-in{from{opacity:0;transform:translateY(14px) scale(.97);filter:blur(8px)}to{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}@keyframes ytx-glow{0%,100%{box-shadow:0 18px 55px #0007,0 0 0 #8b5cf600}50%{box-shadow:0 20px 58px #0008,0 0 28px #8b5cf625}}@keyframes ytx-shimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}#youtranslate-panel *{box-sizing:border-box}#youtranslate-panel .ytx-head{display:flex;align-items:center;gap:10px;margin-bottom:16px}#youtranslate-panel .ytx-logo{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);font-size:21px}#youtranslate-panel .ytx-head div{display:grid;gap:2px;flex:1}#youtranslate-panel .ytx-head b{font-size:15px}#youtranslate-panel .ytx-head small,#youtranslate-panel .ytx-note{color:#a8aab8}#youtranslate-panel .ytx-close{border:0;background:#ffffff12;color:#fff;border-radius:9px;font-size:21px;width:30px;height:30px;cursor:pointer}
      #youtranslate-panel .ytx-label,#youtranslate-panel .ytx-volume label{display:block;color:#c9cbd5;margin:10px 0 6px}#youtranslate-panel select{width:100%;padding:10px;border:1px solid #ffffff24;border-radius:11px;background:#2b2d38;color:white;outline:none}#youtranslate-panel .ytx-main{position:relative;overflow:hidden;width:100%;margin:13px 0 2px;padding:11px;border:1px solid #ffffff30;border-radius:13px;background:linear-gradient(110deg,#8b5cf6,#5579ff,#a855f7,#8b5cf6);background-size:220% 100%;color:white;font-weight:700;cursor:pointer;transition:transform .22s,filter .22s,box-shadow .22s;box-shadow:inset 0 1px #ffffff35,0 7px 22px #6652e633}#youtranslate-panel .ytx-main:hover{filter:brightness(1.12);transform:translateY(-2px);box-shadow:inset 0 1px #ffffff45,0 10px 28px #6652e655}#youtranslate-panel .ytx-main:active{transform:scale(.98)}#youtranslate-panel .ytx-main:disabled{opacity:.8;cursor:wait}#youtranslate-panel .ytx-main.ytx-loading{animation:ytx-shimmer 1.5s linear infinite}#youtranslate-panel .ytx-volume input{width:100%;accent-color:#9b8cff}#youtranslate-panel .ytx-status{padding:9px 10px;border-radius:10px;background:#ffffff0c;color:#d8d6ff;margin:10px 0}#youtranslate-panel .ytx-note{display:block;font-size:10px;line-height:1.45}
      #youtranslate-fab{animation:ytx-in .45s cubic-bezier(.2,.8,.2,1);position:fixed;z-index:2147483646;right:22px;bottom:22px;border:1px solid #ffffff50;border-radius:999px;padding:10px 15px;background:linear-gradient(145deg,rgba(50,52,70,.83),rgba(20,22,34,.78));backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);box-shadow:0 12px 35px #0007,inset 0 1px #ffffff24;color:#fff;font:650 13px system-ui;cursor:pointer;display:flex;align-items:center;gap:8px;transition:transform .25s,box-shadow .25s,border-color .25s}#youtranslate-fab:hover{transform:translateY(-2px) scale(1.02)}#youtranslate-fab span{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#3b82f6)}
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
      if (enabled) {
        cancelCurrentSpeech();
        await loadCaptions();
        lastIndex = -1;
      }
    };
    volume.oninput = async () => {
      settings.volume = Number(volume.value);
      await browser.storage.local.set({ volume: settings.volume });
    };
    button.onclick = async () => {
      if (enabled) { stopSpeaking(); return; }
      button.disabled = true;
      button.classList.add("ytx-loading");
      setStatus("Запускаю перевод…");
      try { await startSpeaking(); }
      catch (error) {
        console.error("[YouTranslate] start failed", error);
        enabled = false;
        button.textContent = "▶ Включить озвучку";
        setStatus(error?.message || "Не удалось запустить озвучку. Обнови страницу и попробуй снова.");
      } finally {
        button.disabled = false;
        button.classList.remove("ytx-loading");
      }
    };
    const fab = document.createElement("button");
    fab.id = "youtranslate-fab";
    fab.innerHTML = "<span>文</span> Перевод голоса";
    fab.onclick = () => { panel.hidden = !panel.hidden; };
    document.documentElement.append(fab);
  }

  function currentVideoId() {
    const url = new URL(location.href);
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || "";
    if (url.pathname.startsWith("/live/")) return url.pathname.split("/")[2] || "";
    return url.searchParams.get("v") || "";
  }

  function playerResponse() {
    try {
      // YouTube is a single-page app: after navigation the old initial response
      // can remain briefly available. Prefer the active player and reject a
      // response whose video ID doesn't match the URL currently being watched.
      const pageWindow = window.wrappedJSObject || window;
      const player = document.getElementById("movie_player");
      const pagePlayer = player?.wrappedJSObject || player;
      const candidates = [];
      try { candidates.push(pagePlayer?.getPlayerResponse?.()); } catch (_) {}
      try { candidates.push(pageWindow.ytInitialPlayerResponse); } catch (_) {}
      try {
        const raw = pageWindow.ytplayer?.config?.args?.player_response;
        if (raw) candidates.push(typeof raw === "string" ? JSON.parse(raw) : raw);
      } catch (_) {}

      const expectedId = currentVideoId();
      const valid = candidates.filter(item =>
        item?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length
      );
      if (expectedId) {
        const matching = valid.find(item => item.videoDetails?.videoId === expectedId);
        if (matching) return matching;
        // A stale response is worse than no response: never load captions from
        // the previous video just because its player data is still on the page.
        return null;
      }
      return valid[0] || null;
    } catch (error) {
      console.debug("[YouTranslate] player response is not available yet", error);
      return null;
    }
  }

  async function waitForPlayerResponse(timeoutMs = 9000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const response = playerResponse();
      if (response?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length) return response;
      await wait(150);
    }
    return playerResponse();
  }

  async function loadCaptions() {
    const token = ++loadToken;
    captions = [];
    lastIndex = -1;
    const requestedVideoId = currentVideoId();
    const response = await waitForPlayerResponse();
    if (token !== loadToken) return false;
    if (requestedVideoId && response?.videoDetails?.videoId !== requestedVideoId) {
      setStatus("Не удалось получить субтитры именно этого видео. Попробуй ещё раз через пару секунд.");
      return false;
    }
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks?.length) {
      setStatus("Субтитров нет. Пробую локально распознать аудио через Whisper…");
      return "missing";
    }
    // Prefer captions in the requested language, including YouTube auto-generated (ASR) tracks.
    // If that language is unavailable, prefer any ASR track before falling back to English.
    const chosen = tracks.find(t => t.languageCode === settings.targetLanguage && t.kind === "asr")
      || tracks.find(t => t.languageCode === settings.targetLanguage)
      || tracks.find(t => t.kind === "asr")
      || tracks.find(t => t.languageCode === "en")
      || tracks[0];
    setStatus("Загружаю субтитры…");
    try {
      const url = new URL(chosen.baseUrl);
      url.searchParams.set("fmt", "json3");
      // Fetch caption tracks from the extension background context. A content-script
      // fetch can be blocked by YouTube CORS even when the track is available.
      const result = await browser.runtime.sendMessage({
        type: "youtranslate:captions",
        url: url.toString(),
        videoId: requestedVideoId
      });
      if (!result?.ok) throw new Error(result?.error || "Не удалось загрузить субтитры");
      const data = result.data;
      if (token !== loadToken) return false;
      captions = (data.events || []).filter(e => e.segs?.length && Number.isFinite(e.tStartMs))
        .map(e => ({ start: e.tStartMs / 1000, duration: (e.dDurationMs || 1800) / 1000,
          text: e.segs.map(s => s.utf8 || "").join("").replace(/\s+/g, " ").trim(), translated: "", sourceLanguage: chosen.languageCode }))
        .filter(c => c.text && !/^\[.*\]$/.test(c.text));
      if (!captions.length) throw new Error("Нет текстовых реплик");
      const trackKind = chosen.kind === "asr" ? "автоматическое распознавание YouTube" : "субтитры YouTube";
      setStatus(`Загружено (${trackKind}): ${captions.length} реплик. Перевожу…`);
      // Translate only the current caption and a short look-ahead window.
      // This lets speech begin quickly instead of waiting for the whole video.
      if (token !== loadToken) return false;
      setStatus(`Субтитры готовы: ${captions.length} реплик. Запускаю озвучку…`);
      return true;
    } catch (e) {
      console.warn("[YouTranslate] captions error", e);
      setStatus("Не удалось получить субтитры. Попробуй другое видео с субтитрами.");
      return false;
    }
  }

  async function translate(text, source) {
    if (!text) return "";
    const result = await browser.runtime.sendMessage({
      type: "youtranslate:translate",
      text,
      source: source || "auto",
      target: settings.targetLanguage
    });
    if (!result?.ok) throw new Error(result?.error || "Translation request failed");
    return result.text || text;
  }

  async function ensureTranslations(index) {
    const token = loadToken;
    const end = Math.min(captions.length, index + 6);
    const work = [];
    for (let i = Math.max(0, index); i < end; i++) {
      const caption = captions[i];
      if (caption.translated) continue;
      if (!caption.translationPromise) {
        caption.translationPromise = translate(caption.text, caption.sourceLanguage || "auto")
          .then(text => { caption.translated = text || caption.text; })
          .catch(() => { caption.translated = caption.text; })
          .finally(() => { delete caption.translationPromise; });
      }
      work.push(caption.translationPromise);
    }
    await Promise.all(work);
    if (token !== loadToken || !enabled) return;
    const ready = captions.slice(index, end).filter(c => c.translated).length;
    setStatus(`Озвучка активна · переведено заранее: ${ready} реплик`);
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

  function cancelCurrentSpeech(resetCaption = true) {
    speechGeneration++;
    speechQueue = [];
    speechBusy = false;
    if (speechWatchdog) clearTimeout(speechWatchdog);
    speechWatchdog = null;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    utterance = null;
    if (resetCaption) speechCaptionIndex = -1;
  }

  function makeUtterance(item, generation) {
    const speech = new SpeechSynthesisUtterance(item.text);
    speech.lang = settings.targetLanguage;
    speech.volume = Math.max(0, Math.min(1, settings.volume));

    // Fit the translated line to its remaining caption window, without extreme acceleration.
    const remaining = Math.max(0.8, item.end - (activeVideo?.currentTime || item.start));
    const estimatedSeconds = Math.max(0.8, item.text.length / 14);
    const fitRate = estimatedSeconds / remaining;
    speech.rate = Math.max(0.9, Math.min(2.0, settings.rate * fitRate));

    const voices = speechSynthesis.getVoices();
    const languageBase = settings.targetLanguage.split("-")[0].toLowerCase();
    const voice = voices.find(v => v.lang.toLowerCase() === settings.targetLanguage.toLowerCase())
      || voices.find(v => v.lang.toLowerCase().startsWith(languageBase));
    if (voice) speech.voice = voice;
    speech.onend = () => {
      if (generation !== speechGeneration) return;
      if (speechWatchdog) clearTimeout(speechWatchdog);
      speechWatchdog = null;
      utterance = null;
      speechBusy = false;
      playNextSpeech();
    };
    speech.onerror = event => {
      if (generation !== speechGeneration) return;
      if (speechWatchdog) clearTimeout(speechWatchdog);
      speechWatchdog = null;
      utterance = null;
      speechBusy = false;
      const code = event?.error || "unknown";
      if (!["canceled", "interrupted"].includes(code)) {
        if (code === "not-allowed" || code === "permission-denied") {
          setStatus("Firefox заблокировал запуск голоса. Перезагрузи вкладку YouTube, нажми «Включить озвучку» вручную и проверь, что звук сайта не заблокирован.");
        } else {
          setStatus(`Ошибка системной озвучки (${code}). Проверь голос и звук Firefox.`);
        }
        console.warn("[YouTranslate] speech synthesis error", code);
      }
      playNextSpeech();
    };
    return speech;
  }

  function playNextSpeech() {
    if (!enabled || speechBusy || !speechQueue.length || !("speechSynthesis" in window)) return;
    const item = speechQueue.shift();
    // Discard stale queued lines after buffering, but never interrupt a line already speaking.
    if (activeVideo && activeVideo.currentTime > item.end + 1.25) {
      playNextSpeech();
      return;
    }
    speechBusy = true;
    const generation = speechGeneration;
    utterance = makeUtterance(item, generation);
    try {
      speechSynthesis.speak(utterance);
      // Some browser/OS speech engines can silently stall. Release the queue and
      // expose the failure instead of leaving the extension stuck in "speaking".
      const timeoutMs = Math.min(90000, Math.max(20000, item.text.length * 260));
      speechWatchdog = setTimeout(() => {
        if (generation !== speechGeneration || !speechBusy) return;
        console.warn("[YouTranslate] speech synthesis watchdog fired");
        speechGeneration++;
        speechWatchdog = null;
        utterance = null;
        speechBusy = false;
        speechSynthesis.cancel();
        setStatus("Системная озвучка зависла. Проверь голос в Firefox/Windows и нажми запуск ещё раз.");
      }, timeoutMs);
    } catch (error) {
      if (speechWatchdog) clearTimeout(speechWatchdog);
      speechWatchdog = null;
      utterance = null;
      speechBusy = false;
      setStatus("Firefox не смог запустить системную озвучку. Проверь доступные голоса и звук.");
      console.error("[YouTranslate] speechSynthesis.speak failed", error);
    }
  }

  function speakCaption(index) {
    const c = captions[index];
    if (!c || !c.translated || !("speechSynthesis" in window)) return;
    speechCaptionIndex = index;
    const item = {
      index,
      text: c.translated,
      start: c.start,
      end: c.start + c.duration
    };

    // Web Speech is sequential. Keep a short bounded queue so captions are not cut off
    // when the next subtitle appears; merge overflow into the final queued line.
    if (speechQueue.length < 3) {
      speechQueue.push(item);
    } else {
      const tail = speechQueue[speechQueue.length - 1];
      tail.text = (tail.text + " " + item.text).trim();
      tail.end = Math.max(tail.end, item.end);
    }
    playNextSpeech();
  }

  function startSyncLoop() {
    if (poll) clearInterval(poll);
    previousVideoTime = null;
    previousWallTime = null;
    syncVideoId = currentVideoId();
    poll = setInterval(() => {
      if (!enabled) return;
      const video = document.querySelector("video");
      if (!video) return;

      // Shorts can replace the displayed clip while reusing the same <video>
      // element, so element identity alone is not enough to detect navigation.
      const visibleVideoId = currentVideoId();
      if (visibleVideoId && visibleVideoId !== syncVideoId) {
        syncVideoId = visibleVideoId;
        captions = [];
        lastIndex = -1;
        previousVideoTime = null;
        previousWallTime = null;
        cancelCurrentSpeech();
        const token = loadToken + 1;
        loadCaptions().then(result => {
          if (!enabled || currentVideoId() !== visibleVideoId || token !== loadToken) return;
          if (result === "missing") startLocalASR(video);
        }).catch(error => {
          console.warn("[YouTranslate] subtitle reload after navigation failed", error);
          setStatus("Не удалось загрузить субтитры нового Shorts. Попробуй ещё раз.");
        });
        setStatus("Обнаружен новый Shorts — загружаю его субтитры…");
        return;
      }

      if (video !== activeVideo) {
        activeVideo = video;
        previousVideoTime = null;
        previousWallTime = null;
        lastIndex = -1;
        cancelCurrentSpeech();
        loadCaptions();
        return;
      }

      const now = performance.now();
      const currentTime = video.currentTime;
      const wallDelta = previousWallTime == null ? 0 : (now - previousWallTime) / 1000;
      const mediaDelta = previousVideoTime == null ? 0 : currentTime - previousVideoTime;
      const jumped = previousVideoTime != null &&
        (mediaDelta < -0.35 || mediaDelta > Math.max(1.25, wallDelta * 2.8));

      previousVideoTime = currentTime;
      previousWallTime = now;

      if (jumped) {
        lastIndex = -1;
        cancelCurrentSpeech();
      }

      if (video.paused || video.ended || document.hidden) {
        if (speechSynthesis.speaking && !speechSynthesis.paused) speechSynthesis.pause();
        if (video.ended) {
          cancelCurrentSpeech();
          lastIndex = -1;
        }
        return;
      }
      if (speechSynthesis.paused) speechSynthesis.resume();

      const index = currentCaptionIndex(currentTime);
      if (index !== lastIndex) {
        lastIndex = index;
        if (index >= 0) {
          // Skip a line if playback has already passed most of its display window.
          const caption = captions[index];
          const lateness = currentTime - caption.start;
          if (lateness <= Math.max(0.9, caption.duration * 0.65)) {
            if (caption.translated) speakCaption(index);
            else ensureTranslations(index).then(() => {
              if (enabled && lastIndex === index && currentCaptionIndex(activeVideo?.currentTime || 0) === index) speakCaption(index);
            });
          }
        }
      }
    }, 100);
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function captureAudioChunk(stream, durationMs = 6500) {
    const audioOnly = new MediaStream(stream.getAudioTracks());
    const preferred = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
    const mimeType = preferred.find(type => MediaRecorder.isTypeSupported(type));
    const recorder = mimeType ? new MediaRecorder(audioOnly, { mimeType }) : new MediaRecorder(audioOnly);
    asrRecorder = recorder;
    const chunks = [];
    const stopped = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => reject(new Error("Firefox не смог записать звук видео."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    });
    recorder.start();
    // Stop promptly when the user disables translation instead of leaving the
    // recorder loop asleep for the full chunk duration.
    const deadline = Date.now() + durationMs;
    while (Date.now() < deadline && enabled && asrRunning && recorder.state !== "inactive") {
      await wait(Math.min(150, deadline - Date.now()));
    }
    const wasCancelled = !enabled || !asrRunning;
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await stopped;
    if (asrRecorder === recorder) asrRecorder = null;
    if (wasCancelled) throw new Error("Распознавание остановлено.");
    if (!blob.size) throw new Error("Не удалось получить аудиоданные из видеоплеера.");
    return blob;
  }

  async function blobToMono16k(blob) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("В этом Firefox недоступна обработка аудио.");
    const context = new AudioContextClass();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const length = Math.floor(decoded.length * 16000 / decoded.sampleRate);
      if (length < 16000) throw new Error("Слишком короткий аудиофрагмент.");
      const mono = new Float32Array(length);
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
      const ratio = decoded.sampleRate / 16000;
      for (let i = 0; i < length; i++) {
        const position = i * ratio;
        const left = Math.floor(position);
        const right = Math.min(left + 1, decoded.length - 1);
        const fraction = position - left;
        let sample = 0;
        for (const channel of channels) sample += channel[left] * (1 - fraction) + channel[right] * fraction;
        mono[i] = sample / channels.length;
      }
      return mono;
    } finally {
      await context.close().catch(() => {});
    }
  }

  function speakLocalText(text) {
    return new Promise(resolve => {
      if (!text || !("speechSynthesis" in window) || !enabled) return resolve();
      speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = settings.targetLanguage;
      speech.volume = Math.max(0, Math.min(1, settings.volume));
      speech.rate = settings.rate || 1;
      const base = settings.targetLanguage.split("-")[0].toLowerCase();
      const voices = speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang.toLowerCase() === settings.targetLanguage.toLowerCase())
        || voices.find(v => v.lang.toLowerCase().startsWith(base));
      if (voice) speech.voice = voice;
      speech.onend = () => resolve();
      speech.onerror = () => resolve();
      speechSynthesis.speak(speech);
    });
  }

  async function startLocalASR(video) {
    if (!video) {
      enabled = false;
      if (button) button.textContent = "▶ Включить озвучку";
      setStatus("Видеоплеер не найден.");
      return;
    }
    asrVideo = video;
    asrRunning = true;
    setStatus("Субтитров нет. Загружаю локальную модель Whisper…");
    try {
      const moduleUrl = browser.runtime.getURL("asr-engine.js");
      const asrModule = await import(moduleUrl);
      if (!enabled || !asrRunning) return;
      // Firefox exposes both captureStream() and the legacy mozCaptureStream().
      // Try each independently: on some Firefox/media combinations the first
      // entry point can throw "Permission denied to access object" while the
      // legacy entry point may still return a stream.
      const captureMethods = [
        ["captureStream", video.captureStream],
        ["mozCaptureStream", video.mozCaptureStream]
      ].filter(([, method], index, all) => typeof method === "function"
        && all.findIndex(([name]) => name === (method === video.captureStream ? "captureStream" : "mozCaptureStream")) === index);
      if (!captureMethods.length) throw new Error("Эта версия Firefox не поддерживает захват аудио из видеоплеера.");
      let captureError = null;
      for (const [methodName, capture] of captureMethods) {
        try {
          const stream = capture.call(video);
          if (stream?.getAudioTracks().length) {
            asrStream = stream;
            break;
          }
          captureError = new Error(methodName + " не вернул аудиодорожку.");
          stream?.getTracks().forEach(track => track.stop());
        } catch (error) {
          captureError = error;
          console.warn("[YouTranslate] " + methodName + " failed", error);
        }
      }
      if (!asrStream) {
        const detail = String(captureError?.message || captureError || "неизвестная ошибка");
        throw new Error("Firefox не разрешил захват аудио из видеоплеера (" + detail + "). Для этого видео используй субтитры YouTube; локальный Whisper не может прочитать звук, пока браузер блокирует захват.");
      }
      setStatus("Модуль распознавания готов. Подготавливаю модель Whisper…");

      while (enabled && asrRunning && !video.ended) {
        if (video.paused || document.hidden) {
          await wait(250);
          continue;
        }

        let blob;
        try {
          blob = await captureAudioChunk(asrStream, 6500);
        } catch (error) {
          if (!enabled || !asrRunning) break;
          throw error;
        }
        if (!enabled || !asrRunning) break;
        video.pause();

        try {
          const audio = await blobToMono16k(blob);
          setStatus("Распознаю речь локально…");
          const transcript = await asrModule.transcribeAudio(audio, percent => {
            setStatus(percent >= 100 ? "Модель загружена. Распознаю речь…" : `Загрузка модели Whisper: ${percent}%`);
          });
          if (transcript && enabled && asrRunning) {
            setStatus("Перевожу распознанную речь…");
            const translated = await translate(transcript, "auto");
            if (translated && enabled && asrRunning) {
              setStatus("Озвучиваю перевод…");
              await speakLocalText(translated);
            }
          } else if (enabled && asrRunning) {
            setStatus("Речь не распознана в этом фрагменте. Продолжаю…");
          }
        } catch (error) {
          console.warn("[YouTranslate] local ASR segment failed", error);
          setStatus("Не удалось распознать фрагмент. Продолжаю со следующим…");
        }

        if (enabled && asrRunning && !video.ended) {
          try { await video.play(); } catch (_) {
            setStatus("Нажми воспроизведение видео, чтобы продолжить распознавание.");
            break;
          }
          await wait(150);
        }
      }
    } catch (error) {
      console.warn("[YouTranslate] local ASR unavailable", error);
      if (enabled) {
        enabled = false;
        if (button) button.textContent = "▶ Включить озвучку";
        const detail = String(error?.message || "");
        const name = String(error?.name || "");
        if (/permission denied|notallowederror|not allowed/i.test(detail) || name === "NotAllowedError" || name === "SecurityError") {
          setStatus("Firefox запретил захват аудио этого видео. Это не разрешение на микрофон: перезагрузи вкладку и попробуй видео с субтитрами YouTube. Защищённые видео могут не поддерживать локальное распознавание.");
        } else {
          setStatus(detail || "Локальное распознавание не удалось запустить.");
        }
      }
    } finally {
      asrRunning = false;
      if (video.ended && enabled) {
        enabled = false;
        if (button) button.textContent = "▶ Включить озвучку";
        setStatus("Видео завершено.");
      }
      if (asrRecorder && asrRecorder.state !== "inactive") {
        try { asrRecorder.stop(); } catch (_) {}
      }
      asrRecorder = null;
      if (asrStream) asrStream.getTracks().forEach(track => track.stop());
      asrStream = null;
      if (asrVideo === video) asrVideo = null;
    }
  }

  async function startSpeaking() {
    if (enabled) return;
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      throw new Error("В этом Firefox недоступна системная озвучка. Обнови Firefox и проверь настройки звука.");
    }
    const videoAtStart = document.querySelector("video");
    if (!videoAtStart) {
      throw new Error("Не найден видеоплеер. Подожди, пока видео YouTube полностью загрузится, и попробуй снова.");
    }
    enabled = true;
    if (button) button.textContent = "Ⅱ Остановить озвучку";
    const ok = await loadCaptions();
    if (!enabled) return;
    activeVideo = document.querySelector("video");
    if (ok === "missing") {
      await startLocalASR(activeVideo);
      return;
    }
    if (!ok) {
      enabled = false;
      if (button) button.textContent = "▶ Включить озвучку";
      return;
    }
    if (!activeVideo) {
      setStatus("Видеоплеер не найден.");
      enabled = false;
      if (button) button.textContent = "▶ Включить озвучку";
      return;
    }
    startSyncLoop();
  }

  function stopSpeaking() {
    enabled = false;
    loadToken++;
    if (poll) clearInterval(poll);
    poll = null;
    previousVideoTime = null;
    previousWallTime = null;
    lastIndex = -1;
    cancelCurrentSpeech();
    asrRunning = false;
    if (asrRecorder && asrRecorder.state !== "inactive") {
      try { asrRecorder.stop(); } catch (_) {}
    }
    if (asrVideo?.paused && !asrVideo.ended) asrVideo.play().catch(() => {});
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