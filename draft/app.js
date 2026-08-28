// app.js

const i18n = Object.assign({}, sharedI18n, pageI18n);

const LANG_STORAGE_KEY = 'pokedraft-lang';
let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'fr';

// Look up a single translated string by i18n key
function translate(key) {
    const entry = i18n[key];
    return entry ? entry[currentLang] : key;
}

// The dataset stores full language names (english/french) rather than the
// short 'en'/'fr' codes used by currentLang, so this maps between them.
function getPokemonName(pokemon) {
    return currentLang === 'fr' ? pokemon.names.french : pokemon.names.english;
}

// Look up a translated string and substitute {param} placeholders
function t(key, params = {}) {
    let text = translate(key);
    Object.keys(params).forEach((paramKey) => {
        text = text.replace(`{${paramKey}}`, params[paramKey]);
    });
    return text;
}

const DRAFT_SIZE = 3;
const MAX_TURNS = 12;

// Standard Pokedex ID ranges per generation
const GENERATION_RANGES = [
    { gen: 1, min: 1, max: 151 },
    { gen: 2, min: 152, max: 251 },
    { gen: 3, min: 252, max: 386 },
    { gen: 4, min: 387, max: 493 },
    { gen: 5, min: 494, max: 649 },
    { gen: 6, min: 650, max: 721 },
    { gen: 7, min: 722, max: 809 },
    { gen: 8, min: 810, max: 905 },
    { gen: 9, min: 906, max: 1025 }
];

let pokemonDatabase = [];
let peer = null;
let connection = null;
let isHost = false;

// Draft state, mirrored on both peers
let gameSettings = null;
let currentTurn = 0;
let pickerIsHostThisTurn = null;
let currentStarterIds = [];
let pickedSlotIndex = null;
let allSlotsRevealed = false;
let hostTeam = [];
let guestTeam = [];
let hostRoomId = null;
let draftJustCompleted = false;

// Deception Mode state, local to whichever peer is currently the Guide.
let selectedLieSlotIndex = null;
let selectedFakeMonId = null;
let deceptionOnConfirm = null;
// Set on the Host while waiting for the Guest (as Guide) to reply with their
// deception-config choice, so the Picker's turn can't start before then.
let pendingPickerTurnData = null;

const lobbyScreen = document.getElementById('lobby-screen');
const settingsScreen = document.getElementById('settings-screen');
const gameScreen = document.getElementById('game-screen');
const dialogueText = document.getElementById('dialogue-text');
const nextTurnBtn = document.getElementById('next-turn-btn');
const exportBtn = document.getElementById('export-btn');
const turnInfo = document.getElementById('turn-info');
const labDesk = document.getElementById('lab-desk');
const myTeamPanel = document.getElementById('my-team-panel');
const opponentTeamPanel = document.getElementById('opponent-team-panel');
const myTeamSlots = document.getElementById('my-team-slots');
const opponentTeamSlots = document.getElementById('opponent-team-slots');
const roomIdBar = document.getElementById('room-id-bar');
const roomIdText = document.getElementById('room-id-text');
const copyIdBtn = document.getElementById('copy-id-btn');
const langToggleBtn = document.getElementById('lang-toggle');

const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const joinForm = document.getElementById('join-form');
const joinRoomInput = document.getElementById('join-room-input');
const joinConfirmBtn = document.getElementById('join-confirm-btn');

const hostSettingsForm = document.getElementById('host-settings-form');
const guestSettingsLoading = document.getElementById('guest-settings-loading');
const generationCheckboxes = document.getElementById('generation-checkboxes');
const legendaryMinInput = document.getElementById('legendary-min');
const legendaryMaxInput = document.getElementById('legendary-max');
const symmetricalLegendariesCheckbox = document.getElementById('symmetrical-legendaries');
const mythicalMinInput = document.getElementById('mythical-min');
const mythicalMaxInput = document.getElementById('mythical-max');
const symmetricalMythicalsCheckbox = document.getElementById('symmetrical-mythicals');
const clueSelect = document.getElementById('clue-select');
const allowLyingCheckbox = document.getElementById('allow-lying-checkbox');
const startDraftBtn = document.getElementById('start-draft-btn');

const deceptionPanel = document.getElementById('deception-panel');
const deceptionSlotButtonsContainer = deceptionPanel.querySelector('.deception-slot-buttons');
const deceptionFakeInput = document.getElementById('deception-fake-input');
const deceptionFakeSuggestions = document.getElementById('deception-fake-suggestions');
const deceptionConfirmBtn = document.getElementById('deception-confirm-btn');

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

    // Re-render whichever dynamic content is currently on screen so it
    // reflects the newly selected language without waiting for the next turn.
    if (labDesk.classList.contains('showcase')) {
        renderTeamShowcase();
    } else if (currentStarterIds.length > 0) {
        renderSlots();
    }

    if (currentTurn > 0) {
        updateTurnInfo();
    }

    renderTeamPanels();
    renderDeceptionSlotButtons();

    if (hostRoomId && !roomIdBar.classList.contains('hidden')) {
        roomIdText.textContent = t('roomIdLabel', { id: hostRoomId });
    }
}

function showGameScreen() {
    lobbyScreen.classList.add('hidden');
    settingsScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    myTeamPanel.classList.remove('hidden');
    opponentTeamPanel.classList.remove('hidden');
    renderTeamPanels();
}

function showSettingsScreen() {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    settingsScreen.classList.remove('hidden');
    myTeamPanel.classList.add('hidden');
    opponentTeamPanel.classList.add('hidden');

    hostSettingsForm.classList.toggle('hidden', !isHost);
    guestSettingsLoading.classList.toggle('hidden', isHost);
}

async function loadPokemonDatabase() {
    try {
        const response = await fetch('../data/pokemon.json');
        pokemonDatabase = await response.json();
        console.log(`Loaded ${pokemonDatabase.length} Pokemon from the database.`);
    } catch (error) {
        console.error('Failed to load Pokemon database:', error);
        setDialogue('dlgErrorLoading');
    }
}

function getPokemonById(id) {
    return pokemonDatabase.find((pokemon) => pokemon.id === id);
}

function buildTypeBadgesHTML(types) {
    return types.map((type) => `<span class="type-badge type-${type}">${translate(type)}</span>`).join(' ');
}

function getGeneration(pokemonId) {
    const range = GENERATION_RANGES.find((r) => pokemonId >= r.min && pokemonId <= r.max);
    return range ? range.gen : null;
}

function getFilteredPokedex(settings) {
    const generationFiltered = pokemonDatabase.filter((pokemon) => settings.allowedGenerations.includes(getGeneration(pokemon.id)));

    return {
        legendaryPool: generationFiltered.filter((pokemon) => pokemon.attributes.is_legendary),
        mythicalPool: generationFiltered.filter((pokemon) => pokemon.attributes.is_mythical),
        standardPool: generationFiltered.filter((pokemon) => !pokemon.attributes.is_legendary && !pokemon.attributes.is_mythical)
    };
}

function shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function randomIntInRange(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function pickUniqueTurns(count) {
    return shuffle([1, 2, 3, 4, 5, 6]).slice(0, count).sort((a, b) => a - b);
}

function drawFromPool(pool, count, draftedIds) {
    const available = pool.filter((pokemon) => !draftedIds.has(pokemon.id));
    return shuffle(available).slice(0, count);
}

function pickRandomStarterIds(pickerIsHostForTurn) {
    const draftedIds = new Set([...hostTeam, ...guestTeam]);
    const { legendaryPool, mythicalPool, standardPool } = getFilteredPokedex(gameSettings);

    const pickerTeam = pickerIsHostForTurn ? hostTeam : guestTeam;
    const pickNumber = pickerTeam.length + 1;
    const legTurns = pickerIsHostForTurn ? gameSettings.hostLegTurns : gameSettings.guestLegTurns;
    const mythTurns = pickerIsHostForTurn ? gameSettings.hostMythTurns : gameSettings.guestMythTurns;

    const numLegToDraw = legTurns.includes(pickNumber) ? 1 : 0;
    const numMythToDraw = mythTurns.includes(pickNumber) ? 1 : 0;
    const numStdToDraw = DRAFT_SIZE - numLegToDraw - numMythToDraw;

    const drawn = [
        ...drawFromPool(legendaryPool, numLegToDraw, draftedIds),
        ...drawFromPool(mythicalPool, numMythToDraw, draftedIds),
        ...drawFromPool(standardPool, numStdToDraw, draftedIds)
    ];

    // fakeClueId starts null (no lie); Deception Mode fills it in per-slot
    // before a turn is broadcast, without ever touching the real id.
    return shuffle(drawn).map((pokemon) => ({ id: pokemon.id, fakeClueId: null }));
}

function getClueText(pokemon) {
    switch (gameSettings.clueType) {
        case 'color':
            return translate(pokemon.attributes.color);
        case 'shape':
            return translate(pokemon.attributes.shape);
        case 'height_weight':
            return `${translate('heightLabel')}: ${(pokemon.attributes.height / 10).toFixed(1)}m / ${translate('weightLabel')}: ${(pokemon.attributes.weight / 10).toFixed(1)}kg`;
        case 'pokedex_num':
            return `#${String(pokemon.id).padStart(4, '0')}`;
        case 'total_stats': {
            const { hp, attack, defense, special_attack, special_defense, speed } = pokemon.stats;
            return `${translate('baseStatTotal')}: ${hp + attack + defense + special_attack + special_defense + speed}`;
        }
        case 'types':
        default:
            return buildTypeBadgesHTML(pokemon.types);
    }
}

function getStatTier(value) {
    if (value < 75) return 'low';
    if (value <= 110) return 'mid';
    return 'high';
}

function buildStatBarsHTML(pokemon) {
    const statRows = [
        { key: 'hp', value: pokemon.stats.hp },
        { key: 'attack', value: pokemon.stats.attack },
        { key: 'defense', value: pokemon.stats.defense },
        { key: 'specialAttack', value: pokemon.stats.special_attack },
        { key: 'specialDefense', value: pokemon.stats.special_defense },
        { key: 'speed', value: pokemon.stats.speed }
    ];

    const rowsHTML = statRows.map((stat) => {
        const widthPercent = Math.min((stat.value / 255) * 100, 100);
        return `
            <div class="stat-row">
                <span class="stat-label">${translate(stat.key)}</span>
                <span class="stat-value">${stat.value}</span>
                <div class="stat-bar-track">
                    <div class="stat-bar-fill stat-${getStatTier(stat.value)}" style="width: ${widthPercent}%"></div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="stat-block">
            <p class="stat-block-title">${translate('clueBaseStats')}</p>
            ${rowsHTML}
        </div>
    `;
}

function buildCryClueHTML(pokemon) {
    if (!pokemon.media.cry) {
        return `<button type="button" class="pixel-btn small-btn play-cry-btn" disabled>${translate('audioCorrupted')}</button>`;
    }
    return `<button type="button" class="pixel-btn small-btn play-cry-btn" data-cry-url="${pokemon.media.cry}">${translate('playCry')}</button>`;
}

function buildClueHTML(pokemon) {
    if (gameSettings.clueType === 'base_stats') return buildStatBarsHTML(pokemon);
    if (gameSettings.clueType === 'cry') return buildCryClueHTML(pokemon);
    return `<p class="slot-clue-label">${getClueText(pokemon)}</p>`;
}

function amIPicker() {
    return (isHost && pickerIsHostThisTurn) || (!isHost && !pickerIsHostThisTurn);
}

function addPickToTeam(pokemonId, pickerWasHost) {
    const team = pickerWasHost ? hostTeam : guestTeam;
    if (!team.includes(pokemonId)) {
        team.push(pokemonId);
    }
}

function updateTurnInfo() {
    const role = translate(amIPicker() ? 'blindPicker' : 'guide');
    turnInfo.textContent = t('turnInfoTemplate', { turn: currentTurn, max: MAX_TURNS, role });
}

function buildSlotHTML(slot, index) {
    const pokemon = getPokemonById(slot.id);
    const wasPickedHere = pickedSlotIndex === index;
    const wasPassedOver = allSlotsRevealed && pickedSlotIndex !== null && !wasPickedHere;
    const isRevealed = !amIPicker() || wasPickedHere || allSlotsRevealed;
    const isClickable = amIPicker() && pickedSlotIndex === null;

    // What the Picker sees while this slot is still blind: the Guide's
    // configured lie, if any, otherwise the real Pokemon.
    const blindCluePokemon = slot.fakeClueId !== null ? getPokemonById(slot.fakeClueId) : pokemon;
    // The Picker sees this before they've revealed the slot themselves. The
    // Guide previews the exact same blind clue (fake included) before
    // anyone has picked this turn, so they can judge their lie against the
    // real hints instead of flying blind about their own deception. Once
    // any pick happens, everyone reverts to the true clue -- it should line
    // up with the sprite that's now visible instead of contradicting it.
    const isBlindPickerView = amIPicker() && !isRevealed;
    const isGuidePreview = !amIPicker() && pickedSlotIndex === null;
    const cluePokemon = (isBlindPickerView || isGuidePreview) ? blindCluePokemon : pokemon;
    // Only the Guide should ever know a slot's clue is fake -- showing this
    // to the Picker would give the lie away entirely.
    const showLieBadge = !amIPicker() && slot.fakeClueId !== null;

    const slotClasses = ['draft-slot'];
    if (isClickable) slotClasses.push('clickable');
    if (wasPickedHere) slotClasses.push('selected');
    if (wasPassedOver) slotClasses.push('not-chosen');
    if (showLieBadge) slotClasses.push('deception-target');

    const clueHTML = buildClueHTML(cluePokemon);
    const pokemonName = getPokemonName(pokemon);
    const lieBadgeHTML = showLieBadge ? `<p class="slot-clue-label deception-badge">${translate('deceptionBadge')}</p>` : '';

    if (isRevealed) {
        const tooltip = `${pokemonName} (#${pokemon.id})`;
        return `
            <div class="slot-wrapper">
                <div class="${slotClasses.join(' ')}" data-slot="${index}" data-tooltip="${tooltip}">
                    <img class="pokemon-sprite" src="${pokemon.media.sprite}" alt="${pokemonName}">
                </div>
                ${(wasPickedHere || isGuidePreview) ? clueHTML : ''}
                ${wasPassedOver ? `<p class="slot-clue-label not-chosen-label">${translate('notChosen')}</p>` : ''}
                ${lieBadgeHTML}
            </div>
        `;
    }

    // Reachable only when !isRevealed, which requires amIPicker() to be true
    // -- so showLieBadge (which requires the opposite) is always false here.
    return `
        <div class="slot-wrapper">
            <div class="${slotClasses.join(' ')}" data-slot="${index}">
                <div class="pokeball-icon"></div>
            </div>
            ${clueHTML}
        </div>
    `;
}

function renderSlots() {
    labDesk.classList.remove('showcase');
    labDesk.innerHTML = currentStarterIds.map((slot, index) => buildSlotHTML(slot, index)).join('');
}

function animateSlot(index) {
    const slotEl = labDesk.querySelector(`[data-slot="${index}"]`);
    if (!slotEl) return;
    slotEl.classList.add('flipping');
    setTimeout(() => slotEl.classList.remove('flipping'), 400);
}

function buildMiniTeamSlotHTML(pokemonId) {
    if (pokemonId === undefined) {
        return `<div class="mini-team-slot empty"></div>`;
    }

    const pokemon = getPokemonById(pokemonId);
    const pokemonName = getPokemonName(pokemon);
    const tooltip = `${pokemonName} (#${pokemon.id})`;
    return `
        <div class="mini-team-slot" data-tooltip="${tooltip}">
            <img class="mini-team-sprite" src="${pokemon.media.sprite}" alt="${pokemonName}">
        </div>
    `;
}

function renderTeamPanels() {
    const myTeam = isHost ? hostTeam : guestTeam;
    const opponentTeam = isHost ? guestTeam : hostTeam;

    myTeamSlots.innerHTML = Array.from({ length: 6 }, (_, i) => buildMiniTeamSlotHTML(myTeam[i])).join('');
    opponentTeamSlots.innerHTML = Array.from({ length: 6 }, (_, i) => buildMiniTeamSlotHTML(opponentTeam[i])).join('');
}

function buildShowcaseTeamHTML(team, isMine) {
    const slotsHTML = team.map((id) => {
        const pokemon = getPokemonById(id);
        const pokemonName = getPokemonName(pokemon);
        const tooltip = `${pokemonName} (#${pokemon.id})`;
        return `
            <div class="draft-slot team-slot" data-tooltip="${tooltip}">
                <img class="pokemon-sprite" src="${pokemon.media.sprite}" alt="${pokemonName}">
            </div>
        `;
    }).join('');

    return `
        <div class="showcase-team ${isMine ? 'mine' : ''}">
            <p class="showcase-team-title">${isMine ? translate('yourTeamYou') : translate('opponentTeam')}</p>
            <div class="showcase-grid">${slotsHTML}</div>
        </div>
    `;
}

function renderTeamShowcase() {
    const myTeam = isHost ? hostTeam : guestTeam;
    const opponentTeam = isHost ? guestTeam : hostTeam;

    turnInfo.textContent = translate('draftComplete');
    myTeamPanel.classList.add('hidden');
    opponentTeamPanel.classList.add('hidden');

    labDesk.classList.add('showcase');
    labDesk.innerHTML = `
        ${buildShowcaseTeamHTML(myTeam, true)}
        <div class="vs-badge"><span>VS</span></div>
        ${buildShowcaseTeamHTML(opponentTeam, false)}
    `;
}

function endDraft() {
    nextTurnBtn.classList.add('hidden');
    setDialogue('dlgDraftCompleteReady');
    renderTeamShowcase();
    exportBtn.classList.remove('hidden');
    console.log('Host team:', hostTeam.map((id) => getPokemonById(id).names.english));
    console.log('Guest team:', guestTeam.map((id) => getPokemonById(id).names.english));
}

function finalizePick(index) {
    const pokemon = getPokemonById(currentStarterIds[index].id);
    const isFinalTurn = currentTurn >= MAX_TURNS;

    renderSlots();
    animateSlot(index);
    updateTurnInfo();
    renderTeamPanels();
    setDialogue('dlgPokemonSelected', { name: getPokemonName(pokemon) });

    if (!isFinalTurn) {
        nextTurnBtn.classList.remove('hidden');
    }

    const startersAtPick = currentStarterIds;
    setTimeout(() => {
        if (currentStarterIds !== startersAtPick) return;
        allSlotsRevealed = true;
        renderSlots();

        if (isFinalTurn) {
            draftJustCompleted = true;
            nextTurnBtn.setAttribute('data-i18n', 'seeResults');
            nextTurnBtn.textContent = translate('seeResults');
            nextTurnBtn.classList.remove('hidden');
        }
    }, 800);
}

function handleSlotClick(index) {
    if (!amIPicker() || pickedSlotIndex !== null) return;

    pickedSlotIndex = index;
    const pickedId = currentStarterIds[index].id;
    addPickToTeam(pickedId, pickerIsHostThisTurn);
    finalizePick(index);

    connection.send({ type: 'pick', slotIndex: index });
}

function applyRemotePick(index) {
    pickedSlotIndex = index;
    const pickedId = currentStarterIds[index].id;
    addPickToTeam(pickedId, pickerIsHostThisTurn);
    finalizePick(index);
}

function startTurn(data) {
    currentTurn = data.turn;
    pickerIsHostThisTurn = data.pickerIsHost;
    currentStarterIds = data.starterIds;
    pickedSlotIndex = null;
    allSlotsRevealed = false;

    showGameScreen();
    roomIdBar.classList.add('hidden');
    nextTurnBtn.classList.add('hidden');
    renderSlots();
    updateTurnInfo();
    setDialogue(amIPicker() ? 'dlgChooseStarter' : 'dlgGuidePartner');
}

function renderDeceptionSlotButtons() {
    deceptionSlotButtonsContainer.querySelectorAll('.deception-slot-btn').forEach((btn) => {
        const slotIndex = Number(btn.dataset.slotIndex);
        btn.textContent = t('fakeSlotTemplate', { n: slotIndex + 1 });
        btn.classList.toggle('active', selectedLieSlotIndex === slotIndex);
    });
}

// Recomputes which slot (if any) currently carries a fake clue from the
// Guide's slot + fake Pokemon selection, then re-renders so the
// deception-target badge shows up immediately as they experiment.
function applyDeceptionSelection() {
    currentStarterIds.forEach((slot) => { slot.fakeClueId = null; });
    if (selectedLieSlotIndex !== null && selectedFakeMonId !== null) {
        currentStarterIds[selectedLieSlotIndex].fakeClueId = selectedFakeMonId;
    }
    renderDeceptionSlotButtons();
    renderSlots();
}

const deceptionAutocomplete = createPokemonAutocomplete({
    input: deceptionFakeInput,
    list: deceptionFakeSuggestions,
    getPokemonList: () => pokemonDatabase,
    getName: getPokemonName,
    getIconUrl: (pokemon) => pokemon.media.icon,
    onSelect: (pokemon) => {
        selectedFakeMonId = pokemon.id;
        applyDeceptionSelection();
    }
});

// Shows the Deception Panel to the local Guide for the turn currently
// rendered via startTurn(). onConfirm is called once they click "Confirm &
// Start Turn", whether or not they configured a lie.
function openDeceptionPanel(onConfirm) {
    selectedLieSlotIndex = null;
    selectedFakeMonId = null;
    deceptionFakeInput.value = '';
    deceptionAutocomplete.close();
    deceptionOnConfirm = onConfirm;
    renderDeceptionSlotButtons();
    deceptionPanel.classList.remove('hidden');
    nextTurnBtn.classList.add('hidden');
}

function closeDeceptionPanel() {
    deceptionPanel.classList.add('hidden');
    deceptionOnConfirm = null;
}

deceptionSlotButtonsContainer.addEventListener('click', (event) => {
    const btn = event.target.closest('.deception-slot-btn');
    if (!btn) return;
    const slotIndex = Number(btn.dataset.slotIndex);
    // Clicking the already-active slot deselects it (no lie configured).
    selectedLieSlotIndex = selectedLieSlotIndex === slotIndex ? null : slotIndex;
    applyDeceptionSelection();
});

deceptionConfirmBtn.addEventListener('click', () => {
    const onConfirm = deceptionOnConfirm;
    closeDeceptionPanel();
    if (onConfirm) onConfirm();
});

// Draws the next turn's starters, then either sends it straight to the
// Picker (Deception Mode off) or routes it through whichever peer is this
// turn's Guide so they get a chance to configure a lie first.
function beginTurn(turnData) {
    if (!gameSettings.allowLying) {
        connection.send({ type: 'turn-start', ...turnData });
        startTurn(turnData);
        return;
    }

    const hostIsGuide = !turnData.pickerIsHost;

    if (hostIsGuide) {
        // The Host is the Guide this turn: preview the real draw locally and
        // let them configure a lie before the Picker (the Guest) receives it.
        startTurn(turnData);
        openDeceptionPanel(() => {
            connection.send({ type: 'turn-start', ...turnData });
        });
        return;
    }

    // The Guest will be the Guide this turn -- send them the real draw
    // privately first and wait for their decision before starting the
    // Picker's (this Host's) turn.
    pendingPickerTurnData = turnData;
    showGameScreen();
    roomIdBar.classList.add('hidden');
    nextTurnBtn.classList.add('hidden');
    setDialogue('dlgWaitingForGuideDeception');
    connection.send({ type: 'turn-preview', ...turnData });
}

function advanceTurn() {
    const nextPickerIsHost = !pickerIsHostThisTurn;
    beginTurn({
        turn: currentTurn + 1,
        pickerIsHost: nextPickerIsHost,
        starterIds: pickRandomStarterIds(nextPickerIsHost)
    });
}

function startDraft() {
    const pickerIsHost = Math.random() < 0.5;
    beginTurn({
        turn: 1,
        pickerIsHost,
        starterIds: pickRandomStarterIds(pickerIsHost)
    });
}

labDesk.addEventListener('click', (event) => {
    const cryBtn = event.target.closest('.play-cry-btn');
    if (cryBtn) {
        if (cryBtn.disabled) return;
        new Audio(cryBtn.dataset.cryUrl).play();
        return;
    }

    const slotEl = event.target.closest('.draft-slot.clickable');
    if (!slotEl) return;
    handleSlotClick(Number(slotEl.dataset.slot));
});

nextTurnBtn.addEventListener('click', () => {
    nextTurnBtn.classList.add('hidden');

    if (draftJustCompleted) {
        endDraft();
        return;
    }

    if (isHost) {
        advanceTurn();
    } else {
        setDialogue('dlgWaitingNextTurn');
        connection.send({ type: 'request-next-turn' });
    }
});

copyIdBtn.addEventListener('click', () => {
    if (!hostRoomId) return;

    navigator.clipboard.writeText(hostRoomId)
        .then(() => {
            copyIdBtn.textContent = translate('copied');
            setTimeout(() => {
                copyIdBtn.textContent = translate('copy');
            }, 2000);
        })
        .catch((error) => {
            console.error('Failed to copy the room ID:', error);
        });
});

langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'fr' ? 'en' : 'fr';
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    updateUILanguage();
});

startDraftBtn.addEventListener('click', () => {
    const allowedGenerations = Array.from(
        generationCheckboxes.querySelectorAll('input[type="checkbox"]:checked')
    ).map((checkbox) => Number(checkbox.value));

    if (allowedGenerations.length === 0) {
        setDialogue('dlgSelectGeneration');
        return;
    }

    const legendaryMin = Number(legendaryMinInput.value);
    const legendaryMax = Number(legendaryMaxInput.value);
    const mythicalMin = Number(mythicalMinInput.value);
    const mythicalMax = Number(mythicalMaxInput.value);

    if (legendaryMin > legendaryMax) {
        window.alert(t('alertLegendaryMinMax'));
        return;
    }

    if (mythicalMin > mythicalMax) {
        window.alert(t('alertMythicalMinMax'));
        return;
    }

    const legendarySymmetrical = symmetricalLegendariesCheckbox.checked;
    const mythicalSymmetrical = symmetricalMythicalsCheckbox.checked;

    const hostLegendaryTarget = randomIntInRange(legendaryMin, legendaryMax);
    const guestLegendaryTarget = legendarySymmetrical ? hostLegendaryTarget : randomIntInRange(legendaryMin, legendaryMax);
    const hostMythicalTarget = randomIntInRange(mythicalMin, mythicalMax);
    const guestMythicalTarget = mythicalSymmetrical ? hostMythicalTarget : randomIntInRange(mythicalMin, mythicalMax);

    const newSettings = {
        allowedGenerations,
        legendaryMin,
        legendaryMax,
        legendarySymmetrical,
        mythicalMin,
        mythicalMax,
        mythicalSymmetrical,
        hostLegTurns: pickUniqueTurns(hostLegendaryTarget),
        guestLegTurns: pickUniqueTurns(guestLegendaryTarget),
        hostMythTurns: pickUniqueTurns(hostMythicalTarget),
        guestMythTurns: pickUniqueTurns(guestMythicalTarget),
        clueType: clueSelect.value,
        allowLying: allowLyingCheckbox.checked
    };

    const { legendaryPool, mythicalPool, standardPool } = getFilteredPokedex(newSettings);
    const totalLegendaryDraws = hostLegendaryTarget + guestLegendaryTarget;
    const totalMythicalDraws = hostMythicalTarget + guestMythicalTarget;
    const requiredPoolSize = MAX_TURNS * DRAFT_SIZE;
    const requiredStandardSize = requiredPoolSize - totalLegendaryDraws - totalMythicalDraws;

    if (legendaryPool.length < totalLegendaryDraws) {
        window.alert(t('alertLegendaryPoolTooSmall', { available: legendaryPool.length, needed: totalLegendaryDraws }));
        return;
    }

    if (mythicalPool.length < totalMythicalDraws) {
        window.alert(t('alertMythicalPoolTooSmall', { available: mythicalPool.length, needed: totalMythicalDraws }));
        return;
    }

    if (standardPool.length < requiredStandardSize) {
        window.alert(t('alertStandardPoolTooSmall', { needed: requiredStandardSize, available: standardPool.length }));
        return;
    }

    gameSettings = newSettings;
    connection.send({ type: 'game-settings', settings: gameSettings });
    startDraft();
});

exportBtn.addEventListener('click', () => {
    const myTeam = isHost ? hostTeam : guestTeam;
    const exportText = myTeam.map((id) => getPokemonById(id).names.english).join('\n\n');

    navigator.clipboard.writeText(exportText)
        .then(() => {
            window.alert(t('alertTeamCopied'));
        })
        .catch((error) => {
            console.error('Failed to copy the team to clipboard:', error);
            window.alert(t('alertCopyFailed'));
        });
});

function setupConnectionEvents(conn) {
    connection = conn;

    connection.on('open', () => {
        showSettingsScreen();
        setDialogue(isHost ? 'dlgConfigureSettings' : 'dlgHostConfiguring');
    });

    connection.on('data', (data) => {
        switch (data.type) {
            case 'game-settings':
                gameSettings = data.settings;
                break;
            case 'turn-start':
                startTurn(data);
                break;
            case 'pick':
                applyRemotePick(data.slotIndex);
                break;
            case 'request-next-turn':
                if (isHost) advanceTurn();
                break;
            case 'turn-preview':
                // Sent only when this peer (the Guest) will be the Guide this
                // turn under Deception Mode: preview the real draw, then let
                // them configure an optional lie before the Host's Picker
                // turn is allowed to start.
                startTurn(data);
                openDeceptionPanel(() => {
                    connection.send({
                        type: 'deception-config',
                        lieSlotIndex: selectedLieSlotIndex,
                        fakeMonId: selectedFakeMonId
                    });
                });
                break;
            case 'deception-config':
                // Sent only to the Host, who is waiting to start their own
                // Picker turn once the Guest (Guide) has decided on a lie.
                if (pendingPickerTurnData) {
                    if (data.lieSlotIndex !== null && data.fakeMonId !== null) {
                        pendingPickerTurnData.starterIds[data.lieSlotIndex].fakeClueId = data.fakeMonId;
                    }
                    connection.send({ type: 'turn-start', ...pendingPickerTurnData });
                    startTurn(pendingPickerTurnData);
                    pendingPickerTurnData = null;
                }
                break;
            default:
                console.warn('Unknown message type received:', data.type);
        }
    });

    connection.on('close', () => {
        setDialogue('dlgPlayerDisconnected');
    });

    connection.on('error', (error) => {
        console.error('Connection error:', error);
        setDialogue('dlgConnectionError');
    });
}

function hostGame() {
    if (pokemonDatabase.length === 0) {
        setDialogue('dlgLoading');
        return;
    }

    isHost = true;
    peer = new Peer();

    peer.on('open', (id) => {
        console.log('Host Peer ID:', id);
        hostRoomId = id;
        setDialogue('dlgRoomCreated', { id });
        showGameScreen();
        roomIdText.textContent = t('roomIdLabel', { id });
        roomIdBar.classList.remove('hidden');
    });

    peer.on('connection', (conn) => {
        setDialogue('dlgPlayerJoined');
        setupConnectionEvents(conn);
    });

    peer.on('error', (error) => {
        console.error('Peer error:', error);
        setDialogue('dlgConnectionError');
    });
}

function joinGame(roomId) {
    if (pokemonDatabase.length === 0) {
        setDialogue('dlgLoading');
        return;
    }

    isHost = false;
    peer = new Peer();

    peer.on('open', () => {
        console.log('Guest Peer ID:', peer.id);
        setDialogue('dlgConnectingToHost');
        showGameScreen();

        const conn = peer.connect(roomId);
        setupConnectionEvents(conn);
    });

    peer.on('error', (error) => {
        console.error('Peer error:', error);
        setDialogue('dlgConnectionError');
    });
}

hostBtn.addEventListener('click', () => {
    hostGame();
});

joinBtn.addEventListener('click', () => {
    joinForm.classList.remove('hidden');
});

joinConfirmBtn.addEventListener('click', () => {
    const roomId = joinRoomInput.value.trim();
    if (roomId) {
        joinGame(roomId);
    }
});

updateUILanguage();
loadPokemonDatabase();
