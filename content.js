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
  let previousVideoTime = null;
  let previousWallTime = null;
  let speechCaptionIndex = -1;
  let speechGeneration = 0;
  let speechQueue = [];
  let speechBusy = false;
  let asrRunning = false;
  let asrRecorder = null;
  let asrStream = null;
  let asrVideo = null;
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
      <small class="ytx-note">Если субтитров нет, пробуем локально распознать звук Whisper. Модель скачивается при первом запуске; аудио обрабатывается в браузере.</small>`;
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
      setStatus("YouTube не предоставил дорожку субтитров. В этой версии нет отдельного ASR-движка для распознавания аудио напрямую.");
      return false;
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
      const res = await fetch(url.toString(), { credentials: "omit" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (token !== loadToken) return false;
      captions = (data.events || []).filter(e => e.segs?.length && Number.isFinite(e.tStartMs))
        .map(e => ({ start: e.tStartMs / 1000, duration: (e.dDurationMs || 1800) / 1000,
          text: e.segs.map(s => s.utf8 || "").join("").replace(/\s+/g, " ").trim(), translated: "" }))
        .filter(c => c.text && !/^\[.*\]$/.test(c.text));
      if (!captions.length) throw new Error("Нет текстовых реплик");
      const trackKind = chosen.kind === "asr" ? "автоматическое распознавание YouTube" : "субтитры YouTube";
      setStatus(`Загружено (${trackKind}): ${captions.length} реплик. Перевожу…`);
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
    const result = await browser.runtime.sendMessage({
      type: "youtranslate:translate",
      text,
      source: source || "auto",
      target: settings.targetLanguage
    });
    if (!result?.ok) throw new Error(result?.error || "Translation request failed");
    return result.text || text;
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
    speech.rate = Math.max(0.9, Math.min(1.8, settings.rate * fitRate));

    const voices = speechSynthesis.getVoices();
    const languageBase = settings.targetLanguage.split("-")[0].toLowerCase();
    const voice = voices.find(v => v.lang.toLowerCase() === settings.targetLanguage.toLowerCase())
      || voices.find(v => v.lang.toLowerCase().startsWith(languageBase));
    if (voice) speech.voice = voice;
    speech.onend = () => {
      if (generation !== speechGeneration) return;
      utterance = null;
      speechBusy = false;
      playNextSpeech();
    };
    speech.onerror = () => {
      if (generation !== speechGeneration) return;
      utterance = null;
      speechBusy = false;
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
    speechSynthesis.speak(utterance);
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
    poll = setInterval(() => {
      if (!enabled) return;
      const video = document.querySelector("video");
      if (!video) return;

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
          if (lateness <= Math.max(0.9, caption.duration * 0.65)) speakCaption(index);
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
    await wait(durationMs);
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await stopped;
    if (asrRecorder === recorder) asrRecorder = null;
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
      const capture = video.captureStream || video.mozCaptureStream;
      if (!capture) throw new Error("Эта версия Firefox не поддерживает захват аудио из видеоплеера.");
      asrStream = capture.call(video);
      if (!asrStream.getAudioTracks().length) throw new Error("Firefox не предоставил аудиодорожку для распознавания.");
      setStatus("Модуль распознавания готов. Подготавливаю модель Whisper…");

      while (enabled && asrRunning && !video.ended) {
        if (video.paused || document.hidden) {
          await wait(250);
          continue;
        }

        const segmentStart = video.currentTime;
        let blob;
        try {
          blob = await captureAudioChunk(asrStream, 6500);
        } catch (error) {
          if (!enabled || !asrRunning) break;
          throw error;
        }
        video.pause();
        if (!enabled || !asrRunning) break;

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
        setStatus(error?.message || "Локальное распознавание не удалось запустить.");
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
    enabled = true;
    if (button) button.textContent = "Ⅱ Остановить озвучку";
    const ok = await loadCaptions();
    if (!enabled) return;
    activeVideo = document.querySelector("video");
    if (!ok) {
      await startLocalASR(activeVideo);
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