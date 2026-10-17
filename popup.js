const language = document.getElementById("language");
browser.storage.local.get({ targetLanguage: "ru" }).then(s => language.value = s.targetLanguage);
language.addEventListener("change", () => browser.storage.local.set({ targetLanguage: language.value }));
document.getElementById("open").addEventListener("click", () => browser.tabs.create({ url: "https://www.youtube.com/" }));