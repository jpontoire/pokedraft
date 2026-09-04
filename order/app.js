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
let roundPokemon = [];
let isRoundSolved = false;
let draggedCard = null;

const objectiveText = document.getElementById('objective-text');
const sortableContainer = document.getElementById('sortable-container');
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

function getCorrectOrderIds() {
    return [...roundPokemon]
        .sort((a, b) => getStatValue(a, currentCriterion) - getStatValue(b, currentCriterion))
        .map((pokemon) => pokemon.id);
}

// Avoids starting a round with the cards already in the correct order,
// which would make the round trivially "solved" without any dragging.
function shuffleForDisplay() {
    const correctOrderIds = getCorrectOrderIds();
    let attempt = roundPokemon;
    let attempts = 0;

    do {
        attempt = shuffle(roundPokemon);
        attempts += 1;
    } while (attempts < 10 && attempt.map((pokemon) => pokemon.id).join(',') === correctOrderIds.join(','));

    return attempt;
}

function buildCardHTML(pokemon) {
    const name = getPokemonName(pokemon);
    return `
        <div class="sort-card" draggable="true" data-pokemon-id="${pokemon.id}">
            <img class="sort-card-sprite" src="${pokemon.media.sprite}" alt="${name}" draggable="false">
            <p class="sort-card-name">${name}</p>
            <p class="sort-card-stat hidden"></p>
        </div>
    `;
}

function renderObjective() {
    const stat = `<span class="objective-stat">${translate(CRITERION_LABEL_KEYS[currentCriterion])}</span>`;
    objectiveText.innerHTML = t('objectiveTemplate', { stat, direction: translate('ascendingLabel') });
}

// Re-applies the current language to the cards already on the board without
// touching their order or submitted (correct/incorrect) state.
function refreshCardLabels() {
    sortableContainer.querySelectorAll('.sort-card').forEach((card) => {
        const pokemon = roundPokemon.find((p) => p.id === Number(card.dataset.pokemonId));
        if (!pokemon) return;

        card.querySelector('.sort-card-name').textContent = getPokemonName(pokemon);

        if (isRoundSolved) {
            card.querySelector('.sort-card-stat').textContent = formatStatValue(pokemon, currentCriterion);
        }
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
        setDialogue(isRoundSolved ? 'dlgSuccess' : 'dlgPrompt');
    }
}

function startNewRound() {
    currentCriterion = SORT_CRITERIA[Math.floor(Math.random() * SORT_CRITERIA.length)];
    roundPokemon = drawRoundPokemon(currentCriterion);
    isRoundSolved = false;

    renderObjective();
    sortableContainer.innerHTML = shuffleForDisplay().map(buildCardHTML).join('');

    submitBtn.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    setDialogue('dlgPrompt');
}

function evaluateOrder() {
    const cards = Array.from(sortableContainer.children);
    const userOrderIds = cards.map((card) => Number(card.dataset.pokemonId));
    const correctOrderIds = getCorrectOrderIds();

    let allCorrect = true;
    cards.forEach((card, index) => {
        const isCorrect = userOrderIds[index] === correctOrderIds[index];
        card.classList.remove('correct-slot', 'incorrect-slot');
        card.classList.add(isCorrect ? 'correct-slot' : 'incorrect-slot');
        if (!isCorrect) allCorrect = false;
    });

    if (!allCorrect) {
        setDialogue('dlgTryAgain');
        return;
    }

    isRoundSolved = true;
    cards.forEach((card) => {
        const pokemon = roundPokemon.find((p) => p.id === Number(card.dataset.pokemonId));
        const statEl = card.querySelector('.sort-card-stat');
        statEl.textContent = formatStatValue(pokemon, currentCriterion);
        statEl.classList.remove('hidden');
    });

    submitBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    setDialogue('dlgSuccess');
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

// Drag and drop: reordering is done by moving the dragged card immediately
// before or after whichever card it's dropped on, based on their positions
// in the container at drag-start time.
sortableContainer.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.sort-card');
    if (!card) return;
    draggedCard = card;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.pokemonId);
    // Let the browser paint the drag ghost before we dim the source card.
    requestAnimationFrame(() => card.classList.add('grabbing'));
});

sortableContainer.addEventListener('dragend', () => {
    if (draggedCard) draggedCard.classList.remove('grabbing');
    draggedCard = null;
    sortableContainer.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
});

sortableContainer.addEventListener('dragover', (event) => {
    event.preventDefault(); // required to allow this element to be a drop target
    event.dataTransfer.dropEffect = 'move';
});

sortableContainer.addEventListener('dragenter', (event) => {
    const card = event.target.closest('.sort-card');
    if (!card || card === draggedCard) return;
    card.classList.add('drag-over');
});

sortableContainer.addEventListener('dragleave', (event) => {
    const card = event.target.closest('.sort-card');
    if (!card) return;
    // Only clear the highlight once the pointer has actually left the card,
    // not when it moves between the card's own child elements.
    if (!card.contains(event.relatedTarget)) {
        card.classList.remove('drag-over');
    }
});

sortableContainer.addEventListener('drop', (event) => {
    event.preventDefault();
    const targetCard = event.target.closest('.sort-card');
    if (!targetCard || !draggedCard || targetCard === draggedCard) return;

    targetCard.classList.remove('drag-over');

    const cards = Array.from(sortableContainer.children);
    const draggedIndex = cards.indexOf(draggedCard);
    const targetIndex = cards.indexOf(targetCard);

    if (draggedIndex < targetIndex) {
        targetCard.after(draggedCard);
    } else {
        targetCard.before(draggedCard);
    }
});

submitBtn.addEventListener('click', () => {
    evaluateOrder();
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
