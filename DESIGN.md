---
name: Sanctuary Ops
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006a61'
  on-secondary: '#ffffff'
  secondary-container: '#86f2e4'
  on-secondary-container: '#006f66'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#331200'
  on-tertiary-container: '#cf6721'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#89f5e7'
  secondary-fixed-dim: '#6bd8cb'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#005049'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
  status-pending: '#94A3B8'
  status-member: '#0EA5E9'
  status-head: '#6366F1'
  status-coordinator: '#10B981'
  surface-muted: '#F8FAFC'
  border-subtle: '#E2E8F0'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  container-max: 1440px
---

## Brand & Style

The design system is built on a foundation of **trust, efficiency, and structural integrity**. As a platform for church operations, it must balance the warmth of community with the rigorous precision required for service coordination. The aesthetic follows a **Corporate Modern** approach with a **Minimalist** focus on data density and information hierarchy.

The target audience consists of church administrators, department heads, and volunteers who need to move quickly between high-level oversight and granular task execution. The UI evokes a sense of "calm control"—avoiding unnecessary decorative elements in favor of high-contrast typography, functional layouts, and clear state-driven indicators.

**Key Stylistic Principles:**
- **Clarity over Decoration:** Every element serves a functional purpose.
- **State-First Design:** Using color and iconography to communicate the status of checklists and attendance at a glance.
- **Technical Sophistication:** A clean, professional look that inspires confidence in the platform's AI-assisted capabilities.

## Colors

The palette is anchored by **Deep Navy (#0F172A)**, providing a professional and authoritative base. The primary action and accent color is **Vibrant Teal (#0D9488)**, chosen for its association with growth and clarity. A **Soft Gold (#B45309)** is reserved for high-priority alerts or specific "Admin-only" indicators.

The checklist system utilizes a specific chromatic progression to represent the three-stage verification chain:
1. **Pending:** Slate Gray (Neutrality/Inaction)
2. **Member Complete:** Sky Blue (Action Initiated)
3. **Head Verified:** Indigo (Verification in Progress)
4. **Coordinator Verified:** Emerald (Finalized/Success)

The background utilizes a clean white surface with **Surface Muted (#F8FAFC)** for container nesting to maintain a flat, modern depth.

## Typography

This design system uses **Hanken Grotesk** as its primary typeface. It is a sharp, contemporary sans-serif that maintains exceptional legibility in data-heavy environments while feeling approachable. 

**JetBrains Mono** is introduced for labels, status indicators, and metadata. This monospaced font provides a functional, "instrument-panel" feel that distinguishes administrative data from standard content, reinforcing the platform's focus on operational efficiency and AI tool-calling logs.

- **Headlines:** Bold weights with slight negative letter-spacing for a grounded, professional look.
- **Body:** Standardized on 16px for optimal readability on web interfaces.
- **Labels:** Used for timestamps, "Verified by" tags, and technical metadata.

## Layout & Spacing

The layout utilizes a **Fixed Grid** philosophy for desktop to ensure data visualizations and dashboards remain consistent across wide displays, centering the content at a maximum width of 1440px. 

- **Grid System:** A 12-column grid with 24px gutters. 
- **Dashboards:** Use a bento-box style layout where "cards" span 3, 4, 6, or 12 columns depending on information priority.
- **Service Planner:** Uses a vertical timeline-based layout where the left column is fixed for "Start Time" and "Duration" (JetBrains Mono) and the right column expands for "Session Name" and "Assigned User."
- **Mobile Adaptivity:** On mobile, the 12-column grid collapses to 1 column. Progress bars and status indicators transition from horizontal to vertical stacks to maintain legibility.

## Elevation & Depth

This design system uses **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows to convey depth. This ensures the UI remains clean and "functional" rather than "decorative."

- **Level 0 (Background):** The base layer of the application (#FFFFFF).
- **Level 1 (Cards/Sections):** Uses a subtle background fill (#F8FAFC) and a 1px border (#E2E8F0).
- **Level 2 (Modals/Popovers):** Uses a sharp, high-diffusion shadow (Blur 12px, 4% Opacity) to separate critical overlays from the dashboard.
- **Active State:** Elements being hovered or interacted with utilize a 2px solid border in the Primary color to indicate focus without changing the layout size.

## Shapes

The shape language is **Soft (0.25rem)**. This provides a subtle modern touch that softens the "industrial" feel of the navy/slate palette without appearing overly consumer-oriented or "bubbly."

- **Standard Buttons & Inputs:** 0.25rem (4px) corner radius.
- **Cards & Dashboard Containers:** 0.5rem (8px) corner radius.
- **Status Chips:** 1rem (Pill-shaped) to distinguish them clearly from interactive buttons.
- **Progress Bars:** Fully rounded (pill) ends to indicate fluid movement and completion.

## Components

### 1. Checklist Items (3-Stage)
Checklist items are the core of the system. Each row must display:
- **Checkbox:** Visual state mirrors the current stage.
- **Stage Badges:** Small, pill-shaped chips using the status colors (Pending, Member, Head, Coordinator).
- **Metadata:** A label-sm timestamp and name of the last person who verified the item.

### 2. Status-Driven Progress Bars
Used on the dashboard to show readiness.
- **Background:** Light gray track.
- **Fill:** Multi-segmented color indicating how much of the "completion" is at which stage (e.g., 20% Teal for member-complete, 40% Indigo for head-verified).

### 3. Data-Heavy Dashboards
Containers should use a white background with a subtle `#E2E8F0` border. Headers within cards should use `headline-md` with a primary navy color.

### 4. AI Assistant Entry Point
A persistent, floating action button (FAB) or a docked input bar at the bottom of the screen. It should be styled with a subtle gradient or unique border glow to signify it as a "special" AI-powered layer, distinct from standard form fields.

### 5. Input Fields
Inputs use a white background, 1px slate border, and `body-sm` text. Focus states must use a 2px Teal border. Error states use a 2px border in a standard Red-500.

### 6. Service Planner Rows
Rows in the planner should use alternating subtle backgrounds for readability. The "Start Time" column should be visually locked/greyed out for all sessions except the first, emphasizing the "cascade" logic.