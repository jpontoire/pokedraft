// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';

const i18n = {
    backToMenu: { en: '< Menu', fr: '< Menu' },
    guessPlaceholder: { en: "Who's that Pokemon?", fr: 'Qui est ce Pokémon ?' },
    submit: { en: 'Submit', fr: 'Valider' },
    nextPokemon: { en: 'Next Pokemon', fr: 'Pokémon Suivant' },
    dlgLoading: { en: 'Loading Pokemon data...', fr: 'Chargement des données...' },
    dlgErrorLoading: { en: 'Error: could not load the Pokemon database.', fr: 'Erreur : impossible de charger la base de données.' },
    dlgPrompt: { en: 'Read the Pokedex entry and guess the Pokemon!', fr: 'Lisez la description et devinez le Pokémon !' },
    dlgWrongHintRevealed: { en: 'Wrong! A new hint was revealed!', fr: 'Faux ! Un nouvel indice est révélé !' },
    dlgWrongCountdown: { en: 'Wrong! {remaining} more guess(es) until the next hint.', fr: 'Faux ! Encore {remaining} essai(s) avant le prochain indice.' },
    dlgWrongNoMoreHints: { en: 'Wrong! No more hints left, keep guessing!', fr: "Faux ! Plus d'indices, continuez à deviner !" },
    dlgCorrect: { en: "Correct! It's {name}!", fr: "Correct ! C'est {name} !" },
    hintTypesLabel: { en: 'Hint 1: Types', fr: 'Indice 1 : Types' },
    hintColorLabel: { en: 'Hint 2: Color & Size', fr: 'Indice 2 : Couleur & Taille' },
    hintCryLabel: { en: 'Hint 3: Cry', fr: 'Indice 3 : Cri' },
    heightLabel: { en: 'Height', fr: 'Taille' },
    weightLabel: { en: 'Weight', fr: 'Poids' },
    audioCorrupted: { en: 'Audio corrupted', fr: 'Audio corrompu' },
    playCry: { en: '[ ▶ Play Cry ]', fr: '[ ▶ Écouter le Cri ]' },

    // Pokemon types
    normal: { en: 'Normal', fr: 'Normal' },
    fire: { en: 'Fire', fr: 'Feu' },
    water: { en: 'Water', fr: 'Eau' },
    electric: { en: 'Electric', fr: 'Électrik' },
    grass: { en: 'Grass', fr: 'Plante' },
    ice: { en: 'Ice', fr: 'Glace' },
    fighting: { en: 'Fighting', fr: 'Combat' },
    poison: { en: 'Poison', fr: 'Poison' },
    ground: { en: 'Ground', fr: 'Sol' },
    flying: { en: 'Flying', fr: 'Vol' },
    psychic: { en: 'Psychic', fr: 'Psy' },
    bug: { en: 'Bug', fr: 'Insecte' },
    rock: { en: 'Rock', fr: 'Roche' },
    ghost: { en: 'Ghost', fr: 'Spectre' },
    dragon: { en: 'Dragon', fr: 'Dragon' },
    dark: { en: 'Dark', fr: 'Ténèbres' },
    steel: { en: 'Steel', fr: 'Acier' },
    fairy: { en: 'Fairy', fr: 'Fée' },

    // Pokemon colors (species.color)
    black: { en: 'Black', fr: 'Noir' },
    blue: { en: 'Blue', fr: 'Bleu' },
    brown: { en: 'Brown', fr: 'Marron' },
    gray: { en: 'Gray', fr: 'Gris' },
    green: { en: 'Green', fr: 'Vert' },
    pink: { en: 'Pink', fr: 'Rose' },
    purple: { en: 'Purple', fr: 'Violet' },
    red: { en: 'Red', fr: 'Rouge' },
    white: { en: 'White', fr: 'Blanc' },
    yellow: { en: 'Yellow', fr: 'Jaune' }
};

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
