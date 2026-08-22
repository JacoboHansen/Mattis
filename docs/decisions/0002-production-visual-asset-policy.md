# ADR 0002 — No AI-generated production illustrations

Status: accepted

Date: 2026-08-22

## Context

The selected Mattis direction uses warm abstract shapes, a small tutor mark, UI
icons, and mathematical figures. The owner is not comfortable shipping
AI-generated illustrations in the product.

## Decision

- Do not ship AI-generated decorative illustrations, avatars, textures, or
  brand artwork.
- Use commissioned human-made assets or assets from a clearly licensed source.
- Store every third-party asset with its license, source URL, creator when
  applicable, and modification notes.
- Use one coherent icon library per interface surface. The PoC currently uses
  official Lucide SVG assets under the ISC license.
- Treat deterministic mathematical figures differently from decorative
  illustrations: code may render a validated `FigureSpec` into accessible,
  mathematically exact SVG. A model may propose structured data, but never raw
  SVG, HTML, CSS, or JavaScript.
- Runtime illustration generation stays disabled unless a later explicit
  product, safety, licensing, and GDPR decision replaces this ADR.

## PoC exception

The current home motif and tutor glyph are temporary code-native composition
stand-ins used to test layout and interaction. They are not approved production
assets and are recorded as a P2 blocker in `design-qa.md`.

## Production acceptance criteria

- Source and license are documented in-repo.
- Asset style matches the warm, playful-but-not-childish design direction.
- Assets work on cream backgrounds and retain contrast at small mobile sizes.
- No embedded personal data, prompt metadata, or provenance ambiguity.
- A designer and the product owner approve the final kit before design lock.
