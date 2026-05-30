# User UI Migration (Helix Design)

Date: 2026-05-30

## Summary
Migrate the Vizzy user-facing pages to the new Helix UI design while keeping the existing React Router setup, backend integrations, and Chart.js charts. The admin/public areas remain unchanged. The user layout switches from a sidebar to a top navigation layout, with a scoped theme so the new palette applies only to user pages.

## Goals
- Apply the Helix visual system to user pages only.
- Replace the user sidebar with the Helix top navigation.
- Keep current routing, data flow, and API usage intact.
- Keep Chart.js as the charting library; no Recharts migration.
- Minimize impact on admin and public pages.

## Non-Goals
- Changing backend services or API contracts.
- Changing the router implementation or route paths.
- Redesigning admin or public pages.
- Replacing Chart.js with another charting library.

## Scope and Boundaries
- **In scope:** user routes under `/user/*`, the user layout, shared UI primitives, and scoped CSS tokens.
- **Out of scope:** public landing/login/register, admin pages, server code, routing configuration.

## Proposed Approach
### 1) Scoped theme for user pages
- Add Helix palette tokens, utility classes, and UI helpers from the UI design CSS.
- Scope the new CSS under a wrapper class (e.g., `.helix-scope`) to avoid impacting admin/public pages.
- Apply this wrapper class at the user layout root so only user pages inherit the Helix theme.

### 2) New layout and navigation
- Replace the user sidebar with a top navigation layout.
- Create a `TopNav` and `PageHeader` component based on the UI design patterns.
- Use `react-router-dom` `Link` and `useLocation` for active link state.

### 3) Shared UI primitives
- Add `Panel`, `PanelHeader`, `Pill`, `BtnGhost`, `BtnSecondary`, `BtnPrimary`, `BtnAccent`, and `Kbd`.
- Use the existing `cn` helper from `frontend/src/lib/utils.ts`.
- Update user pages to compose these primitives to match the UI design layout.

### 4) Charts stay Chart.js
- Preserve all existing Chart.js components and data flows.
- Only rewrap chart sections with Helix `Panel` containers and headers to match layout.

## Page Mapping and Layout Notes
### User Dashboard
- Match the Helix dashboard layout: KPI banner, filters bar, grid layout, panels, and footer action bar.
- Keep existing Chart.js charts and data. Rewrap with `Panel` and `PanelHeader`.

### Datasets
- Replace header and table chrome with Helix layout while keeping dataset loading logic.
- Use `PageHeader`, `Panel`, and Helix table styling.

### Upload
- Keep existing upload flow and status logic.
- Apply Helix upload layout and visual styling around the existing interactions.

### Chat
- Keep current chat logic and AI artifacts rendering.
- Apply Helix split layout (sessions + thread + artifact panel) using current data.

### Cleaning
- Keep inspection and actions intact.
- Apply Helix health dashboard layout and recommendation table styling.

### Connect Database
- Keep current connection form and test logic.
- Apply Helix provider list + configuration layout.

### Downloads
- Keep download logic intact.
- Apply Helix export table and header layout.

### Profile
- Keep profile API and stats intact.
- Apply Helix profile card, KPI grid, and activity chart layout.

## Compatibility and Risk Mitigation
- **CSS collisions:** Scope Helix tokens under `.helix-scope` to prevent conflicts with the current Vizzy theme.
- **Chart layout:** Some panels may need CSS tweaks for Chart.js canvas sizing.
- **Typography:** Keep font imports in the user layout only to avoid impacting public/admin pages.

## Testing Plan
- Manual navigation through all `/user/*` routes:
  - Dashboard: verify KPIs and charts render correctly.
  - Datasets: verify dataset list loads and actions still work.
  - Upload: verify drag/drop and upload progress still work.
  - Chat: verify message flow and artifact pane render correctly.
  - Cleaning: verify inspection flow and action buttons still work.
  - Connect: verify provider selection and test connection.
  - Downloads: verify download actions and table layout.
  - Profile: verify stats, edit modal, and charts.
- Visual regression check across light/dark modes.

## Rollback Plan
- Revert the user layout file and the scoped CSS additions.
- Remove the Helix UI primitive components if needed.

## Deliverables
- Helix-themed user layout with top navigation.
- Scoped Helix theme tokens in `index.css`.
- Shared Helix UI primitives for consistent layout.
- Updated user pages mapped to the Helix UI design, retaining existing logic and Chart.js charts.
