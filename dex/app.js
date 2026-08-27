// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';

const i18n = Object.assign({}, sharedI18n, pageI18n);

// Wrong-guess counts at which each hint unlocks, in order.
const HINT_THRESHOLDS = [3, 5, 7];

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'fr';
let pokemonDatabase = [];
let currentPokemon = null;
let wrongGuesses = 0;
let roundOutcome = null;
let descriptionLangOverride = null;

const descriptionText = document.getElementById('description-text');
const noDescriptionActions = document.getElementById('no-description-actions');
const viewAltDescriptionBtn = document.getElementById('view-alt-description-btn');
const skipBtn = document.getElementById('skip-btn');
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

// Maps short language codes (matching currentLang) to the dataset's key names.
// Both `names` and `description` objects in pokemon.json use these same key
// names. Add an entry here (and to LANG_NAME_KEYS/NO_DESCRIPTION_FALLBACK below)
// when a new language is added to the dataset.
const LANG_DATA_KEYS = { en: 'english', fr: 'french' };
const LANG_NAME_KEYS = { en: 'langNameEnglish', fr: 'langNameFrench' };

// Text used by build-db.js as a placeholder when a Pokemon has no flavor
// text in a given language.
const NO_DESCRIPTION_FALLBACK = { en: 'No description available.', fr: 'Description non disponible.' };

function getPokemonName(pokemon, lang = currentLang) {
    return pokemon.names[LANG_DATA_KEYS[lang]];
}

function getDescription(pokemon, lang = currentLang) {
    return pokemon.description[LANG_DATA_KEYS[lang]];
}

function hasDescription(pokemon, lang = currentLang) {
    return getDescription(pokemon, lang) !== NO_DESCRIPTION_FALLBACK[lang];
}

// Finds a language other than the given one that has a real description
function findAlternateLangWithDescription(pokemon) {
    return Object.keys(LANG_DATA_KEYS).find((lang) => lang !== currentLang && hasDescription(pokemon, lang));
}

function buildTypeBadgesHTML(types) {
    return types.map((type) => `<span class="type-badge type-${type}">${translate(type)}</span>`).join(' ');
}

function renderDescription() {
    const lang = descriptionLangOverride || currentLang;

    if (hasDescription(currentPokemon, lang)) {
        descriptionText.textContent = getDescription(currentPokemon, lang);
        noDescriptionActions.classList.add('hidden');
        return;
    }

    descriptionText.textContent = translate('dlgDescriptionMissing');

    const altLang = findAlternateLangWithDescription(currentPokemon);
    if (altLang) {
        viewAltDescriptionBtn.textContent = t('viewDescriptionIn', { lang: translate(LANG_NAME_KEYS[altLang]) });
        noDescriptionActions.classList.remove('hidden');
    } else {
        noDescriptionActions.classList.add('hidden');
    }
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
        renderDescription();
        renderHints();
        if (roundOutcome === 'correct') {
            setDialogue('dlgCorrect', { name: getPokemonName(currentPokemon) });
        } else if (roundOutcome === 'skipped') {
            setDialogue('dlgSkipped', { name: getPokemonName(currentPokemon) });
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
    roundOutcome = null;
    descriptionLangOverride = null;

    renderDescription();
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

function revealAnswer() {
    spriteImage.src = currentPokemon.media.sprite;
    spriteImage.alt = getPokemonName(currentPokemon);
    spriteContainer.classList.remove('hidden');

    guessForm.classList.add('hidden');
    nextBtn.classList.remove('hidden');
}

function handleCorrectGuess() {
    roundOutcome = 'correct';
    revealAnswer();
    setDialogue('dlgCorrect', { name: getPokemonName(currentPokemon) });
}

function handleSkip() {
    roundOutcome = 'skipped';
    revealAnswer();
    setDialogue('dlgSkipped', { name: getPokemonName(currentPokemon) });
}

function isGuessCorrect(guess) {
    const normalizedGuess = guess.toLowerCase();
    return Object.values(LANG_DATA_KEYS)
        .some((key) => currentPokemon.names[key].toLowerCase() === normalizedGuess);
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

skipBtn.addEventListener('click', () => {
    if (!currentPokemon || roundOutcome) return;
    handleSkip();
});

viewAltDescriptionBtn.addEventListener('click', () => {
    if (!currentPokemon) return;
    const altLang = findAlternateLangWithDescription(currentPokemon);
    if (!altLang) return;
    descriptionLangOverride = altLang;
    renderDescription();
});

langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'fr' ? 'en' : 'fr';
    descriptionLangOverride = null;
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    updateUILanguage();
});

updateUILanguage();
loadPokemonDatabase();
