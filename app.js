// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';

const i18n = {
    portalTitle: { en: 'PokeDraft Portal', fr: 'Portail PokeDraft' },
    portalSubtitle: { en: 'Choose a game to play', fr: 'Choisissez un jeu' },
    playDraft: { en: 'Play PokeDraft', fr: 'Jouer à PokeDraft' },
    playZoom: { en: 'Play PokeZoom', fr: 'Jouer à PokeZoom' },
    playDex: { en: 'Play DexGuess', fr: 'Jouer à DexGuess' }
};

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
