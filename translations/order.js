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

    submitOrder: { en: 'Submit Order', fr: "Valider l'Ordre" },
    nextRound: { en: 'Next Round', fr: 'Manche Suivante' },

    // Dialogue box messages
    dlgPrompt: { en: 'Drag the cards to sort them, then submit!', fr: 'Glissez les cartes pour les trier, puis validez !' },
    dlgTryAgain: { en: 'Not quite right. Check the highlighted cards and try again!', fr: 'Pas tout à fait. Regardez les cartes en surbrillance et réessayez !' },
    dlgSuccess: { en: 'Perfect order! Well done!', fr: 'Ordre parfait ! Bien joué !' }
};
