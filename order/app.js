// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';
const i18n = Object.assign({}, sharedI18n, pageI18n);

// Maps short language codes (matching currentLang) to the dataset's key names.
const LANG_DATA_KEYS = { en: 'english', fr: 'french' };

const SORT_CRITERIA = ['hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed', 'height', 'weight'];
const CARD_COUNT = 5;

// Maps each criterion to the i18n key for its display label.
const CRITERION_LABEL_KEYS = {
    hp: 'statHp',
    attack: 'statAttack',
    defense: 'statDefense',
    special_attack: 'statSpecialAttack',
    special_defense: 'statSpecialDefense',
    speed: 'statSpeed',
    height: 'statHeight',
    weight: 'statWeight'
};

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'fr';
let pokemonDatabase = [];
let currentCriterion = null;
// Pokemon confirmed into the row so far, always kept in true ascending order.
let placedPokemon = [];
// Pokemon not yet introduced to the player.
let pendingQueue = [];
// The Pokemon currently being placed (hidden stat, draggable), or null
// between rounds / once every Pokemon has been placed.
let mysteryPokemon = null;
// Which gap the mystery Pokemon currently sits in (0..placedPokemon.length),
// or null if it hasn't been dropped into the row yet.
let mysteryGapIndex = null;
let isRoundOver = false;
// null while placing cards; 'success' or 'gameover' once the round ends,
// so updateUILanguage() knows which persistent dialogue message to restore.
let roundOutcome = null;
// Kept after a failed submission so the game-over message can still be
// re-translated correctly if the player switches language afterward.
let lastFailedPokemon = null;

const objectiveText = document.getElementById('objective-text');
const sortableRow = document.getElementById('sortable-row');
const mysteryCardCaption = document.getElementById('mystery-card-caption');
const mysteryCardSlot = document.getElementById('mystery-card-slot');
const submitBtn = document.getElementById('submit-btn');
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

function shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// height/weight live under attributes; every other criterion is a base stat.
function getStatValue(pokemon, criterion) {
    if (criterion === 'height' || criterion === 'weight') return pokemon.attributes[criterion];
    return pokemon.stats[criterion];
}

function formatStatValue(pokemon, criterion) {
    if (criterion === 'height') return `${(pokemon.attributes.height / 10).toFixed(1)}m`;
    if (criterion === 'weight') return `${(pokemon.attributes.weight / 10).toFixed(1)}kg`;
    return String(getStatValue(pokemon, criterion));
}

// Greedily walks a shuffled full database, keeping the first Pokemon seen
// for each distinct criterion value, until CARD_COUNT unique values are
// found. With 1025 entries and any of the 8 criteria, this is effectively
// guaranteed to succeed well within one pass.
function drawRoundPokemon(criterion) {
    const shuffled = shuffle(pokemonDatabase);
    const selected = [];
    const usedValues = new Set();

    for (const pokemon of shuffled) {
        const value = getStatValue(pokemon, criterion);
        if (usedValues.has(value)) continue;
        usedValues.add(value);
        selected.push(pokemon);
        if (selected.length === CARD_COUNT) break;
    }

    return selected;
}

// Where pokemon truly belongs among the already-placed (ascending) row.
function getCorrectGapIndex(pokemon) {
    return placedPokemon.filter((placed) => getStatValue(placed, currentCriterion) < getStatValue(pokemon, currentCriterion)).length;
}

function renderObjective() {
    const stat = `<span class="objective-stat">${translate(CRITERION_LABEL_KEYS[currentCriterion])}</span>`;
    objectiveText.innerHTML = t('objectiveTemplate', { stat, direction: translate('ascendingLabel') });
}

function buildGapHTML(gapIndex) {
    return `<div class="drop-gap" data-gap-index="${gapIndex}"></div>`;
}

function buildPlacedCardHTML(pokemon) {
    const name = getPokemonName(pokemon);
    return `
        <div class="sort-card placed" data-pokemon-id="${pokemon.id}">
            <img class="sort-card-sprite" src="${pokemon.media.sprite}" alt="${name}" draggable="false">
            <p class="sort-card-name">${name}</p>
            <p class="sort-card-stat">${formatStatValue(pokemon, currentCriterion)}</p>
        </div>
    `;
}

// Rebuilds the confirmed row: a drop-gap before, between, and after every
// placed card (placedPokemon.length + 1 gaps total). Only called when the
// confirmed set changes, never mid-drag, so it never disturbs the mystery
// card while the player is positioning it.
function renderRow() {
    let html = buildGapHTML(0);
    placedPokemon.forEach((pokemon, index) => {
        html += buildPlacedCardHTML(pokemon);
        html += buildGapHTML(index + 1);
    });
    sortableRow.innerHTML = html;
}

function buildMysteryCardHTML(pokemon) {
    const name = getPokemonName(pokemon);
    return `
        <div class="sort-card mystery" draggable="true" data-pokemon-id="${pokemon.id}">
            <img class="sort-card-sprite" src="${pokemon.media.sprite}" alt="${name}" draggable="false">
            <p class="sort-card-name">${name}</p>
            <p class="sort-card-stat">?</p>
        </div>
    `;
}

function renderMysteryCard() {
    mysteryCardSlot.innerHTML = buildMysteryCardHTML(mysteryPokemon);
    mysteryGapIndex = null;
}

// Re-applies the current language to every card on screen without touching
// the row's order or the in-progress placement state.
function refreshCardLabels() {
    document.querySelectorAll('.sort-card').forEach((card) => {
        const pokemonId = Number(card.dataset.pokemonId);
        const pokemon = placedPokemon.find((p) => p.id === pokemonId)
            || (mysteryPokemon && mysteryPokemon.id === pokemonId ? mysteryPokemon : null);
        if (!pokemon) return;
        card.querySelector('.sort-card-name').textContent = getPokemonName(pokemon);
    });
}

function updateUILanguage() {
    document.documentElement.lang = currentLang;
    langToggleBtn.textContent = currentLang === 'fr' ? 'EN' : 'FR';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = translate(el.getAttribute('data-i18n'));
    });

    if (currentCriterion) {
        renderObjective();
        refreshCardLabels();
        // #dialogue-text has a static data-i18n="dlgLoading" attribute (its
        // initial pre-load state), so the generic sweep above just reset it
        // to that regardless of the round's actual current message. Restore
        // whichever persistent message actually applies right now.
        if (roundOutcome === 'success') {
            setDialogue('dlgSuccess');
        } else if (roundOutcome === 'gameover') {
            setDialogue('dlgGameOver', { name: getPokemonName(lastFailedPokemon) });
        } else {
            setDialogue('dlgPlaceCard');
        }
    }
}

function introduceNextMysteryPokemon() {
    mysteryPokemon = pendingQueue.shift();
    renderMysteryCard();
    mysteryCardCaption.classList.remove('hidden');
    submitBtn.classList.remove('hidden');
    setDialogue('dlgPlaceCard');
}

function startNewRound() {
    currentCriterion = SORT_CRITERIA[Math.floor(Math.random() * SORT_CRITERIA.length)];
    const roundPokemon = drawRoundPokemon(currentCriterion);
    const introOrder = shuffle(roundPokemon);

    placedPokemon = [introOrder[0]];
    pendingQueue = introOrder.slice(1);
    isRoundOver = false;
    roundOutcome = null;
    lastFailedPokemon = null;

    renderObjective();
    renderRow();
    nextBtn.classList.add('hidden');

    introduceNextMysteryPokemon();
}

function endRoundInFailure() {
    isRoundOver = true;
    roundOutcome = 'gameover';
    lastFailedPokemon = mysteryPokemon;

    // Reveal where the mystery Pokemon actually belonged, styled red, so
    // the player can see what they got wrong before starting a new round.
    const correctIndex = getCorrectGapIndex(mysteryPokemon);
    placedPokemon.splice(correctIndex, 0, mysteryPokemon);
    renderRow();
    const revealedCard = sortableRow.querySelector(`[data-pokemon-id="${mysteryPokemon.id}"]`);
    if (revealedCard) revealedCard.classList.add('reveal-wrong');

    setDialogue('dlgGameOver', { name: getPokemonName(mysteryPokemon) });

    mysteryCardSlot.innerHTML = '';
    mysteryCardCaption.classList.add('hidden');
    submitBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    mysteryPokemon = null;
}

function finishRoundSuccess() {
    isRoundOver = true;
    roundOutcome = 'success';
    setDialogue('dlgSuccess');

    mysteryCardCaption.classList.add('hidden');
    submitBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
}

function handleSubmit() {
    if (mysteryGapIndex === null || !mysteryPokemon) return;

    const correctIndex = getCorrectGapIndex(mysteryPokemon);
    if (mysteryGapIndex !== correctIndex) {
        endRoundInFailure();
        return;
    }

    placedPokemon.splice(correctIndex, 0, mysteryPokemon);
    mysteryPokemon = null;
    renderRow();

    if (pendingQueue.length === 0) {
        finishRoundSuccess();
    } else {
        introduceNextMysteryPokemon();
    }
}

async function loadPokemonDatabase() {
    try {
        const response = await fetch('../data/pokemon.json');
        pokemonDatabase = await response.json();
        startNewRound();
    } catch (error) {
        console.error('Failed to load Pokemon database:', error);
        setDialogue('dlgErrorLoading');
    }
}

// Drag and drop: only the mystery card is ever draggable. Dropping it on a
// drop-gap moves its DOM node right after that gap (visually inserting it
// into the row) and records which gap it's currently sitting in; dropping
// it back on the staging slot un-places it. Submit only reads
// mysteryGapIndex, so re-dragging to a different gap before submitting is
// always safe.
document.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.sort-card.mystery');
    if (!card) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.pokemonId);
    requestAnimationFrame(() => card.classList.add('grabbing'));
});

document.addEventListener('dragend', (event) => {
    const card = event.target.closest('.sort-card.mystery');
    if (card) card.classList.remove('grabbing');
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
});

sortableRow.addEventListener('dragover', (event) => {
    if (!event.target.closest('.drop-gap')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
});

sortableRow.addEventListener('dragenter', (event) => {
    const gap = event.target.closest('.drop-gap');
    if (!gap) return;
    gap.classList.add('drag-over');
});

sortableRow.addEventListener('dragleave', (event) => {
    const gap = event.target.closest('.drop-gap');
    if (!gap) return;
    if (!gap.contains(event.relatedTarget)) {
        gap.classList.remove('drag-over');
    }
});

sortableRow.addEventListener('drop', (event) => {
    const gap = event.target.closest('.drop-gap');
    if (!gap) return;
    event.preventDefault();
    gap.classList.remove('drag-over');

    const mysteryCard = mysteryCardSlot.querySelector('.sort-card.mystery') || sortableRow.querySelector('.sort-card.mystery');
    if (!mysteryCard) return;

    gap.after(mysteryCard);
    mysteryGapIndex = Number(gap.dataset.gapIndex);
});

// Dropping the mystery card back onto its own staging slot un-places it.
mysteryCardSlot.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
});

mysteryCardSlot.addEventListener('drop', (event) => {
    event.preventDefault();
    const mysteryCard = sortableRow.querySelector('.sort-card.mystery');
    if (!mysteryCard) return;
    mysteryCardSlot.appendChild(mysteryCard);
    mysteryGapIndex = null;
});

submitBtn.addEventListener('click', () => {
    handleSubmit();
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
