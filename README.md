# Snow & Avalanche Watch

Avalanche danger, snowpack, slope maps and a GPX route check for Rogers Pass, Rossland to Kootenay Pass, Vallter and Innsbruck. A personal planning aid shared among friends: not a go/no-go decision.

## How it works

- **Every morning** (05:31 UTC) the GitHub Action in `.github/workflows/daily.yml` runs `scripts/snow_fetch.py`, which pulls the public bulletins, station data and forecasts, carries yesterday's records over from the live site, builds the site with `scripts/build_site.py` and deploys it to GitHub Pages. Daily data is never committed to this repository.
- `page/` is the page itself (HTML and the map / route-check script).
- `web/` is the standalone frame: runtime, styles, icons, home-screen manifest, offline cache, About page.
- `fixed/` holds terrain, glaciers, mapped avalanche paths and other data that doesn't change.

To refresh by hand: Actions → "Daily refresh and deploy" → Run workflow.

Data sources and licences are listed on the site's About page.

The code is proprietary: copyright Keir Plaice, all rights reserved. See LICENSE. Third-party data and libraries keep their own licences.
