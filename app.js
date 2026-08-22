const DRAFT_SIZE = 3;

let pokemonDatabase = [];
let peer = null;
let connection = null;
let isHost = false;

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const dialogueText = document.getElementById('dialogue-text');

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

function pickRandomStarterIds(count) {
    const shuffled = [...pokemonDatabase].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(pokemon => pokemon.id);
}

function setupConnectionEvents(conn) {
    connection = conn;

    connection.on('open', () => {
        setDialogue('Connected! Preparing the draft...');

        if (isHost) {
            const starterIds = pickRandomStarterIds(DRAFT_SIZE);
            console.log('Host selected starter Pokemon IDs:', starterIds);
            connection.send({ type: 'draft', starterIds });
        }
    });

    connection.on('data', (data) => {
        if (data.type === 'draft') {
            console.log('Guest received starter Pokemon IDs:', data.starterIds);
            setDialogue('Choose your starter!');
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
