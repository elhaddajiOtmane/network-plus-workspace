# Certification workspace

New UI from scratch, as requested. A calm certification workbench: learners should always know what to study next and where they are in a session.

The selected theme is the user's palette: Paper #FFFFFF, Ink #0F172A, Action #1D4ED8, Slate #475569, Correct #15803D, Incorrect #B91C1C. Outfit display and Work Sans body, served locally with OFL licenses. Neutral borders and backgrounds are structural tints. 8px spacing base, 8px control radius, 16px primary panel radius. Body 16px/1.6, question 24px/1.45, page heading 40px/1.1; left aligned and constrained to readable measure.

Two compositions considered:

1. Horizontal navigation above full-width content: works for compact screens, but repeats session navigation above the question on desktop.
2. Persistent 232px left navigation + fluid study canvas + focused question navigator: selected for desktop. On mobile the navigation becomes a two-row strip, the question comes before its navigator, and controls wrap at full touch size.

Overview: actionable continuation panel, then actual domain history as rows, then exam library as rows. No decorative metric grid. Session: connected progress nodes encode unanswered, answered, checked, and current position using labels and shape as well as color. Practice feedback is inline; exam feedback exists only after submission. No decorative motion, media, gradients, or invented scores.

Skills used: frontend-design, frontend-design-director, ui-ux-pro-max, theme-factory. The design-system lookup returned a suitable minimal functional style but mismatched marketing layout and medical typography; those recommendations were rejected in favor of the explicit application brief. Theme selection was already specified by the user. Component motion opportunity pass: only hover/focus feedback, no media or scroll effects needed for studying. Reduced motion remains supported.

Risks: source answer integrity, timer resets, invalid imports overwriting progress, inaccessible quiz controls. Mitigation: byte-preserved source, independent validation and scoring, absolute deadline, strict import schema, native form inputs, focus management, browser checks at 360/768/1440px.

Files: dist/ owns the deployable application; dist/lib/ owns configuration, data boundary, scoring, progress and view functions; tests/ owns core automated tests; scripts/ owns validation, local serving, asset preparation and isolated hosting synchronization; evidence/ records verification. No runtime dependencies.
