// translations/order.js
// Page-specific translations for the PokeOrder game (order/index.html / app.js).

const pageI18n = {
    // Sorting criteria labels
    statHp: { en: 'HP', fr: 'PV' },
    statAttack: { en: 'Attack', fr: 'Attaque' },
    statDefense: { en: 'Defense', fr: 'Défense' },
    statSpecialAttack: { en: 'Sp. Atk', fr: 'Atq. Spé' },
    statSpecialDefense: { en: 'Sp. Def', fr: 'Déf. Spé' },
    statSpeed: { en: 'Speed', fr: 'Vitesse' },
    statHeight: { en: 'Height', fr: 'Taille' },
    statWeight: { en: 'Weight', fr: 'Poids' },

    ascendingLabel: { en: 'Lowest to Highest', fr: 'Du Plus Faible au Plus Élevé' },
    objectiveTemplate: { en: 'Sort by {stat} ({direction})', fr: 'Triez par {stat} ({direction})' },

    mysteryCardLabel: { en: 'Where does this one go?', fr: 'Où va celui-ci ?' },
    submitOrder: { en: 'Submit', fr: 'Valider' },
    nextRound: { en: 'Next Round', fr: 'Manche Suivante' },

    // Dialogue box messages
    dlgPlaceCard: { en: 'Drag the mystery Pokemon into the row, then submit!', fr: 'Glissez le Pokémon mystère dans la ligne, puis validez !' },
    dlgGameOver: { en: 'Game over! {name} did not belong there.', fr: "Partie terminée ! {name} n'allait pas là." },
    dlgSuccess: { en: 'Perfect! All 5 are correctly sorted!', fr: 'Parfait ! Les 5 sont correctement triés !' }
};
