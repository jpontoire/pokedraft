// app.js

const START_SCALE = 20;
const MIN_SCALE = 1;
const SCALE_STEP = 4;

let pokemonDatabase = [];
let currentPokemon = null;
let currentScale = START_SCALE;

const spriteImage = document.getElementById('sprite-image');
const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');
const pokemonNamesList = document.getElementById('pokemon-names');
const nextBtn = document.getElementById('next-btn');
const dialogueText = document.getElementById('dialogue-text');

function setDialogue(message) {
    dialogueText.textContent = message;
}

function populateNamesDatalist() {
    pokemonNamesList.innerHTML = pokemonDatabase
        .map((pokemon) => `<option value="${pokemon.names.english}"></option>`)
        .join('');
}

function pickRandomPokemon() {
    const index = Math.floor(Math.random() * pokemonDatabase.length);
    return pokemonDatabase[index];
}

function applyScale(animate = true) {
    if (!animate) {
        spriteImage.style.transition = 'none';
        spriteImage.style.transform = `scale(${currentScale})`;
        // Force a reflow so the transition-less scale is applied immediately,
        // before transitions are re-enabled for the next (zoom-out) change.
        void spriteImage.offsetWidth;
        spriteImage.style.transition = '';
        return;
    }

    spriteImage.style.transform = `scale(${currentScale})`;
}

function startNewRound() {
    currentPokemon = pickRandomPokemon();
    currentScale = START_SCALE;

    spriteImage.src = currentPokemon.media.sprite;
    spriteImage.alt = 'Mystery Pokemon';
    applyScale(false);

    guessInput.value = '';
    guessForm.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    guessInput.focus();

    setDialogue("Who's that Pokemon? Zoom in and guess!");
}

function handleWrongGuess() {
    currentScale = Math.max(MIN_SCALE, currentScale - SCALE_STEP);
    applyScale();
    guessInput.value = '';
    guessInput.focus();
    setDialogue('Wrong! The camera zooms out...');
}

function handleCorrectGuess() {
    currentScale = MIN_SCALE;
    applyScale();
    spriteImage.alt = currentPokemon.names.english;

    guessForm.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    setDialogue(`Correct! It's ${currentPokemon.names.english}!`);
}

async function loadPokemonDatabase() {
    try {
        const response = await fetch('../data/pokemon.json');
        pokemonDatabase = await response.json();
        populateNamesDatalist();
        startNewRound();
    } catch (error) {
        console.error('Failed to load Pokemon database:', error);
        setDialogue('Error: could not load the Pokemon database.');
    }
}

guessForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const guess = guessInput.value.trim().toLowerCase();
    if (!guess || !currentPokemon) return;

    if (guess === currentPokemon.names.english.toLowerCase()) {
        handleCorrectGuess();
    } else {
        handleWrongGuess();
    }
});

nextBtn.addEventListener('click', () => {
    startNewRound();
});

loadPokemonDatabase();
