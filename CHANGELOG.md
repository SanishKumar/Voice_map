# Changelog

All notable changes to `voicegis` are recorded here. This project follows
[semantic versioning](https://semver.org/spec/v2.0.0.html).

Versions before 2.2.0 were prereleases; see the git history for their details.

## [2.4.0] — 2026-08-30

### Added

- `catalogFromGeoJSON` derives a catalog from GeoJSON you already have, so
  trying the library no longer requires a live OGC API - Features endpoint.
  It names the layer, types the fields, and returns the warnings it collected
  along the way.

  ```js
  import { catalogFromGeoJSON } from 'voicegis/adapters';

  const { catalog, layers, warnings } = catalogFromGeoJSON({ cities });
  ```

  Type inference is deliberately timid, because a field that silently matches
  nothing is the same failure as an unconformant filter:

  - a property whose values disagree across features is declared with **no
    type** rather than the type of whichever feature came first;
  - a property holding objects, arrays, or non-finite numbers is **left out
    entirely**, since the predicate engine cannot compare those;
  - `null` is treated as absent rather than widening a type;
  - a column of ISO dates is typed `date`, but one that also holds free text
    falls back to `string`.

  Capabilities are narrowed per layer for the same reason: a layer whose
  features carry no geometry is not offered proximity selection or buffering.
  Narrowing requires evidence, so an empty layer keeps them — nothing was
  inspected either way, and withholding would break declaring a layer before
  its data arrives.

  The catalog it returns always constructs. `SpatialCatalog` throws when two
  things answer to one name, and real data collides: a shapefile converted to
  GeoJSON routinely carries both `NAME` and `name`. Names colliding
  case-insensitively drop the later one with a warning, for layers and fields
  alike, rather than throwing on a catalog the caller cannot hand-edit.

- `minConfidence` on the compiler (and so on `VoiceGISCore`) turns the
  confidence score every operation already carried into something that acts.
  Operations scoring below the floor raise a `low_confidence` input issue and
  the plan becomes `needs_input` instead of `ready`.

  ```js
  new VoiceGISCore({ catalog, minConfidence: 0.9 });
  ```

  Because execution is atomic, one uncertain operation holds back its whole
  plan. The default is `0`, which preserves existing behaviour exactly.

### Changed

- `fingerprint` and `aliasesFor` moved into `adapters/catalogUtils.js` and are
  shared by both catalog builders. No public export changed.

### Fixed

- Tagged the `v2.2.1` and `v2.3.0` releases, which were published to npm but
  never tagged in git. Both tags point at the exact commit npm recorded as
  each release's `gitHead`.

## [2.3.0] — 2026-08-18

### Added

- `catalogFromOgcService` derives a catalog, geometry-property map, and
  capability set from a live OGC API - Features service, removing the need to
  hand-write a catalog for a conformant endpoint.

  Capabilities follow `/conformance` rather than assumption. A service that
  advertises `cql2-text` without Part 3 `conf/filter` has been observed to
  accept a filter, answer `200`, and return every feature as though it had
  been applied, so attribute queries are not enabled in that state and the
  reason is reported as a warning.

## [2.2.1] — 2026-08-17

### Fixed

- A partly-understood command is now refused instead of quietly narrowed. A
  request naming two layers where only one resolves no longer compiles to a
  plan that acts on the half that was understood.

## [2.2.0] — 2026-08-16

First stable 2.x release. The compiler, catalog, policy, executor, and plan
schema had been stable across the 2.0 and 2.1 prereleases and were unchanged
by this release.

### Added

- Execution adapters for GeoJSON and OGC API - Features, deterministic
  navigation parsing, and a rebuilt demo.
- Plan validation against trusted catalogs, so a plan is revalidated before
  any side effect.
- The policy-aware command core: typed plans, permissions, risk levels, and
  per-operation receipts.

### Fixed

- The stacked mobile map is sized from measured chrome rather than a viewport
  fraction, which had passed locally and failed on CI's fonts.

[2.4.0]: https://github.com/SanishKumar/VoiceGIS/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/SanishKumar/VoiceGIS/compare/v2.2.1...v2.3.0
[2.2.1]: https://github.com/SanishKumar/VoiceGIS/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/SanishKumar/VoiceGIS/releases/tag/v2.2.0
