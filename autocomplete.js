// autocomplete.js
// Reusable custom autocomplete dropdown for Pokemon name search inputs,
// used by every guessing mini-game in place of a native <datalist>.
// Loaded before each page's own app.js.

// config:
//   input        - the text <input> element
//   list         - the <ul> element the dropdown items are rendered into
//   getPokemonList() - returns the current array of Pokemon to search
//   getName(pokemon) - returns the (already translated) display name
//   getIconUrl(pokemon) - returns the icon sprite URL
//   onSelect(pokemon) - called when an item is chosen (click, or Enter on a
//                       highlighted item)
//   maxResults   - how many matches to show at once (default 8)
// Must match .autocomplete-icon-wrap's width/height in style.css.
const ICON_BOX_SIZE = 32;
// Shrinks the fitted crop slightly so it doesn't touch the box edges.
const ICON_CROP_PADDING = 0.85;

// The icon sheet PokeAPI serves isn't tightly cropped: each Pokemon's actual
// artwork occupies a small, inconsistently-positioned corner of a much
// larger transparent canvas (bottom-anchored, but with a top margin that
// varies from ~4px for long Pokemon like Onix to ~36px for round ones like
// Zorua). Centering the whole canvas in a fixed box therefore makes most
// icons look tiny and shifted downward. Instead, each icon's actual pixel
// content bounding box is read once via canvas and cached by URL, then used
// to size/position the <img> so the artwork itself fills its box.
const iconLayoutCache = new Map();

function computeIconLayout(iconUrl) {
    if (iconLayoutCache.has(iconUrl)) {
        return iconLayoutCache.get(iconUrl);
    }

    const layoutPromise = new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

                let minX = canvas.width;
                let maxX = 0;
                let minY = canvas.height;
                let maxY = 0;
                let found = false;

                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        if (data[(((y * canvas.width) + x) * 4) + 3] === 0) continue;
                        found = true;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }

                if (!found) {
                    resolve(null);
                    return;
                }

                const bboxWidth = maxX - minX + 1;
                const bboxHeight = maxY - minY + 1;
                const scale = Math.min(ICON_BOX_SIZE / bboxWidth, ICON_BOX_SIZE / bboxHeight) * ICON_CROP_PADDING;
                const centerX = (minX + maxX + 1) / 2;
                const centerY = (minY + maxY + 1) / 2;

                resolve({
                    width: canvas.width * scale,
                    height: canvas.height * scale,
                    left: (ICON_BOX_SIZE / 2) - (centerX * scale),
                    top: (ICON_BOX_SIZE / 2) - (centerY * scale)
                });
            } catch (error) {
                resolve(null);
            }
        };

        img.onerror = () => resolve(null);
        img.src = iconUrl;
    });

    iconLayoutCache.set(iconUrl, layoutPromise);
    return layoutPromise;
}

function applyIconLayout(imgEl, iconUrl) {
    computeIconLayout(iconUrl).then((layout) => {
        if (!layout) return;
        imgEl.style.width = `${layout.width}px`;
        imgEl.style.height = `${layout.height}px`;
        imgEl.style.left = `${layout.left}px`;
        imgEl.style.top = `${layout.top}px`;
    });
}

function createPokemonAutocomplete({ input, list, getPokemonList, getName, getIconUrl, onSelect, maxResults = 8 }) {
    let currentMatches = [];
    let activeIndex = -1;

    function closeList() {
        list.innerHTML = '';
        list.classList.add('hidden');
        currentMatches = [];
        activeIndex = -1;
    }

    function updateActiveItem() {
        const items = list.querySelectorAll('.autocomplete-item');
        items.forEach((item, index) => {
            item.classList.toggle('active', index === activeIndex);
        });
        if (activeIndex >= 0 && items[activeIndex]) {
            items[activeIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function renderMatches(matches) {
        currentMatches = matches;
        activeIndex = -1;

        if (matches.length === 0) {
            closeList();
            return;
        }

        list.innerHTML = matches.map((pokemon, index) => `
            <li class="autocomplete-item" data-index="${index}">
                <span class="autocomplete-icon-wrap">
                    <img class="autocomplete-icon" src="${getIconUrl(pokemon)}" alt="" loading="lazy">
                </span>
                <span>${getName(pokemon)}</span>
            </li>
        `).join('');
        list.classList.remove('hidden');

        const iconEls = list.querySelectorAll('.autocomplete-icon');
        matches.forEach((pokemon, index) => applyIconLayout(iconEls[index], getIconUrl(pokemon)));
    }

    function selectMatch(pokemon) {
        input.value = getName(pokemon);
        closeList();
        onSelect(pokemon);
    }

    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        if (!query) {
            closeList();
            return;
        }

        const matches = getPokemonList()
            .filter((pokemon) => getName(pokemon).toLowerCase().includes(query))
            .slice(0, maxResults);
        renderMatches(matches);
    });

    input.addEventListener('keydown', (event) => {
        if (currentMatches.length === 0) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            activeIndex = (activeIndex + 1) % currentMatches.length;
            updateActiveItem();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
            updateActiveItem();
        } else if (event.key === 'Enter') {
            if (activeIndex >= 0) {
                event.preventDefault();
                selectMatch(currentMatches[activeIndex]);
            }
        } else if (event.key === 'Escape') {
            closeList();
        }
    });

    list.addEventListener('click', (event) => {
        const item = event.target.closest('.autocomplete-item');
        if (!item) return;
        selectMatch(currentMatches[Number(item.dataset.index)]);
    });

    document.addEventListener('click', (event) => {
        if (event.target === input || list.contains(event.target)) return;
        closeList();
    });

    return { close: closeList };
}
