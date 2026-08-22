// app.js

const DRAFT_SIZE = 3;
const MAX_TURNS = 12;

let pokemonDatabase = [];
let peer = null;
let connection = null;
let isHost = false;

// Draft state, mirrored on both peers
let currentTurn = 0;
let pickerIsHostThisTurn = null;
let currentStarterIds = [];
let pickedSlotIndex = null;
let hostTeam = [];
let guestTeam = [];

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const dialogueText = document.getElementById('dialogue-text');
const nextTurnBtn = document.getElementById('next-turn-btn');
const turnInfo = document.getElementById('turn-info');
const labDesk = document.getElementById('lab-desk');

const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const joinForm = document.getElementById('join-form');
const joinRoomInput = document.getElementById('join-room-input');
const joinConfirmBtn = document.getElementById('join-confirm-btn');

function setDialogue(message) {
    dialogueText.textContent = message;
}

function showGameScreen() {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
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

function formatTypes(types) {
    return types.map((type) => type.charAt(0).toUpperCase() + type.slice(1)).join(' / ');
}

function pickRandomStarterIds(count) {
    const draftedIds = new Set([...hostTeam, ...guestTeam]);
    const available = pokemonDatabase.filter((pokemon) => !draftedIds.has(pokemon.id));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((pokemon) => pokemon.id);
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

    return `
        <div class="slot-wrapper">
            <div class="${slotClasses.join(' ')}" data-slot="${index}">
                <div class="pokeball-icon"></div>
            </div>
            <p class="slot-types-label">${formatTypes(pokemon.types)}</p>
        </div>
    `;
}

function renderSlots() {
    labDesk.innerHTML = currentStarterIds.map((id, index) => buildSlotHTML(id, index)).join('');
}

function animateSlot(index) {
    const slotEl = labDesk.querySelector(`[data-slot="${index}"]`);
    if (!slotEl) return;
    slotEl.classList.add('flipping');
    setTimeout(() => slotEl.classList.remove('flipping'), 400);
}

function endDraft() {
    nextTurnBtn.classList.add('hidden');
    setDialogue('Draft complete! Check the console for the final teams.');
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

function setupConnectionEvents(conn) {
    connection = conn;

    connection.on('open', () => {
        if (isHost) {
            setDialogue('Connected! Starting the draft...');
            const turnData = {
                turn: 1,
                pickerIsHost: Math.random() < 0.5,
                starterIds: pickRandomStarterIds(DRAFT_SIZE)
            };
            connection.send({ type: 'turn-start', ...turnData });
            startTurn(turnData);
        } else {
            setDialogue('Connected! Waiting for the host to start the draft...');
        }
    });

    connection.on('data', (data) => {
        switch (data.type) {
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
        setDialogue(`Room created! Share this ID with your friend: ${id}`);
        showGameScreen();
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
