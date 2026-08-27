// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'fr';

const langToggleBtn = document.getElementById('lang-toggle');

function translate(key) {
    const entry = i18n[key];
    return entry ? entry[currentLang] : key;
}

function updateUILanguage() {
    document.documentElement.lang = currentLang;
    langToggleBtn.textContent = currentLang === 'fr' ? 'EN' : 'FR';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = translate(el.getAttribute('data-i18n'));
    });
}

langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'fr' ? 'en' : 'fr';
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    updateUILanguage();
});

updateUILanguage();
