# Accessibility QA Checklist

This checklist complements the automated `npm run a11y` axe smoke suite. Run it before shipping homepage, theme, or
deployment changes.

## Screen Reader Pass

- macOS VoiceOver: open `/`; use `VO + Right Arrow` through the page, then jump by headings, landmarks, and links.
- Windows NVDA: repeat the homepage pass in Firefox or Chrome when a Windows machine is available; verify browse mode
  announces the heading and link destination clearly.
- Confirm the page title, heading, main landmark, and `cs.avasan.org` link text are announced clearly.

## Keyboard Pass

- Start at the browser address bar and tab through each page without using the mouse.
- Verify the `cs.avasan.org` link has a clearly visible focus state.
- Confirm no hidden control receives focus and no keyboard trap occurs.

## Contrast And Motion Pass

- Check light mode and dark mode at desktop and mobile widths.
- Verify the heading, supporting text, and primary link remain readable.
- With reduced motion enabled, confirm the link remains understandable and usable without animation.

## Required Automated Evidence

- `npm run a11y`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
