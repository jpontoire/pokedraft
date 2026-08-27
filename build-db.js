const fs = require('fs');

// PokeAPI flavor texts embed newlines/form-feeds/carriage-returns as line-wrap hints.
// Collapse any run of them into a single space so the stored text reads cleanly.
function sanitizeText(text) {
    return text.replace(/[\n\f\r]+/g, ' ').trim();
}

// Recursively walks an evolution-chain `chain` node and collects every
// species slug in the family (the node itself plus all of its evolutions).
function extractFamilySpeciesSlugs(chainNode, slugs = []) {
    slugs.push(chainNode.species.name);
    chainNode.evolves_to.forEach((childNode) => extractFamilySpeciesSlugs(childNode, slugs));
    return slugs;
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
                    cry: data.cries ? data.cries.latest : null
                },
                description: {
                    english: englishDescription,
                    french: frenchDescription
                }
            };

            finalDatabase.push(pokemonObject);
            speciesSlugToPokemon.set(data.name, pokemonObject);

            // Stashed temporarily; resolved into `familyNames` in the second
            // pass below, then deleted before the file is written.
            pokemonObject._evolutionChainUrl = species.evolution_chain ? species.evolution_chain.url : null;

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
        delete pokemonObject._evolutionChainUrl;

        const ownNames = [pokemonObject.names.english, pokemonObject.names.french];

        if (!chainUrl) {
            pokemonObject.familyNames = ownNames;
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
        } catch (error) {
            console.error(`Error fetching evolution chain for ${pokemonObject.names.english}:`, error);
            pokemonObject.familyNames = ownNames;
        }
    }

    // Save to file
    fs.writeFileSync('./data/pokemon.json', JSON.stringify(finalDatabase, null, 2));
    console.log('Database built successfully at data/pokemon.json!');
}

fetchPokemonData();
