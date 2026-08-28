// app.js

const LANG_STORAGE_KEY = 'pokedraft-lang';
const i18n = Object.assign({}, sharedI18n, pageI18n);

// Maps short language codes (matching currentLang) to the dataset's key names.
const LANG_DATA_KEYS = { en: 'english', fr: 'french' };

// Palette extraction tuning.
const BIN_STEP = 24; // quantization step for the initial color histogram pass
const CLUSTER_THRESHOLD = 40; // Euclidean RGB distance below which two bins are merged into one cluster
const MAX_COLORS = 8; // upper bound on dominant colors kept in the final palette

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'fr';
let pokemonDatabase = [];
let currentPokemon = null;
let roundOutcome = null;

const paletteContainer = document.getElementById('palette-container');
const spriteContainer = document.getElementById('sprite-container');
const spriteImage = document.getElementById('sprite-image');
const extractionCanvas = document.getElementById('extraction-canvas');
const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');
const guessSuggestions = document.getElementById('guess-suggestions');
const nextBtn = document.getElementById('next-btn');
const dialogueText = document.getElementById('dialogue-text');
const langToggleBtn = document.getElementById('lang-toggle');
const skipBtn = document.getElementById('skip-btn');

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

function revealAnswer() {
    spriteImage.src = currentPokemon.media.sprite;
    spriteImage.alt = getPokemonName(currentPokemon);
    spriteContainer.classList.remove('hidden');

    guessForm.classList.add('hidden');
    nextBtn.classList.remove('hidden');
}

function handleSkip() {
    roundOutcome = 'skipped';
    revealAnswer();
    setDialogue('dlgSkipped', { name: getPokemonName(currentPokemon) });
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

    if (currentPokemon && roundOutcome === 'correct') {
        setDialogue('dlgCorrect', { name: getPokemonName(currentPokemon) });
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

// Groups the image's non-transparent pixels into a small set of dominant
// colors. Two passes keep this fast even on larger sprites:
//   1. A histogram pass buckets pixels onto a coarse RGB grid (BIN_STEP),
//      so near-identical shades collapse into a handful of bins instead of
//      thousands of unique colors.
//   2. A clustering pass greedily merges bins that are still close together
//      (Euclidean distance in RGB space, within CLUSTER_THRESHOLD) into the
//      final dominant-color clusters.
function extractDominantColors(imageData) {
    const { data } = imageData;
    const bins = new Map();
    let totalPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha === 0) continue;

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        totalPixels += 1;

        const key = `${Math.round(r / BIN_STEP)}_${Math.round(g / BIN_STEP)}_${Math.round(b / BIN_STEP)}`;
        const bin = bins.get(key);
        if (bin) {
            bin.sumR += r;
            bin.sumG += g;
            bin.sumB += b;
            bin.count += 1;
        } else {
            bins.set(key, { sumR: r, sumG: g, sumB: b, count: 1 });
        }
    }

    if (totalPixels === 0) {
        return [];
    }

    const clusters = [];

    bins.forEach((bin) => {
        const r = bin.sumR / bin.count;
        const g = bin.sumG / bin.count;
        const b = bin.sumB / bin.count;

        const nearest = clusters.find((cluster) => {
            const dr = cluster.r - r;
            const dg = cluster.g - g;
            const db = cluster.b - b;
            return Math.sqrt((dr * dr) + (dg * dg) + (db * db)) <= CLUSTER_THRESHOLD;
        });

        if (nearest) {
            nearest.sumR += bin.sumR;
            nearest.sumG += bin.sumG;
            nearest.sumB += bin.sumB;
            nearest.count += bin.count;
            nearest.r = nearest.sumR / nearest.count;
            nearest.g = nearest.sumG / nearest.count;
            nearest.b = nearest.sumB / nearest.count;
        } else {
            clusters.push({ r, g, b, sumR: bin.sumR, sumG: bin.sumG, sumB: bin.sumB, count: bin.count });
        }
    });

    return clusters
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_COLORS)
        .map((cluster) => ({
            r: Math.round(cluster.r),
            g: Math.round(cluster.g),
            b: Math.round(cluster.b),
            percentage: (cluster.count / totalPixels) * 100
        }));
}

// Loads a Pokemon's sprite into an off-screen canvas and extracts its
// dominant colors. crossOrigin must be set before src for the CORS-enabled
// fetch to happen and keep the canvas readable (untainted).
function loadPaletteForPokemon(pokemon) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';

        img.onload = () => {
            try {
                extractionCanvas.width = img.naturalWidth;
                extractionCanvas.height = img.naturalHeight;
                const ctx = extractionCanvas.getContext('2d');
                ctx.clearRect(0, 0, extractionCanvas.width, extractionCanvas.height);
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, extractionCanvas.width, extractionCanvas.height);
                resolve(extractDominantColors(imageData));
            } catch (error) {
                reject(error);
            }
        };

        img.onerror = () => reject(new Error('Failed to load the sprite image.'));
        img.src = pokemon.media.sprite;
    });
}

function renderPalette(colors) {
    paletteContainer.innerHTML = '';
    colors.forEach((color) => {
        const stripe = document.createElement('div');
        stripe.className = 'palette-stripe';
        stripe.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
        stripe.style.height = `${color.percentage}%`;
        paletteContainer.appendChild(stripe);
    });
}

async function startNewRound() {
    currentPokemon = pickRandomPokemon();
    roundOutcome = null;

    spriteContainer.classList.add('hidden');
    spriteImage.src = '';
    paletteContainer.innerHTML = '';

    guessInput.value = '';
    guessForm.classList.remove('hidden');
    nextBtn.classList.add('hidden');

    setDialogue('dlgExtracting');

    try {
        const colors = await loadPaletteForPokemon(currentPokemon);
        renderPalette(colors);
        setDialogue('dlgPrompt');
        guessInput.focus();
    } catch (error) {
        console.error('Failed to extract the color palette:', error);
        setDialogue('dlgExtractionError');
    }
}

function isGuessCorrect(guess) {
    const normalizedGuess = guess.trim().toLowerCase();
    return Object.values(LANG_DATA_KEYS)
        .some((key) => currentPokemon.names[key].toLowerCase() === normalizedGuess);
}

function handleCorrectGuess() {
    roundOutcome = 'correct';
    spriteImage.src = currentPokemon.media.sprite;
    spriteImage.alt = getPokemonName(currentPokemon);
    spriteContainer.classList.remove('hidden');

    guessForm.classList.add('hidden');
    nextBtn.classList.remove('hidden');
    setDialogue('dlgCorrect', { name: getPokemonName(currentPokemon) });
}

function handleWrongGuess() {
    guessInput.value = '';
    guessInput.focus();
    setDialogue('dlgWrong');
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

guessForm.addEventListener('submit', (event) => {
    event.preventDefault();
    autocomplete.close();

    const guess = guessInput.value.trim();
    if (!guess || !currentPokemon) return;

    if (isGuessCorrect(guess)) {
        handleCorrectGuess();
    } else {
        handleWrongGuess();
    }
});

nextBtn.addEventListener('click', () => {
    startNewRound();
});

skipBtn.addEventListener('click', () => {
    if (!currentPokemon || roundOutcome) return;
    autocomplete.close();
    handleSkip();
});

langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'fr' ? 'en' : 'fr';
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
    updateUILanguage();
});

updateUILanguage();
loadPokemonDatabase();
