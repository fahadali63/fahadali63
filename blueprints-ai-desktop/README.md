# Blueprints AI Desktop

A desktop app (Windows, macOS, Linux) that turns a project description, hand sketch, site photo, PDF or point cloud into a coordinated construction document set, then lets you revise it by chat, mark it up, approve it and export it.

It is modelled on the feature set described at <https://www.blueprints-ai.com/features>. It is an independent implementation. It does not use or copy that product's code, data or models.

## What it does

| Feature on the site | How it works here |
| --- | --- |
| Five phases: programming, schematic design, design development, construction documentation, cost estimation | Pick a phase at the top. Each phase generates only the sheets that belong to it, so you can start at any point. |
| Architectural, structural, mechanical, electrical, plumbing, Title 24, fire and life safety, interior | All generated together from one layout, so doors, rooms, equipment and fixtures agree across sheets. Floor plans, elevations, section, roof plan, schedules, framing, HVAC, lighting, power, panel schedule, single-line, plumbing plans and risers, egress plans, finish plans. |
| Civil and landscape on Enterprise plans | Off by default. Turn on "Enterprise sheets" in Settings to add a site/grading/utility plan and a planting plan. |
| Accepts sketches, photos, PDFs, point clouds, plain text | Drag files into the chat. Images and PDFs are read by Claude (needs your API key). XYZ/PTS/CSV point clouds are measured locally and set the building footprint. |
| Codes from IBC, CBC, IFC, NFPA, ADA, Title 24, cited | Occupant load, exits, travel distance, corridor width, sprinklers, plumbing fixture counts and accessibility checks, each with its section number, on the Code tab and sheet G-002. |
| Never start over: conversational revisions | The chat keeps the full project history. Each change regenerates every discipline and is logged as a revision with how many sheets changed. |
| You review and approve every set | Per-sheet Draft / In review / Approved, pin markups on any sheet, professional-of-record name and license, approval stamp on the title block. Changed sheets drop back to Draft. |
| Cost estimation | Planning-level estimate by discipline with a low-to-high range and a location factor. |
| Export | 36 x 24 in PDF set, DXF per sheet for CAD, CSV schedules and cost, project file. |

## Two modes

- **With an Anthropic API key** (Settings): free-form requests, reading sketches/photos/PDFs, code notes and stated assumptions. Requests go straight from your computer to `api.anthropic.com`. The key is stored encrypted with the OS keychain.
- **Offline**: no key needed. Direct edits like "make it 3 stories", "add 2 conference rooms", "make the lobby 500 sf", "change occupancy to retail in Austin", "footprint 90 x 50", "no sprinklers" are understood locally.

Either way the drawings themselves are produced by a deterministic generator, not by the language model. The model decides intent (rooms, areas, occupancy, jurisdiction). The generator guarantees that geometry, schedules and calculations are consistent.

## Run it

```bash
npm install
npm start
```

Build installers: `npm run dist` (or use the "Build installers" GitHub Action).

## Tests

```bash
npm test            # engine tests: every occupancy, story count, size, phase and jurisdiction
npm run test:e2e    # launches the real Electron app under Xvfb: create, chat, markup, approve, PDF/DXF/CSV export
```

## Important limits

- This produces **draft, planning-level** drawings. The layout is a corridor with a band of rooms on each side. It is not a substitute for design judgment, a structural analysis or a mechanical load calculation.
- Code values (occupant load factors, travel distances, fixture counts, sprinkler triggers) are simplified from the model codes. Local amendments, adopted editions and special conditions are not modelled. Verify everything against the edition your jurisdiction adopted.
- Structural member sizes, HVAC tonnage, electrical loads and plumbing sizes are rule-of-thumb coordination values.
- A licensed architect or engineer must review, certify and stamp the set before permit submission. The app never claims compliance.

## Layout

```
src/engine     pure JS: catalog, layout, codes, drawing toolkit, sheet generators, SVG/DXF
src/main       Electron main process (storage, AI client, export, point cloud)
src/renderer   UI
test           engine tests and Electron e2e harness
```
