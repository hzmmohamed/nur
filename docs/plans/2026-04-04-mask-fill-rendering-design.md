# Mask Fill Rendering Design

## Goal

Render mask bezier paths with semi-transparent colored fills so users can see the material regions each mask defines, with visual differentiation by editor state.

## Rendering Rules

| State | Active layer mask | Other visible layers' masks | In-progress path |
|-------|------------------|----------------------------|-----------------|
| **Viewing** | n/a | 25% fill, no stroke | n/a |
| **Editing** | 35% fill, white stroke 2px, points visible | 15% fill, no stroke | n/a |
| **Drawing** | existing masks: 35% fill, white stroke | 15% fill, no stroke | stroke only until closed |
| **Drawing (closed)** | existing masks: 35% fill | 15% fill, no stroke | 35% fill preview + stroke |

## Key Rules

- Only closed paths (SVG data ends with `Z`) get a fill
- Open / in-progress paths are stroke-only
- When a path closes during drawing, fill appears immediately as preview
- Stroke is only shown on the active path being edited; all other masks are fill-only
- Fill color comes from the layer's color property
- Overlapping masks use simple alpha compositing (semi-transparent stacking)

## Changes to BezierPath

- Constructor takes `color: string` (layer color) and `fillOpacity: number`
- `pathLine` (Konva.Path): `fill` set to layer color at opacity when closed, `stroke` white when active / transparent when inactive
- `setActive(active)`: updates fill opacity (0.35 active, 0.15 or 0.25 inactive), toggles stroke
- `setFillOpacity(opacity)`: adjusts opacity without recreating paths
- Closed detection: check if `buildSvgPathData` output contains `Z`

## Changes to canvas-atom

- Pass layer color and appropriate fill opacity when creating BezierPath instances
- Viewing mode (`syncAllLayerPaths`): create paths with `fillOpacity: 0.25`, `active: false`
- Editing mode (`syncLayerPaths`): active layer paths with `fillOpacity: 0.35`, `active: true`; other visible layers with `fillOpacity: 0.15`, `active: false`
