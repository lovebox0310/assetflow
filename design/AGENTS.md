# Design Knowledge Base

**Generated:** 2026-10-17  
**Scope:** Static prototype and design assets

## OVERVIEW
The `design/` directory houses the static prototype for the assetflow application, including the information architecture map and key user flows.

## STRUCTURE
- **prototype/** – static prototype containing:
  - IA map (information architecture)
  - Dashboard view
  - Expenses view
  - Assets view
  - Settings view
  - Login view

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| IA map | `design/prototype/` | Information architecture overview |
| Dashboard | `design/prototype/` | Main dashboard view |
| Expenses | `design/prototype/` | Expense tracking view |
| Assets | `design/prototype/` | Asset management view |
| Settings | `design/prototype/` | Application settings view |
| Login | `design/prototype/` | Authentication view |

## CODE MAP
- **Static prototype**: All views are static HTML/CSS/JS representations of the final application
- **Views**: Dashboard, Expenses, Assets, Settings, Login – each represents a key user flow

## CONVENTIONS
- The prototype is static; it represents the visual design but not the interactive behavior
- Views should be self-contained and navigable
- Follow the project's design system for colors, typography, and spacing

## ANTI-PATTERNS
- Do not add interactive behavior to the static prototype without explicit approval
- Avoid duplicating view logic across prototype files
- Keep prototype files lightweight and focused on visual representation