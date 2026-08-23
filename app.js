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
let allSlotsRevealed = false;
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
const myTeamPanel = document.getElementById('my-team-panel');
const opponentTeamPanel = document.getElementById('opponent-team-panel');
const myTeamSlots = document.getElementById('my-team-slots');
const opponentTeamSlots = document.getElementById('opponent-team-slots');
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
const legendaryMinInput = document.getElementById('legendary-min');
const legendaryMaxInput = document.getElementById('legendary-max');
const symmetricalLegendariesCheckbox = document.getElementById('symmetrical-legendaries');
const mythicalMinInput = document.getElementById('mythical-min');
const mythicalMaxInput = document.getElementById('mythical-max');
const symmetricalMythicalsCheckbox = document.getElementById('symmetrical-mythicals');
const clueSelect = document.getElementById('clue-select');
const startDraftBtn = document.getElementById('start-draft-btn');

function setDialogue(message) {
    dialogueText.textContent = message;
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

    return shuffle(drawn).map((pokemon) => pokemon.id);
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
        case 'total_stats': {
            const { hp, attack, defense, special_attack, special_defense, speed } = pokemon.stats;
            return `Base Stat Total: ${hp + attack + defense + special_attack + special_defense + speed}`;
        }
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

function buildCryClueHTML(pokemon) {
    if (!pokemon.media.cry) {
        return `<button type="button" class="pixel-btn small-btn play-cry-btn" disabled>Audio corrupted</button>`;
    }
    return `<button type="button" class="pixel-btn small-btn play-cry-btn" data-cry-url="${pokemon.media.cry}">[ ▶ Play Cry ]</button>`;
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
    const role = amIPicker() ? 'Blind Picker' : 'Guide';
    turnInfo.textContent = `Turn ${currentTurn} / ${MAX_TURNS} — You are the ${role}`;
}

function buildSlotHTML(pokemonId, index) {
    const pokemon = getPokemonById(pokemonId);
    const wasPickedHere = pickedSlotIndex === index;
    const wasPassedOver = allSlotsRevealed && pickedSlotIndex !== null && !wasPickedHere;
    const isRevealed = !amIPicker() || wasPickedHere || allSlotsRevealed;
    const isClickable = amIPicker() && pickedSlotIndex === null;

    const slotClasses = ['draft-slot'];
    if (isClickable) slotClasses.push('clickable');
    if (wasPickedHere) slotClasses.push('selected');
    if (wasPassedOver) slotClasses.push('not-chosen');

    const clueHTML = buildClueHTML(pokemon);

    if (isRevealed) {
        const tooltip = `${pokemon.names.english} (#${pokemon.id})`;
        return `
            <div class="slot-wrapper">
                <div class="${slotClasses.join(' ')}" data-slot="${index}" data-tooltip="${tooltip}">
                    <img class="pokemon-sprite" src="${pokemon.media.sprite}" alt="${pokemon.names.english}">
                </div>
                ${wasPickedHere ? clueHTML : ''}
                ${wasPassedOver ? '<p class="slot-clue-label not-chosen-label">Not Chosen</p>' : ''}
            </div>
        `;
    }

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
    labDesk.innerHTML = currentStarterIds.map((id, index) => buildSlotHTML(id, index)).join('');
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
    const tooltip = `${pokemon.names.english} (#${pokemon.id})`;
    return `
        <div class="mini-team-slot" data-tooltip="${tooltip}">
            <img class="mini-team-sprite" src="${pokemon.media.sprite}" alt="${pokemon.names.english}">
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
        const tooltip = `${pokemon.names.english} (#${pokemon.id})`;
        return `
            <div class="draft-slot team-slot" data-tooltip="${tooltip}">
                <img class="pokemon-sprite" src="${pokemon.media.sprite}" alt="${pokemon.names.english}">
            </div>
        `;
    }).join('');

    return `
        <div class="showcase-team ${isMine ? 'mine' : ''}">
            <p class="showcase-team-title">${isMine ? 'Your Team (You)' : 'Opponent Team'}</p>
            <div class="showcase-grid">${slotsHTML}</div>
        </div>
    `;
}

function renderTeamShowcase() {
    const myTeam = isHost ? hostTeam : guestTeam;
    const opponentTeam = isHost ? guestTeam : hostTeam;

    turnInfo.textContent = 'Draft complete!';
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
    renderTeamPanels();
    setDialogue(`${pokemon.names.english} was selected!`);

    if (currentTurn >= MAX_TURNS) {
        endDraft();
        return;
    }

    nextTurnBtn.classList.remove('hidden');

    const startersAtPick = currentStarterIds;
    setTimeout(() => {
        if (currentStarterIds !== startersAtPick) return;
        allSlotsRevealed = true;
        renderSlots();
    }, 800);
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
    allSlotsRevealed = false;

    showGameScreen();
    nextTurnBtn.classList.add('hidden');
    renderSlots();
    updateTurnInfo();
    setDialogue(amIPicker() ? 'Choose your starter!' : 'Guide your partner to the best pick!');
}

function advanceTurn() {
    const nextPickerIsHost = !pickerIsHostThisTurn;
    const turnData = {
        turn: currentTurn + 1,
        pickerIsHost: nextPickerIsHost,
        starterIds: pickRandomStarterIds(nextPickerIsHost)
    };

    connection.send({ type: 'turn-start', ...turnData });
    startTurn(turnData);
}

function startDraft() {
    const pickerIsHost = Math.random() < 0.5;
    const turnData = {
        turn: 1,
        pickerIsHost,
        starterIds: pickRandomStarterIds(pickerIsHost)
    };

    connection.send({ type: 'turn-start', ...turnData });
    startTurn(turnData);
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

    const legendaryMin = Number(legendaryMinInput.value);
    const legendaryMax = Number(legendaryMaxInput.value);
    const mythicalMin = Number(mythicalMinInput.value);
    const mythicalMax = Number(mythicalMaxInput.value);

    if (legendaryMin > legendaryMax) {
        window.alert('Invalid settings! Min Legendaries cannot be greater than Max Legendaries.');
        return;
    }

    if (mythicalMin > mythicalMax) {
        window.alert('Invalid settings! Min Mythicals cannot be greater than Max Mythicals.');
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
        clueType: clueSelect.value
    };

    const { legendaryPool, mythicalPool, standardPool } = getFilteredPokedex(newSettings);
    const totalLegendaryDraws = hostLegendaryTarget + guestLegendaryTarget;
    const totalMythicalDraws = hostMythicalTarget + guestMythicalTarget;
    const requiredPoolSize = MAX_TURNS * DRAFT_SIZE;
    const requiredStandardSize = requiredPoolSize - totalLegendaryDraws - totalMythicalDraws;

    if (legendaryPool.length < totalLegendaryDraws) {
        window.alert(`Invalid settings! Your generation filter only leaves ${legendaryPool.length} Legendary Pokémon, but ${totalLegendaryDraws} are needed to guarantee both players' picks.`);
        return;
    }

    if (mythicalPool.length < totalMythicalDraws) {
        window.alert(`Invalid settings! Your generation filter only leaves ${mythicalPool.length} Mythical Pokémon, but ${totalMythicalDraws} are needed to guarantee both players' picks.`);
        return;
    }

    if (standardPool.length < requiredStandardSize) {
        window.alert(`Invalid settings! You need at least ${requiredStandardSize} standard Pokémon to complete the draft. Your current settings only leave ${standardPool.length} available.`);
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
