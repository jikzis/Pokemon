# Should I evolve this Pokémon?

A small static site that answers one question: should you evolve the Pokémon you have right now?

Type a Pokémon name and (optionally) its level. The site fetches data and images from [PokéAPI](https://pokeapi.co) and shows:

- A verdict: Yes, Wait, Not yet, or No, with the reason
- The current Pokémon and its evolution(s) side by side, with official artwork and how the evolution is triggered
- A base stat comparison
- Any level-up moves the current form learns that the evolved form learns later or never

No build step, no backend. Three files: `index.html`, `style.css`, `app.js`.

## Publish on GitHub Pages

1. Create a new public repository on GitHub, for example `should-i-evolve`.
2. Upload `index.html`, `style.css`, `app.js` and this `README.md` to the root of the repository (drag and drop on the repo page works, or use git).
3. In the repository, open Settings, then Pages in the left menu.
4. Under Build and deployment, set Source to "Deploy from a branch", pick the `main` branch and the `/ (root)` folder, then Save.
5. Wait a minute or two. The site is live at `https://<your-username>.github.io/should-i-evolve/`.

Every push to `main` redeploys automatically.

## Run locally

Open `index.html` in a browser. Nothing else is needed. The site needs an internet connection to reach PokéAPI.

## How the verdict is decided

1. If the Pokémon has no further evolution: No.
2. If you entered a level below the level the evolution requires: Not yet.
3. The site compares level-up move lists for the newest game version both forms share. If the current form learns moves (after your level, if given) that the evolution learns later or never: Wait, with the level to wait until. Without a level it says "Yes, but" and lists the moves.
4. Otherwise: Yes.

Branched evolutions (Eevee, Wurmple, Tyrogue) show every option with its own stat comparison.
