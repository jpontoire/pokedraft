const fs = require('fs');

// PokeAPI flavor texts embed newlines/form-feeds/carriage-returns as line-wrap hints.
// Collapse any run of them into a single space so the stored text reads cleanly.
function sanitizeText(text) {
    return text.replace(/[\n\f\r]+/g, ' ').trim();
}

async function fetchPokemonData() {
    const totalPokemon = 1025;
    const finalDatabase = [];

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

            // Progress log every 50 Pokemon
            if (i % 50 === 0) {
                console.log(`Fetched ${i} / ${totalPokemon}...`);
            }

        } catch (error) {
            console.error(`Error fetching Pokemon ID ${i}:`, error);
        }
    }

    // Save to file
    fs.writeFileSync('./data/pokemon.json', JSON.stringify(finalDatabase, null, 2));
    console.log('Database built successfully at data/pokemon.json!');
}

fetchPokemonData();
