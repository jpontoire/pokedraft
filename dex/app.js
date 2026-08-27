// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';

const i18n = Object.assign({}, sharedI18n, pageI18n);

// Wrong-guess counts at which each hint unlocks, in order.
const HINT_THRESHOLDS = [3, 5, 7];

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'fr';
let pokemonDatabase = [];
let currentPokemon = null;
let wrongGuesses = 0;

const descriptionText = document.getElementById('description-text');
const spriteContainer = document.getElementById('sprite-container');
const spriteImage = document.getElementById('sprite-image');
const hintsContainer = document.getElementById('hints-container');
const hintTypes = document.getElementById('hint-types');
const hintTypesValue = document.getElementById('hint-types-value');
const hintColor = document.getElementById('hint-color');
const hintColorValue = document.getElementById('hint-color-value');
const hintCry = document.getElementById('hint-cry');
const hintCryContent = document.getElementById('hint-cry-content');
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

// The dataset stores full language names (english/french) rather than the
// short 'en'/'fr' codes used by currentLang, so this maps between them.
function getPokemonName(pokemon) {
    return currentLang === 'fr' ? pokemon.names.french : pokemon.names.english;
}

// Same english/french vs en/fr key mismatch as getPokemonName above.
function getDescription(pokemon) {
    return currentLang === 'fr' ? pokemon.description.french : pokemon.description.english;
}

function buildTypeBadgesHTML(types) {
    return types.map((type) => `<span class="type-badge type-${type}">${translate(type)}</span>`).join(' ');
}

function isRoundSolved() {
    return !spriteContainer.classList.contains('hidden');
}

function buildCryHintHTML(pokemon) {
    if (!pokemon.media.cry) {
        return `<button type="button" class="pixel-btn small-btn play-cry-btn" disabled>${translate('audioCorrupted')}</button>`;
    }
    return `<button type="button" class="pixel-btn small-btn play-cry-btn" data-cry-url="${pokemon.media.cry}">${translate('playCry')}</button>`;
}

function renderHints() {
    hintTypesValue.innerHTML = buildTypeBadgesHTML(currentPokemon.types);
    hintColorValue.textContent = `${translate(currentPokemon.attributes.color)} — ${translate('heightLabel')}: ${(currentPokemon.attributes.height / 10).toFixed(1)}m / ${translate('weightLabel')}: ${(currentPokemon.attributes.weight / 10).toFixed(1)}kg`;
    hintCryContent.innerHTML = buildCryHintHTML(currentPokemon);
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
        descriptionText.textContent = getDescription(currentPokemon);
        renderHints();
        if (isRoundSolved()) {
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

function startNewRound() {
    currentPokemon = pickRandomPokemon();
    wrongGuesses = 0;

    descriptionText.textContent = getDescription(currentPokemon);
    renderHints();

    spriteContainer.classList.add('hidden');
    spriteImage.src = '';
    hintsContainer.classList.add('hidden');
    hintTypes.classList.add('hidden');
    hintColor.classList.add('hidden');
    hintCry.classList.add('hidden');

    guessInput.value = '';
    guessForm.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    guessInput.focus();

    setDialogue('dlgPrompt');
}

function revealHint(hintEl) {
    hintsContainer.classList.remove('hidden');
    hintEl.classList.remove('hidden');
}

function handleWrongGuess() {
    wrongGuesses += 1;
    guessInput.value = '';
    guessInput.focus();

    let hintJustRevealed = false;
    if (wrongGuesses === HINT_THRESHOLDS[0]) {
        revealHint(hintTypes);
        hintJustRevealed = true;
    } else if (wrongGuesses === HINT_THRESHOLDS[1]) {
        revealHint(hintColor);
        hintJustRevealed = true;
    } else if (wrongGuesses === HINT_THRESHOLDS[2]) {
        revealHint(hintCry);
        hintJustRevealed = true;
    }

    if (hintJustRevealed) {
        setDialogue('dlgWrongHintRevealed');
        return;
    }

    const nextThreshold = HINT_THRESHOLDS.find((threshold) => wrongGuesses < threshold);
    if (nextThreshold === undefined) {
        setDialogue('dlgWrongNoMoreHints');
    } else {
        setDialogue('dlgWrongCountdown', { remaining: nextThreshold - wrongGuesses });
    }
}

function handleCorrectGuess() {
    spriteImage.src = currentPokemon.media.sprite;
    spriteImage.alt = getPokemonName(currentPokemon);
    spriteContainer.classList.remove('hidden');

    guessForm.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    setDialogue('dlgCorrect', { name: getPokemonName(currentPokemon) });
}

function isGuessCorrect(guess) {
    const normalizedGuess = guess.toLowerCase();
    return normalizedGuess === currentPokemon.names.english.toLowerCase()
        || normalizedGuess === currentPokemon.names.french.toLowerCase();
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

    const guess = guessInput.value.trim();
    if (!guess || !currentPokemon) return;

    if (isGuessCorrect(guess)) {
        handleCorrectGuess();
    } else {
        handleWrongGuess();
    }
});

hintsContainer.addEventListener('click', (event) => {
    const cryBtn = event.target.closest('.play-cry-btn');
    if (!cryBtn || cryBtn.disabled) return;
    new Audio(cryBtn.dataset.cryUrl).play();
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
