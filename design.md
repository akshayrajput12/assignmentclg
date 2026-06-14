# DESIGN.md — Design System & UI Specifications

This document outlines the premium design system, color palettes, micro-interactions, and visual guidelines used to create a stunning user experience.

---

## 1. Aesthetic Identity
The app uses a **Midnight Tech / Glassmorphism** aesthetic. The background is a deep dark blue-grey, accented by subtle glowing gradients and frosted-glass cards. 

### Core Palette
- **Background:** Deep Navy Slate (`#020617` / `slate-950`)
- **Cards/Containers:** Slate Grey (`#0f172a` / `slate-900` at `60%` opacity)
- **Primary Accents:** Emerald Green (`emerald-400`/`emerald-500`) for credit, totals, and positive actions.
- **Secondary Accents:** Rose Pink (`rose-400`/`rose-500`) for debt, warnings, and deletions.
- **Borders:** Dark Slate (`#1e293b` / `slate-800` at `50%` opacity)

---

## 2. Typography & Icons
- **Font Family:** Geist Sans & Geist Mono (Modern geometric sans-serif and code fonts).
- **Icons:** Lucide Icons (Stroke width `2.0` or `2.5` for clear visual weight).

---

## 3. UI Layout & Navigation
The interface is structured as a single-page app with dynamic layout tabs:
1. **Import Tab (Default view if DB is empty):** Drag-and-drop CSV box, automatic local import buttons, and USD rate configuration. Features the Anomaly Resolution Center with cards grouped by severity.
2. **Dashboard Tab:** Color-coded stats, grid cards showing flatmate balances, and Aisha's simplified transaction pathways.
3. **Rohan's Ledger Tab:** An audit view with selector buttons to choose a flatmate, showing their detailed credit/debt ledger table.
4. **Timeline Tab:** A graphical calendar view showing Meera leaving and Sam joining.

---

## 4. Micro-Animations & Interactions
- **Frosted Glass:** Card backgrounds use `backdrop-blur-sm` combined with low opacity borders to create a premium depth effect.
- **Hover Transitions:** Buttons and interactive ledger rows use `transition-all duration-200 hover:bg-slate-800/80` for feedback.
- **Color Coding:** Debts and credits are visually color-coded (`text-rose-400` vs `text-emerald-400`) to enable scanning balances at a glance.
