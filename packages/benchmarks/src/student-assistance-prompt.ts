export const STUDENT_ASSISTANCE_SYSTEM_PROMPT = `Build an AI-Powered Student Assistance System for a college. The system must serve three user roles: Students, Faculty, and Administrators.

## Objective
Create a comprehensive web application that helps students track academic progress, faculty manage courses and grading, and administrators oversee institutional metrics. The system must be a functional application, not a static mockup.

## Student Features
- Dashboard showing current GPA, enrolled courses, upcoming assignments, and degree progress
- Course registration with real-time seat availability and prerequisite checking
- Grade viewer with assignment breakdowns, weighting, and instructor feedback
- Academic planner with drag-and-drop semester scheduling and graduation timeline
- Notification center for deadlines, announcements, and advisor messages
- Resource library with searchable campus services, tutoring schedules, and FAQ
- Mobile-responsive design with offline-capable progressive web app support

## Faculty Features
- Course management: create/edit syllabi, set grading schemas, define rubrics
- Gradebook with bulk entry, curve application, late penalty automation, and audit trail
- Assignment builder supporting multiple question types (MCQ, essay, code, file upload)
- Attendance tracking with QR code check-in and manual override
- Communication tools: announcements, direct messaging, discussion forums
- Analytics dashboard showing class performance, engagement, and at-risk students
- Integration with LMS (Canvas, Blackboard) via LTI 1.3 and REST APIs

## Administrator Features
- Institutional dashboard: enrollment trends, retention rates, degree completion metrics
- User management: role assignment, bulk import/export, SSO integration (SAML/OIDC)
- Course catalog management: program requirements, course equivalencies, transfer credits
- Reporting engine with scheduled exports (CSV, PDF, JSON) and custom query builder
- Audit logging for all grade changes, enrollment actions, and permission modifications
- Tenant configuration: branding, academic calendar, grading scales, notification templates
- API gateway with rate limiting, webhook subscriptions, and developer portal

## Technology Stack (MANDATORY)
- Frontend: React 18 with TypeScript, Vite, TanStack Query, Tailwind CSS
- Backend: Node.js 20 LTS with Fastify, TypeScript, Prisma ORM
- Database: PostgreSQL 15 with Row Level Security policies
- Authentication: Auth.js (NextAuth) with email/password, OAuth2, and magic links
- Real-time: Socket.io for notifications and collaborative features
- Testing: Vitest for unit, Playwright for E2E, MSW for API mocking
- CI/CD: GitHub Actions with preview deployments to Vercel/Render
- Monitoring: Sentry for errors, PostHog for analytics, Prometheus/Grafana for metrics

## Functional Requirements (NON-NEGOTIABLE)
1. All pages must be server-rendered or statically generated where possible
2. API routes must use Zod validation for all inputs and outputs
3. Database migrations must be version-controlled and reversible
4. Role-based access control enforced at both API and UI layers
5. All user-facing text must support i18n (English, Spanish, French)
6. WCAG 2.1 AA compliance for all interactive components
7. Zero-downtime deployments with feature flags
8. Automated backup and point-in-time recovery for PostgreSQL

## Navigation & UX Constraints
- Primary navigation: persistent sidebar with role-adaptive menu items
- Breadcrumbs on all pages deeper than level 2
- Keyboard shortcuts for power users (/, g+i for inbox, g+c for courses)
- Command palette (Cmd+K) for global search and quick actions
- Loading states must use skeleton screens, not spinners
- Error boundaries at route and component level with recovery actions

## Explicit Prohibitions
- DO NOT use class components or legacy React APIs
- DO NOT use any CSS-in-JS solution (styled-components, emotion)
- DO NOT use Redux or MobX (TanStack Query + Zustand only)
- DO NOT use MongoDB, Firebase, or Supabase (PostgreSQL only)
- DO NOT build a static mockup — build a functional application
- DO NOT hardcode secrets; use environment variables and secret manager
- DO NOT skip tests; minimum 80% coverage for critical paths

## Output Format
Return a project specification document with:
- Architecture decision records (ADRs) for key choices
- Database schema (Prisma schema format)
- API contract (OpenAPI 3.0 YAML)
- Component hierarchy and state management diagram
- Implementation sequence with milestones
- Risk assessment and mitigation strategies`;

export const STUDENT_ASSISTANCE_PROMPT_TOKEN_ESTIMATE = 2800;