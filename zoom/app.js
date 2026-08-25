// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';

const i18n = {
    guessPlaceholder: { en: "Who's that Pokemon?", fr: 'Qui est ce Pokémon ?' },
    submit: { en: 'Submit', fr: 'Valider' },
    nextPokemon: { en: 'Next Pokemon', fr: 'Pokémon Suivant' },
    dlgLoading: { en: 'Loading Pokemon data...', fr: 'Chargement des données...' },
    dlgErrorLoading: { en: 'Error: could not load the Pokemon database.', fr: 'Erreur : impossible de charger la base de données.' },
    dlgPrompt: { en: "Who's that Pokemon ?", fr: 'Qui est ce Pokémon ?' },
    dlgWrong: { en: 'Wrong! The camera zooms out...', fr: 'Faux ! La caméra dézoome...' },
    dlgCorrect: { en: "Correct! It's {name}!", fr: "Correct ! C'est {name} !" }
};

const START_SCALE = 20;
const MIN_SCALE = 1;
const SCALE_STEP = 4;

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'fr';
let pokemonDatabase = [];
let currentPokemon = null;
let currentScale = START_SCALE;
let isRoundSolved = false;

const spriteImage = document.getElementById('sprite-image');
const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');
const pokemonNamesList = document.getElementById('pokemon-names');
const nextBtn = document.getElementById('next-btn');
const dialogueText = document.getElementById('dialogue-text');
const langToggleBtn = document.getElementById('lang-toggle');

function translate(key) {
    const entry = i18n[key];
    return entry ? entry[currentLang] : key;
}

// The dataset stores full language names (english/french) rather than the
// short 'en'/'fr' codes used by currentLang, so this maps between them.
function getPokemonName(pokemon) {
    return currentLang === 'fr' ? pokemon.names.french : pokemon.names.english;
}

function t(key, params = {}) {
    let text = translate(key);
    Object.keys(params).forEach((paramKey) => {
        text = text.replace(`{${paramKey}}`, params[paramKey]);
    });
    return text;
}

function setDialogue(key, params) {
    dialogueText.textContent = t(key, params);
}

function updateUILanguage() {
    document.documentElement.lang = currentLang;
    langToggleBtn.textContent = currentLang === 'fr' ? 'EN' : 'FR';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = translate(el.getAttribute('data-i18n'));
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        el.placeholder = translate(el.getAttribute('data-i18n-placeholder'));
    });

    if (pokemonDatabase.length > 0) {
        populateNamesDatalist();
    }

    if (currentPokemon) {
        spriteImage.alt = isRoundSolved ? getPokemonName(currentPokemon) : 'Mystery Pokemon';
        if (isRoundSolved) {
            setDialogue('dlgCorrect', { name: getPokemonName(currentPokemon) });
        }
    }
}

function populateNamesDatalist() {
    pokemonNamesList.innerHTML = pokemonDatabase
        .map((pokemon) => `<option value="${getPokemonName(pokemon)}"></option>`)
        .join('');
}

function pickRandomPokemon() {
    const index = Math.floor(Math.random() * pokemonDatabase.length);
    return pokemonDatabase[index];
}

function applyScale(animate = true) {
    if (!animate) {
        spriteImage.style.transition = 'none';
        spriteImage.style.transform = `scale(${currentScale})`;
        // Force a reflow so the transition-less scale is applied immediately,
        // before transitions are re-enabled for the next (zoom-out) change.
        void spriteImage.offsetWidth;
        spriteImage.style.transition = '';
        return;
    }

    spriteImage.style.transform = `scale(${currentScale})`;
}

function startNewRound() {
    currentPokemon = pickRandomPokemon();
    currentScale = START_SCALE;
    isRoundSolved = false;

    spriteImage.src = currentPokemon.media.sprite;
    spriteImage.alt = 'Mystery Pokemon';
    applyScale(false);

    guessInput.value = '';
    guessForm.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    guessInput.focus();

    setDialogue('dlgPrompt');
}

function handleWrongGuess() {
    currentScale = Math.max(MIN_SCALE, currentScale - SCALE_STEP);
    applyScale();
    guessInput.value = '';
    guessInput.focus();
    setDialogue('dlgWrong');
}

function handleCorrectGuess() {
    currentScale = MIN_SCALE;
    isRoundSolved = true;
    applyScale();
    spriteImage.alt = getPokemonName(currentPokemon);

    guessForm.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    setDialogue('dlgCorrect', { name: getPokemonName(currentPokemon) });
}

async function loadPokemonDatabase() {
    try {
        const response = await fetch('../data/pokemon.json');
        pokemonDatabase = await response.json();
        populateNamesDatalist();
        startNewRound();
    } catch (error) {
        console.error('Failed to load Pokemon database:', error);
        setDialogue('dlgErrorLoading');
    }
}

guessForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const guess = guessInput.value.trim().toLowerCase();
    if (!guess || !currentPokemon) return;

    if (guess === getPokemonName(currentPokemon).toLowerCase()) {
        handleCorrectGuess();
    } else {
        handleWrongGuess();
    }
});

nextBtn.addEventListener('click', () => {
    startNewRound();
});

langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'fr' ? 'en' : 'fr';
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    updateUILanguage();
});

updateUILanguage();
loadPokemonDatabase();
