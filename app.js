// app.js

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
let hostTeam = [];
let guestTeam = [];
let hostRoomId = null;

const lobbyScreen = document.getElementById('lobby-screen');
const settingsScreen = document.getElementById('settings-screen');
const gameScreen = document.getElementById('game-screen');
const dialogueText = document.getElementById('dialogue-text');
const nextTurnBtn = document.getElementById('next-turn-btn');
const exportBtn = document.getElementById('export-btn');
const turnInfo = document.getElementById('turn-info');
const labDesk = document.getElementById('lab-desk');
const roomIdBar = document.getElementById('room-id-bar');
const roomIdText = document.getElementById('room-id-text');
const copyIdBtn = document.getElementById('copy-id-btn');

const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const joinForm = document.getElementById('join-form');
const joinRoomInput = document.getElementById('join-room-input');
const joinConfirmBtn = document.getElementById('join-confirm-btn');

const hostSettingsForm = document.getElementById('host-settings-form');
const guestSettingsLoading = document.getElementById('guest-settings-loading');
const generationCheckboxes = document.getElementById('generation-checkboxes');
const allowLegendariesCheckbox = document.getElementById('allow-legendaries');
const allowMythicalsCheckbox = document.getElementById('allow-mythicals');
const clueSelect = document.getElementById('clue-select');
const startDraftBtn = document.getElementById('start-draft-btn');

function setDialogue(message) {
    dialogueText.textContent = message;
}

function showGameScreen() {
    lobbyScreen.classList.add('hidden');
    settingsScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
}

function showSettingsScreen() {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    settingsScreen.classList.remove('hidden');

    hostSettingsForm.classList.toggle('hidden', !isHost);
    guestSettingsLoading.classList.toggle('hidden', isHost);
}

async function loadPokemonDatabase() {
    try {
        const response = await fetch('./data/pokemon.json');
        pokemonDatabase = await response.json();
        console.log(`Loaded ${pokemonDatabase.length} Pokemon from the database.`);
    } catch (error) {
        console.error('Failed to load Pokemon database:', error);
        setDialogue('Error: could not load the Pokemon database.');
    }
}

function getPokemonById(id) {
    return pokemonDatabase.find((pokemon) => pokemon.id === id);
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatTypes(types) {
    return types.map(capitalize).join(' / ');
}

function getGeneration(pokemonId) {
    const range = GENERATION_RANGES.find((r) => pokemonId >= r.min && pokemonId <= r.max);
    return range ? range.gen : null;
}

function getFilteredPokedex(settings) {
    return pokemonDatabase.filter((pokemon) => {
        if (!settings.allowedGenerations.includes(getGeneration(pokemon.id))) return false;
        if (pokemon.attributes.is_legendary && !settings.allowLegendaries) return false;
        if (pokemon.attributes.is_mythical && !settings.allowMythicals) return false;
        return true;
    });
}

function pickRandomStarterIds(count) {
    const draftedIds = new Set([...hostTeam, ...guestTeam]);
    const filteredPokedex = getFilteredPokedex(gameSettings);
    const available = filteredPokedex.filter((pokemon) => !draftedIds.has(pokemon.id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((pokemon) => pokemon.id);
}

function getClueText(pokemon) {
    switch (gameSettings.clueType) {
        case 'color':
            return capitalize(pokemon.attributes.color);
        case 'shape':
            return capitalize(pokemon.attributes.shape);
        case 'height_weight':
            return `Height: ${(pokemon.attributes.height / 10).toFixed(1)}m / Weight: ${(pokemon.attributes.weight / 10).toFixed(1)}kg`;
        case 'pokedex_num':
            return `#${String(pokemon.id).padStart(4, '0')}`;
        case 'types':
        default:
            return formatTypes(pokemon.types);
    }
}

function getStatTier(value) {
    if (value < 75) return 'low';
    if (value <= 110) return 'mid';
    return 'high';
}

function buildStatBarsHTML(pokemon) {
    const statRows = [
        { label: 'HP', value: pokemon.stats.hp },
        { label: 'Attack', value: pokemon.stats.attack },
        { label: 'Defense', value: pokemon.stats.defense },
        { label: 'Sp. Atk', value: pokemon.stats.special_attack },
        { label: 'Sp. Def', value: pokemon.stats.special_defense },
        { label: 'Speed', value: pokemon.stats.speed }
    ];

    const rowsHTML = statRows.map((stat) => {
        const widthPercent = Math.min((stat.value / 255) * 100, 100);
        return `
            <div class="stat-row">
                <span class="stat-label">${stat.label}</span>
                <span class="stat-value">${stat.value}</span>
                <div class="stat-bar-track">
                    <div class="stat-bar-fill stat-${getStatTier(stat.value)}" style="width: ${widthPercent}%"></div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="stat-block">
            <p class="stat-block-title">Base Stats</p>
            ${rowsHTML}
        </div>
    `;
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
    const role = amIPicker() ? 'Blind Picker' : 'Guide';
    turnInfo.textContent = `Turn ${currentTurn} / ${MAX_TURNS} — You are the ${role}`;
}

function buildSlotHTML(pokemonId, index) {
    const pokemon = getPokemonById(pokemonId);
    const isRevealed = !amIPicker() || pickedSlotIndex === index;
    const isClickable = amIPicker() && pickedSlotIndex === null;

    const slotClasses = ['draft-slot'];
    if (isClickable) slotClasses.push('clickable');
    if (pickedSlotIndex === index) slotClasses.push('selected');

    if (isRevealed) {
        const tooltip = `${pokemon.names.english} (#${pokemon.id})`;
        return `
            <div class="slot-wrapper">
                <div class="${slotClasses.join(' ')}" data-slot="${index}" data-tooltip="${tooltip}">
                    <img class="pokemon-sprite" src="${pokemon.media.sprite}" alt="${pokemon.names.english}">
                </div>
            </div>
        `;
    }

    const clueHTML = gameSettings.clueType === 'base_stats'
        ? buildStatBarsHTML(pokemon)
        : `<p class="slot-clue-label">${getClueText(pokemon)}</p>`;

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
    labDesk.classList.remove('team-grid');
    labDesk.innerHTML = currentStarterIds.map((id, index) => buildSlotHTML(id, index)).join('');
}

function animateSlot(index) {
    const slotEl = labDesk.querySelector(`[data-slot="${index}"]`);
    if (!slotEl) return;
    slotEl.classList.add('flipping');
    setTimeout(() => slotEl.classList.remove('flipping'), 400);
}

function renderTeamShowcase() {
    const myTeam = isHost ? hostTeam : guestTeam;
    turnInfo.textContent = 'Draft complete! Here is your team:';
    labDesk.classList.add('team-grid');
    labDesk.innerHTML = myTeam.map((id) => {
        const pokemon = getPokemonById(id);
        const tooltip = `${pokemon.names.english} (#${pokemon.id})`;
        return `
            <div class="slot-wrapper">
                <div class="draft-slot team-slot" data-tooltip="${tooltip}">
                    <img class="pokemon-sprite" src="${pokemon.media.sprite}" alt="${pokemon.names.english}">
                </div>
            </div>
        `;
    }).join('');
}

function endDraft() {
    nextTurnBtn.classList.add('hidden');
    setDialogue('Draft complete! Your team is ready.');
    renderTeamShowcase();
    exportBtn.classList.remove('hidden');
    console.log('Host team:', hostTeam.map((id) => getPokemonById(id).names.english));
    console.log('Guest team:', guestTeam.map((id) => getPokemonById(id).names.english));
}

function finalizePick(index) {
    const pokemon = getPokemonById(currentStarterIds[index]);
    renderSlots();
    animateSlot(index);
    updateTurnInfo();
    setDialogue(`${pokemon.names.english} was selected!`);

    if (currentTurn >= MAX_TURNS) {
        endDraft();
    } else {
        nextTurnBtn.classList.remove('hidden');
    }
}

function handleSlotClick(index) {
    if (!amIPicker() || pickedSlotIndex !== null) return;

    pickedSlotIndex = index;
    const pickedId = currentStarterIds[index];
    addPickToTeam(pickedId, pickerIsHostThisTurn);
    finalizePick(index);

    connection.send({ type: 'pick', slotIndex: index });
}

function applyRemotePick(index) {
    pickedSlotIndex = index;
    const pickedId = currentStarterIds[index];
    addPickToTeam(pickedId, pickerIsHostThisTurn);
    finalizePick(index);
}

function startTurn(data) {
    currentTurn = data.turn;
    pickerIsHostThisTurn = data.pickerIsHost;
    currentStarterIds = data.starterIds;
    pickedSlotIndex = null;

    showGameScreen();
    nextTurnBtn.classList.add('hidden');
    renderSlots();
    updateTurnInfo();
    setDialogue(amIPicker() ? 'Choose your starter!' : 'Guide your partner to the best pick!');
}

function advanceTurn() {
    const turnData = {
        turn: currentTurn + 1,
        pickerIsHost: !pickerIsHostThisTurn,
        starterIds: pickRandomStarterIds(DRAFT_SIZE)
    };

    connection.send({ type: 'turn-start', ...turnData });
    startTurn(turnData);
}

function startDraft() {
    const turnData = {
        turn: 1,
        pickerIsHost: Math.random() < 0.5,
        starterIds: pickRandomStarterIds(DRAFT_SIZE)
    };

    connection.send({ type: 'turn-start', ...turnData });
    startTurn(turnData);
}

labDesk.addEventListener('click', (event) => {
    const slotEl = event.target.closest('.draft-slot.clickable');
    if (!slotEl) return;
    handleSlotClick(Number(slotEl.dataset.slot));
});

nextTurnBtn.addEventListener('click', () => {
    nextTurnBtn.classList.add('hidden');

    if (isHost) {
        advanceTurn();
    } else {
        setDialogue('Waiting for the next turn...');
        connection.send({ type: 'request-next-turn' });
    }
});

copyIdBtn.addEventListener('click', () => {
    if (!hostRoomId) return;

    navigator.clipboard.writeText(hostRoomId)
        .then(() => {
            copyIdBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyIdBtn.textContent = 'Copy';
            }, 2000);
        })
        .catch((error) => {
            console.error('Failed to copy the room ID:', error);
        });
});

startDraftBtn.addEventListener('click', () => {
    const allowedGenerations = Array.from(
        generationCheckboxes.querySelectorAll('input[type="checkbox"]:checked')
    ).map((checkbox) => Number(checkbox.value));

    if (allowedGenerations.length === 0) {
        setDialogue('Select at least one generation to continue.');
        return;
    }

    const newSettings = {
        allowedGenerations,
        allowLegendaries: allowLegendariesCheckbox.checked,
        allowMythicals: allowMythicalsCheckbox.checked,
        clueType: clueSelect.value
    };

    const filteredPool = getFilteredPokedex(newSettings);
    const requiredPoolSize = MAX_TURNS * DRAFT_SIZE;
    if (filteredPool.length < requiredPoolSize) {
        window.alert(`Invalid settings! You need at least ${requiredPoolSize} Pokémon to complete the draft. Your current settings only leave ${filteredPool.length} available Pokémon.`);
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
            alert('Team copied to clipboard!');
        })
        .catch((error) => {
            console.error('Failed to copy the team to clipboard:', error);
            alert('Could not copy the team. Please try again.');
        });
});

function setupConnectionEvents(conn) {
    connection = conn;

    connection.on('open', () => {
        showSettingsScreen();
        setDialogue(isHost ? 'Configure the game settings, then start the draft.' : 'Host is configuring game settings...');
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
            default:
                console.warn('Unknown message type received:', data.type);
        }
    });

    connection.on('close', () => {
        setDialogue('The other player disconnected.');
    });

    connection.on('error', (error) => {
        console.error('Connection error:', error);
        setDialogue('A connection error occurred.');
    });
}

function hostGame() {
    if (pokemonDatabase.length === 0) {
        setDialogue('Still loading the Pokemon database, please wait...');
        return;
    }

    isHost = true;
    peer = new Peer();

    peer.on('open', (id) => {
        console.log('Host Peer ID:', id);
        hostRoomId = id;
        setDialogue(`Room created! Share this ID with your friend: ${id}`);
        showGameScreen();
        roomIdText.textContent = `Room ID: ${id}`;
        roomIdBar.classList.remove('hidden');
    });

    peer.on('connection', (conn) => {
        setDialogue('Player joined! Establishing connection...');
        setupConnectionEvents(conn);
    });

    peer.on('error', (error) => {
        console.error('Peer error:', error);
        setDialogue('A connection error occurred.');
    });
}

function joinGame(roomId) {
    if (pokemonDatabase.length === 0) {
        setDialogue('Still loading the Pokemon database, please wait...');
        return;
    }

    isHost = false;
    peer = new Peer();

    peer.on('open', () => {
        console.log('Guest Peer ID:', peer.id);
        setDialogue('Connecting to host...');
        showGameScreen();

        const conn = peer.connect(roomId);
        setupConnectionEvents(conn);
    });

    peer.on('error', (error) => {
        console.error('Peer error:', error);
        setDialogue('A connection error occurred.');
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

loadPokemonDatabase();
