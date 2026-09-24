# Butuan Heritage Map

Interactive Web GIS of archaeological, historic, and museum sites in Butuan City, built for IT 412 Platform Technologies (Final Project, Cultural & Heritage theme).

**Live map:** _add your GitHub Pages link here_
**Group members:** _add names here_

## What it does

- Shows Butuan's heritage sites by type (archaeological, museum, church/colonial, historic marker) with photo popups.
- Search by name, barangay, or keyword; filter by site type and historical period.
- Four Turf.js analysis tools that work on whatever the filters currently show:
  1. **Nearest heritage site** from your location or any clicked point (`turf.nearestPoint`, `turf.distance`).
  2. **Walking zones** that merge overlapping circles around sites and report which sites cluster (`turf.buffer`, `turf.union`, `turf.pointsWithinPolygon`).
  3. **Sites per barangay** choropleth (`turf.pointsWithinPolygon`).
  4. **Distance to the Agusan River** for every site (`turf.pointToLineDistance`).
- Street and satellite base maps, legend, map attribution, and a layout that works on phones.

## Files

```
index.html               page and styles
map.js                   all map logic
data/sites.geojson       heritage sites (REQUIRED, ships empty)
data/barangays.geojson   barangay polygons (optional, turns on tool 3)
data/agusan_river.geojson river lines (optional, turns on tool 4)
overpass_query.txt       queries for getting real data from OpenStreetMap
```

## Setup (no terminal needed)

### 1. Get real site data from OpenStreetMap
1. Open <https://overpass-turbo.eu>.
2. Paste **Query 1** from `overpass_query.txt`, click **Run**.
3. **Export > GeoJSON > download**. Rename the file `sites.geojson` and replace `data/sites.geojson`.

The map reads OSM tags directly: `name`, `historic`, `tourism`, `amenity`, `addr:suburb`. Shapes (buildings, areas) are converted to a single point at their centre. Unnamed features are skipped.

### 2. Get the river (for tool 4)
Run **Query 2** the same way and save the export as `data/agusan_river.geojson`.

### 3. Add what OSM is missing, and enrich the popups
Many heritage sites are not tagged in OSM. Add them at <https://geojson.io>:
1. Load your `sites.geojson` (Open > File).
2. Switch to the satellite layer, click **Draw a marker**, and place each point on the site itself.
3. Click the marker and fill in the properties table using the fields below.
4. Save as GeoJSON and replace `data/sites.geojson`.

| Property | Values | Notes |
|---|---|---|
| `name` | text | Required. Features without it are skipped. |
| `category` | `archaeological`, `museum`, `religious`, `historic`, `other` | Guessed from OSM tags if left out. |
| `period` | `Pre-colonial`, `Spanish colonial`, `American and WWII`, `Modern` | Spelled exactly like this. Blank shows as "Not specified". |
| `description` | text | One or two sentences for the popup. |
| `image` | URL or path like `images/balangay.jpg` | Use only images you have the right to use, and credit them in `source`. |
| `barangay` | text | Shown in the popup and used by search. |
| `source` | text | Where you got the site, e.g. "National Museum of the Philippines". |
| `source_url` | URL | Link shown in the popup. |

**Do not invent coordinates.** The brief bans fabricated data. Place every point on the site itself in satellite view, and note the source for each one.

### 4. Barangay boundaries (for tool 3)
1. Download Philippine barangay boundaries (PhilGIS or the Humanitarian Data Exchange).
2. In QGIS, select Butuan City's barangays and export the selection as GeoJSON.
3. Shrink the file at <https://mapshaper.org> (Simplify, about 10 to 20%) so the page loads quickly.
4. Save as `data/barangays.geojson`.

If barangay names do not appear in the tooltips, open the file and check the name property. Add it to `barangayNameFields` at the top of `map.js`.

### 5. Publish on GitHub Pages
Upload all files (keeping the `data` folder) to your repository through the GitHub website, then turn on Pages under **Settings > Pages**.

Test on the **published link**. Double-clicking `index.html` will not load the data files, because browsers block that on `file://` addresses.

## Rubric checklist (100 points)

| Criterion | Where it is covered |
|---|---|
| Web map functionality and interactivity (30) | Popups, search, type and period filters, layer control, results list |
| Philippine spatial data (20) | OSM Butuan heritage features, National Museum records, PhilGIS barangays. Sources shown on the page and in the popups |
| Spatial analysis (20) | Four Turf.js tools. The river-distance result gives you a finding to present |
| Deployment (15) | GitHub Pages, public link, no localhost |
| Technical brief (10) | See outline below |
| Demo (5) | Walk through: filter, popup, nearest site, walking zones, river distance |

## One-page technical brief: outline

1. **Problem:** Butuan's heritage sites are scattered across barangays and hard to explore in one place.
2. **Data sources:** OpenStreetMap (Overpass), National Museum of the Philippines / NHCP records, PhilGIS barangay boundaries. Add the download dates.
3. **Platforms and tools:** Leaflet.js, Turf.js 6.5.0, Overpass Turbo, QGIS, geojson.io, GitHub Pages.
4. **What the map shows:** the four analysis tools and one or two findings from them (for example, how many sites lie within 1 km of the river).

## Credits

Base maps: &copy; OpenStreetMap contributors; Esri World Imagery. Libraries: Leaflet, Turf.js.
