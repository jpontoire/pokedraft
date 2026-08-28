// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';
const i18n = Object.assign({}, sharedI18n, pageI18n);

// Maps short language codes (matching currentLang) to the dataset's key names.
const LANG_DATA_KEYS = { en: 'english', fr: 'french' };

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'fr';
let pokemonDatabase = [];
let targetPokemon = null;
let guesses = [];
let isGameWon = false;

const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');
const guessSuggestions = document.getElementById('guess-suggestions');
const gridBody = document.getElementById('grid-body');
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

function getPokemonName(pokemon, lang = currentLang) {
    return pokemon.names[LANG_DATA_KEYS[lang]];
}

function findPokemonByName(query) {
    const normalizedQuery = query.trim().toLowerCase();
    return pokemonDatabase.find((pokemon) => Object.values(LANG_DATA_KEYS)
        .some((key) => pokemon.names[key].toLowerCase() === normalizedQuery));
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

    if (guesses.length > 0 || targetPokemon) {
        renderGuesses();
    }

    if (isGameWon) {
        setDialogue('dlgCorrect', { name: getPokemonName(targetPokemon) });
    }
}

const autocomplete = createPokemonAutocomplete({
    input: guessInput,
    list: guessSuggestions,
    getPokemonList: () => pokemonDatabase,
    getName: getPokemonName,
    getIconUrl: (pokemon) => pokemon.media.icon,
    onSelect: () => guessInput.focus()
});

function pickRandomPokemon() {
    const index = Math.floor(Math.random() * pokemonDatabase.length);
    return pokemonDatabase[index];
}

// Evaluates one type slot (0 or 1) of a guess against the target. A slot can
// be undefined for mono-type Pokemon, which naturally falls out of the same
// comparison: two undefined slots are "equal" (correct), while an
// undefined guess slot against a real target type (or vice versa) can never
// match and can never be "present elsewhere", so it correctly lands on
// incorrect.
function evaluateTypeSlot(guessPokemon, targetPokemon, slotIndex) {
    const guessType = guessPokemon.types[slotIndex];
    const targetType = targetPokemon.types[slotIndex];

    if (guessType === targetType) return 'correct';
    if (guessType !== undefined && targetPokemon.types.includes(guessType)) return 'partial';
    return 'incorrect';
}

function evaluateExactMatch(guessValue, targetValue) {
    return guessValue === targetValue ? 'correct' : 'incorrect';
}

// For numeric stats, "incorrect" also carries a direction so the player
// knows which way to adjust their next guess.
function evaluateNumericStat(guessValue, targetValue) {
    if (guessValue === targetValue) return { status: 'correct', direction: null };
    return { status: 'incorrect', direction: targetValue > guessValue ? 'up' : 'down' };
}

function buildTypeCellHTML(guessPokemon, slotIndex) {
    const status = evaluateTypeSlot(guessPokemon, targetPokemon, slotIndex);
    const type = guessPokemon.types[slotIndex];
    const label = type ? translate(type) : translate('noType');
    return `<span class="grid-cell bg-${status}">${label}</span>`;
}

function buildExactCellHTML(status, label) {
    return `<span class="grid-cell bg-${status}">${label}</span>`;
}

// formatValue turns the raw guess value into display text (e.g. unit
// conversion for height/weight); the comparison itself is unit-agnostic.
function buildNumericCellHTML(guessValue, targetValue, formatValue) {
    const { status, direction } = evaluateNumericStat(guessValue, targetValue);
    const displayValue = formatValue(guessValue);

    if (status === 'correct') {
        return `<span class="grid-cell bg-correct">${displayValue}</span>`;
    }

    const arrowClass = direction === 'up' ? 'arrow-up' : 'arrow-down';
    return `
        <span class="grid-cell bg-incorrect">
            <span class="stat-with-arrow">${displayValue}<span class="${arrowClass}"></span></span>
        </span>
    `;
}

function buildGuessRowHTML(guessPokemon) {
    const guessName = getPokemonName(guessPokemon);
    const habitatStatus = evaluateExactMatch(guessPokemon.attributes.habitat, targetPokemon.attributes.habitat);
    const colorStatus = evaluateExactMatch(guessPokemon.attributes.color, targetPokemon.attributes.color);
    const evoStageStatus = evaluateExactMatch(guessPokemon.attributes.evolutionStage, targetPokemon.attributes.evolutionStage);

    return `
        <div class="grid-row guess-row">
            <span class="grid-cell grid-sprite-cell"><img src="${guessPokemon.media.sprite}" alt="${guessName}"></span>
            ${buildTypeCellHTML(guessPokemon, 0)}
            ${buildTypeCellHTML(guessPokemon, 1)}
            ${buildExactCellHTML(habitatStatus, translate(guessPokemon.attributes.habitat))}
            ${buildExactCellHTML(colorStatus, translate(guessPokemon.attributes.color))}
            ${buildNumericCellHTML(guessPokemon.attributes.generation, targetPokemon.attributes.generation, (v) => v)}
            ${buildExactCellHTML(evoStageStatus, guessPokemon.attributes.evolutionStage)}
            ${buildNumericCellHTML(guessPokemon.attributes.height, targetPokemon.attributes.height, (v) => `${(v / 10).toFixed(1)}m`)}
            ${buildNumericCellHTML(guessPokemon.attributes.weight, targetPokemon.attributes.weight, (v) => `${(v / 10).toFixed(1)}kg`)}
        </div>
    `;
}

// Guesses appear in the order they were made, oldest first, so each new
// guess appends below the previous ones.
function renderGuesses() {
    gridBody.innerHTML = guesses.map(buildGuessRowHTML).join('');
}

function startNewGame() {
    targetPokemon = pickRandomPokemon();
    guesses = [];
    isGameWon = false;

    gridBody.innerHTML = '';
    guessInput.value = '';
    guessForm.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    guessInput.focus();

    setDialogue('dlgPrompt');
}

function handleGuess(pokemon) {
    if (guesses.some((guessed) => guessed.id === pokemon.id)) {
        setDialogue('dlgAlreadyGuessed');
        return;
    }

    guesses.push(pokemon);
    renderGuesses();

    if (pokemon.id === targetPokemon.id) {
        isGameWon = true;
        guessForm.classList.add('hidden');
        nextBtn.classList.remove('hidden');
        setDialogue('dlgCorrect', { name: getPokemonName(targetPokemon) });
        return;
    }

    setDialogue('dlgWrongGuess', { name: getPokemonName(pokemon) });
}

async function loadPokemonDatabase() {
    try {
        const response = await fetch('../data/pokemon.json');
        pokemonDatabase = await response.json();
        startNewGame();
    } catch (error) {
        console.error('Failed to load Pokemon database:', error);
        setDialogue('dlgErrorLoading');
    }
}

guessForm.addEventListener('submit', (event) => {
    event.preventDefault();
    autocomplete.close();

    const guessText = guessInput.value.trim();
    if (!guessText || isGameWon) return;

    const pokemon = findPokemonByName(guessText);
    guessInput.value = '';
    guessInput.focus();

    if (!pokemon) {
        setDialogue('dlgUnknownPokemon');
        return;
    }

    handleGuess(pokemon);
});

nextBtn.addEventListener('click', () => {
    startNewGame();
});

langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'fr' ? 'en' : 'fr';
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    updateUILanguage();
});

updateUILanguage();
loadPokemonDatabase();
