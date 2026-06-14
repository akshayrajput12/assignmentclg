---
version: "light-premium"
name: "FlatSplit SaaS Light Interface"
description: "A premium light-themed interface designed for FlatSplit.io. Anchored by thin border details, soft shadows, and clean, low-weight typography (Inter and JetBrains Mono) to project calm authority and technical precision."
colors:
  primary: "#10B981" # Emerald 500
  secondary: "#3B82F6" # Blue 500
  tertiary: "#F59E0B" # Amber 500
  neutral: "#0F172A" # Slate 900
  background: "#F8FAFC" # Slate 50
  surface: "#FFFFFF" # Pure White
  text-primary: "#1E293B" # Slate 800
  text-secondary: "#64748B" # Slate 500
  border: "#E2E8F0" # Slate 200
  accent: "#10B981"
typography:
  display-lg:
    fontFamily: "Inter"
    fontSize: "44px"
    fontWeight: 500
    lineHeight: "52px"
    letterSpacing: "-0.02em"
  body-md:
    fontFamily: "JetBrains Mono"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
  label-md:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
rounded:
  sm: "4px"
  md: "12px"
  lg: "20px"
  full: "9999px"
spacing:
  base: "4px"
  sm: "2px"
  md: "8px"
  lg: "16px"
  xl: "24px"
  gap: "16px"
  card-padding: "24px"
  section-padding: "48px"
components:
  button-primary:
    backgroundColor: "#10B981"
    textColor: "#FFFFFF"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "#FFFFFF"
    textColor: "#1E293B"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: "12px 20px"
    border: "1px solid #E2E8F0"
  card:
    rounded: "16px"
    padding: "24px"
    backgroundColor: "#FFFFFF"
    border: "1px solid rgba(0, 0, 0, 0.05)"
---

## Overview

FlatSplit's light theme is engineered for high legibility, clean visual hierarchy, and an ultra-premium aesthetic.

- **Layout:** Flex / Bounded
- **Content Width:** 1280px Max
- **Framing:** Matte Glass (Light blur with low-opacity borders)
- **Grid:** Minimalist 12-column

## Colors

- **Primary (#10B981):** Active status, success, and primary highlights.
- **Secondary (#3B82F6):** Interactive action targets, blue accents, and links.
- **Neutral Background (#F8FAFC):** Base slate background.
- **Surface (#FFFFFF):** Pure white container backgrounds.
- **Borders (#E2E8F0):** Subtle light-grey borders.
- **Text Primary (#1E293B):** Sleek, readable text color.
- **Text Secondary (#64748B):** Supporting details and captions.

## Typography

We favor **light to medium weights** (300, 400, 500) over heavy bold styles to maintain a clean editorial feel.

- **Display (`display-lg`):** Inter, 44px, weight 500 (Medium), line-height 52px, letter-spacing -0.02em.
- **Body (`body-md`):** JetBrains Mono, 12px, weight 400, line-height 18px.
- **Labels (`label-md`):** Inter, 14px, weight 500, line-height 20px.

## Elevation & Depth

Surfaces should feel light and layered using subtle shadows and thin, light borders instead of heavy dark fills.

- **Surface Style:** Pure White with 98% opacity and 12px backdrop blur.
- **Borders:** 1px solid rgba(0, 0, 0, 0.04)
- **Shadows:** 0 1px 3px 0 rgba(0, 0, 0, 0.02), 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 10px 15px -3px rgba(0, 0, 0, 0.04)

## Shapes

- **Corner Radii:** 6px (small elements), 16px (standard cards), 9999px (pills & badges).
- **Icon Treatment:** Linear, 1.5px stroke weight.