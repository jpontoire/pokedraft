// tests/games.spec.js
// E2E smoke tests covering the core loop of each game in the portal.
const { test, expect } = require('@playwright/test');

test.describe('Portal', () => {
    test('loads and shows all 6 game buttons', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('.portal-title')).toBeVisible();

        const gameButtons = page.locator('a.portal-btn');
        await expect(gameButtons).toHaveCount(6);

        await expect(page.locator('a[href="./draft/"]')).toBeVisible();
        await expect(page.locator('a[href="./zoom/"]')).toBeVisible();
        await expect(page.locator('a[href="./dex/"]')).toBeVisible();
        await expect(page.locator('a[href="./palette/"]')).toBeVisible();
        await expect(page.locator('a[href="./grid/"]')).toBeVisible();
        await expect(page.locator('a[href="./order/"]')).toBeVisible();
    });
});

test.describe('PokeDraft', () => {
    test('loads the lobby and the language toggle translates the UI', async ({ page }) => {
        await page.goto('/draft/');

        const hostBtn = page.locator('#host-btn');
        await expect(hostBtn).toBeVisible();
        await expect(page.locator('#join-btn')).toBeVisible();

        // The site defaults to French until a language is chosen.
        await expect(hostBtn).toHaveText('Héberger une Partie');

        await page.locator('#lang-toggle').click();
        await expect(hostBtn).toHaveText('Host Game');
    });
});

test.describe('PokeZoom', () => {
    test('typing a Pokemon name shows matching results in the custom dropdown', async ({ page }) => {
        await page.goto('/zoom/');

        // Wait for the round to start (the mystery sprite gets a real src) before searching.
        await expect(page.locator('#sprite-image')).toHaveAttribute('src', /.+/);

        const suggestions = page.locator('#guess-suggestions');
        await page.locator('#guess-input').fill('Pikachu');

        await expect(suggestions).not.toHaveClass(/hidden/);
        const items = suggestions.locator('.autocomplete-item');
        await expect(items).not.toHaveCount(0);
        await expect(items.first()).toContainText('Pikachu');
    });
});

test.describe('DexGuess', () => {
    test('shows a description and reacts to a wrong guess', async ({ page }) => {
        await page.goto('/dex/');

        const descriptionText = page.locator('#description-text');
        await expect(descriptionText).not.toHaveText('');

        // A guess that can't possibly match any Pokemon name and won't produce
        // any autocomplete matches, so the dropdown won't intercept the submit.
        await page.locator('#guess-input').fill('Definitely Not A Real Pokemon Name');
        await page.locator('#guess-input').press('Enter');

        // First wrong guess: HINT_THRESHOLDS is [3, 5, 7], so this lands on the
        // "2 guesses left until the next hint" countdown message.
        await expect(page.locator('#dialogue-text')).toHaveText('Faux ! Encore 2 essai(s) avant le prochain indice.');
    });
});

test.describe('PokeGrid', () => {
    async function submitGuessViaAutocomplete(page, name) {
        await page.locator('#guess-input').fill(name);
        await expect(page.locator('#guess-suggestions')).not.toHaveClass(/hidden/);
        await page.locator('#guess-suggestions .autocomplete-item').first().click();
        await page.locator('#guess-form button[type="submit"]').click();
    }

    test('submitting a guess appends a fully-scored row', async ({ page }) => {
        await page.goto('/grid/');

        // Sprite, Type 1, Type 2, Habitat, Color, Gen, Evo Stage, Height, Weight.
        await expect(page.locator('.grid-header .grid-cell')).toHaveCount(9);

        // The site defaults to French, and the autocomplete filters against
        // the currently displayed name -- Pikachu's name is identical in
        // both languages, so this works without a language toggle.
        await submitGuessViaAutocomplete(page, 'Pikachu');

        const guessRow = page.locator('.guess-row');
        await expect(guessRow).toHaveCount(1);
        await expect(guessRow.locator('.grid-cell')).toHaveCount(9);
        // Every evaluated cell (all but the sprite) carries a feedback class.
        await expect(guessRow.locator('.grid-cell[class*="bg-"]')).toHaveCount(8);
    });

    test('a second guess appends below the first, and duplicate guesses are rejected', async ({ page }) => {
        await page.goto('/grid/');

        await submitGuessViaAutocomplete(page, 'Pikachu');
        await submitGuessViaAutocomplete(page, 'Dracaufeu'); // Charizard's French name

        const rows = page.locator('.guess-row');
        await expect(rows).toHaveCount(2);
        // Guessed first, so it stays on top; the second guess appends below it.
        await expect(rows.nth(0).locator('img')).toHaveAttribute('alt', 'Pikachu');
        await expect(rows.nth(1).locator('img')).toHaveAttribute('alt', 'Dracaufeu');

        await submitGuessViaAutocomplete(page, 'Pikachu');
        await expect(rows).toHaveCount(2);
        await expect(page.locator('#dialogue-text')).toHaveText('Vous avez déjà proposé celui-là !');
    });
});

test.describe('PokePalette', () => {
    test('extracts a color palette from the sprite without CORS errors', async ({ page }) => {
        const consoleErrors = [];
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });

        await page.goto('/palette/');

        const paletteContainer = page.locator('#palette-container');
        await expect(paletteContainer.locator('.palette-stripe').first()).toBeVisible();

        const corsErrors = consoleErrors.filter((text) => /cors|cross-origin/i.test(text));
        expect(corsErrors).toEqual([]);
    });
});
