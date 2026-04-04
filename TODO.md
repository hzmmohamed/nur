# TODO

## UX Fixes

- [x] **Timeline footer: larger click target for frame/time toggle** — Make the entire "Frame X / Y" text clickable to toggle between frame numbers and timecodes, not just the small icon button
- [x] **Space bar panning only inside canvas** — The space bar handler fires globally, which interferes when typing into inputs (e.g., layer name). Scope it to only activate when the canvas container is focused or hovered
- [x] **Improve frame importing UI** — The current drop zone is minimal. Add progress visualization, drag-over feedback, file validation messages, and support for folder drops

- [ ] **Animate timeline track collapse/expand** — When a layer group is collapsed/expanded, animate the SVG grid rows smoothly. SVG attribute transitions don't work with CSS; needs a different approach (e.g., FLIP animation, or switch to HTML-based grid)

## Architecture

- [ ] **Model project states, not just data** — Guide the user through the project lifecycle with explicit states (empty → importing → editing → exporting) rather than deriving UI from raw data presence. Use effect-machine or awareness state to represent which phase the project is in, and render purpose-built UI for each phase


## Other

- [ ] PWA Setup
- [ ] Responsive Tablet size friendly UI + touch screen support