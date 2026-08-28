const fs = require('fs');

// PokeAPI flavor texts embed newlines/form-feeds/carriage-returns as line-wrap hints.
// Collapse any run of them into a single space so the stored text reads cleanly.
function sanitizeText(text) {
    return text.replace(/[\n\f\r]+/g, ' ').trim();
}

// Picks a small icon sprite for autocomplete dropdowns. Prefers the
// Generation VIII icon, falls back to Generation VII, and finally falls back
// to the base front-facing sprite (always present) since Gen IX Pokemon have
// neither of the versioned icon sprites.
function extractIconUrl(data) {
    const versions = data.sprites.versions || {};
    const genViiiIcon = versions['generation-viii'] ? versions['generation-viii'].icons.front_default : null;
    const genViiIcon = versions['generation-vii'] ? versions['generation-vii'].icons.front_default : null;
    return genViiiIcon || genViiIcon || data.sprites.front_default;
}

// Converts a roman numeral string (e.g. "IX") into its integer value.
function romanNumeralToInt(roman) {
    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let i = 0; i < roman.length; i++) {
        const current = values[roman[i]];
        const next = values[roman[i + 1]];
        if (next && current < next) {
            total -= current;
        } else {
            total += current;
        }
    }
    return total;
}

// Parses a PokeAPI generation name like "generation-ix" into its integer
// generation number (9).
function parseGenerationNumber(generationName) {
    const romanPart = generationName.split('-')[1].toUpperCase();
    return romanNumeralToInt(romanPart);
}

// Recursively walks an evolution-chain `chain` node and collects every
// species slug in the family (the node itself plus all of its evolutions).
function extractFamilySpeciesSlugs(chainNode, slugs = []) {
    slugs.push(chainNode.species.name);
    chainNode.evolves_to.forEach((childNode) => extractFamilySpeciesSlugs(childNode, slugs));
    return slugs;
}

// Recursively walks an evolution-chain `chain` node and maps every species
// slug in the family to its stage: 1 for the base form, 2 for its direct
// evolutions, 3 for theirs. The standard games never go past 3 stages, so
// this never needs to go deeper.
function extractFamilyStages(chainNode, stage = 1, stages = {}) {
    stages[chainNode.species.name] = stage;
    chainNode.evolves_to.forEach((childNode) => extractFamilyStages(childNode, stage + 1, stages));
    return stages;
}

async function fetchPokemonData() {
    const totalPokemon = 1025;
    const finalDatabase = [];
    // Maps a species slug (e.g. "bulbasaur") to its finalDatabase entry, so
    // evolutionary family members can be resolved after the main fetch loop.
    const speciesSlugToPokemon = new Map();
    // Evolution chains are shared by every member of a family, so caching
    // by URL avoids re-fetching the same chain once per family member.
    const evolutionChainCache = new Map();

    console.log(`Starting to fetch ${totalPokemon} Pokémon... This will take a few minutes.`);

    for (let i = 1; i <= totalPokemon; i++) {
        try {
            // 1. Fetch combat/stats data and species/lore data concurrently
            const [resData, resSpecies] = await Promise.all([
                fetch(`https://pokeapi.co/api/v2/pokemon/${i}`),
                fetch(`https://pokeapi.co/api/v2/pokemon-species/${i}`)
            ]);
            const [data, species] = await Promise.all([resData.json(), resSpecies.json()]);

            // 2. Extract French name
            const frenchNameEntry = species.names.find(n => n.language.name === 'fr');
            const frenchName = frenchNameEntry ? frenchNameEntry.name : data.name;

            // 3. Extract English and French flavor text descriptions
            const englishFlavorEntry = species.flavor_text_entries.find(f => f.language.name === 'en');
            const frenchFlavorEntry = species.flavor_text_entries.find(f => f.language.name === 'fr');
            const englishDescription = englishFlavorEntry ? sanitizeText(englishFlavorEntry.flavor_text) : "No description available.";
            const frenchDescription = frenchFlavorEntry ? sanitizeText(frenchFlavorEntry.flavor_text) : "Description non disponible.";

            // 4. Build the optimized object
            const pokemonObject = {
                id: data.id,
                names: {
                    english: data.name.charAt(0).toUpperCase() + data.name.slice(1),
                    french: frenchName
                },
                types: data.types.map(t => t.type.name),
                attributes: {
                    height: data.height, // in decimetres
                    weight: data.weight, // in hectograms
                    color: species.color ? species.color.name : "unknown",
                    shape: species.shape ? species.shape.name : "unknown",
                    habitat: species.habitat ? species.habitat.name : "unknown",
                    generation: species.generation ? parseGenerationNumber(species.generation.name) : null,
                    is_legendary: species.is_legendary,
                    is_mythical: species.is_mythical
                },
                stats: {
                    hp: data.stats[0].base_stat,
                    attack: data.stats[1].base_stat,
                    defense: data.stats[2].base_stat,
                    special_attack: data.stats[3].base_stat,
                    special_defense: data.stats[4].base_stat,
                    speed: data.stats[5].base_stat
                },
                media: {
                    sprite: data.sprites.other['official-artwork'].front_default,
                    icon: extractIconUrl(data),
                    cry: data.cries ? data.cries.latest : null
                },
                description: {
                    english: englishDescription,
                    french: frenchDescription
                }
            };

            finalDatabase.push(pokemonObject);
            speciesSlugToPokemon.set(data.name, pokemonObject);

            // Stashed temporarily; resolved into `familyNames` and
            // `attributes.evolutionStage` in the second pass below, then
            // deleted before the file is written.
            pokemonObject._evolutionChainUrl = species.evolution_chain ? species.evolution_chain.url : null;
            pokemonObject._speciesSlug = data.name;

            // Progress log every 50 Pokemon
            if (i % 50 === 0) {
                console.log(`Fetched ${i} / ${totalPokemon}...`);
            }

        } catch (error) {
            console.error(`Error fetching Pokemon ID ${i}:`, error);
        }
    }

    // 5. Second pass: resolve each Pokemon's evolutionary family names.
    // This has to happen after the main loop (not inline) because a family's
    // later evolutions may not have been fetched yet when an earlier stage
    // is processed (e.g. Ivysaur/Venusaur don't exist yet when Bulbasaur,
    // ID 1, is processed).
    console.log('Resolving evolutionary families...');

    for (const pokemonObject of finalDatabase) {
        const chainUrl = pokemonObject._evolutionChainUrl;
        const speciesSlug = pokemonObject._speciesSlug;
        delete pokemonObject._evolutionChainUrl;
        delete pokemonObject._speciesSlug;

        const ownNames = [pokemonObject.names.english, pokemonObject.names.french];

        if (!chainUrl) {
            pokemonObject.familyNames = ownNames;
            pokemonObject.attributes.evolutionStage = 1;
            continue;
        }

        try {
            let chainData = evolutionChainCache.get(chainUrl);
            if (!chainData) {
                const resChain = await fetch(chainUrl);
                chainData = await resChain.json();
                evolutionChainCache.set(chainUrl, chainData);
            }

            const familySlugs = extractFamilySpeciesSlugs(chainData.chain);
            const familyNames = familySlugs
                .map((slug) => speciesSlugToPokemon.get(slug))
                .filter((familyMember) => familyMember)
                .flatMap((familyMember) => [familyMember.names.english, familyMember.names.french]);

            pokemonObject.familyNames = familyNames.length > 0 ? familyNames : ownNames;

            const familyStages = extractFamilyStages(chainData.chain);
            pokemonObject.attributes.evolutionStage = familyStages[speciesSlug] || 1;
        } catch (error) {
            console.error(`Error fetching evolution chain for ${pokemonObject.names.english}:`, error);
            pokemonObject.familyNames = ownNames;
            pokemonObject.attributes.evolutionStage = 1;
        }
    }

    // Save to file
    fs.writeFileSync('./data/pokemon.json', JSON.stringify(finalDatabase, null, 2));
    console.log('Database built successfully at data/pokemon.json!');
}

fetchPokemonData();
