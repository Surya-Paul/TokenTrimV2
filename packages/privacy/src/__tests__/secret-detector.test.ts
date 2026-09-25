import { describe, it, expect, beforeEach } from 'vitest';
import { SecretDetector, createDefaultPrivacySettings } from '../secret-detector';
import { PrivacySettings } from '@tokentrim/shared';

describe('SecretDetector', () => {
  let detector: SecretDetector;

  beforeEach(() => {
    detector = new SecretDetector(createDefaultPrivacySettings());
  });

  describe('API Key Detection', () => {
    it('detects OpenAI-style API keys', () => {
      const text = 'My API key is sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'api_key')).toBe(true);
    });

    it('detects GitHub tokens', () => {
      const text = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'api_key')).toBe(true);
    });

    it('detects generic API key patterns', () => {
      const text = 'api_key = "supersecretkey12345678901234567890"';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
    });
  });

  describe('JWT Detection', () => {
    it('detects JWT tokens', () => {
      const text = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'jwt')).toBe(true);
    });
  });

  describe('AWS Credentials', () => {
    it('detects AWS access keys', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'aws_credentials')).toBe(true);
    });
  });

  describe('Private Keys', () => {
    it('detects RSA private keys', () => {
      const text = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`;
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'private_key')).toBe(true);
    });

    it('detects SSH private keys', () => {
      const text = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
-----END OPENSSH PRIVATE KEY-----`;
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'private_key')).toBe(true);
    });
  });

  describe('Database URLs', () => {
    it('detects postgres URLs with credentials', () => {
      const text = 'postgres://user:password123@localhost:5432/db';
      const result = detector.scan(text);
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'database_credentials')).toBe(true);
    });
  });

  describe('Masking', () => {
    it('masks secrets in text', () => {
      const text = 'My key is sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012';
      const masked = detector.maskSecrets(text);
      expect(masked).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012');
      expect(masked).toContain('sk-' + '*'.repeat(45) + '012');
    });

    it('masks JWT tokens', () => {
      const text = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const masked = detector.maskSecrets(text);
      expect(masked).toContain('eyJh**********.eyJz**********.SflK**********');
    });
  });

  describe('Cloud Sending Policy', () => {
    it('blocks cloud when secrets detected and neverSendSecrets=true', () => {
      const text = 'API key: sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012';
      const canSend = detector.canSendToCloud(text);
      expect(canSend.allowed).toBe(false);
      expect(canSend.reason).toContain('Secrets detected');
    });

    it('allows cloud when no secrets', () => {
      const text = 'This is a normal prompt without secrets';
      const canSend = detector.canSendToCloud(text);
      expect(canSend.allowed).toBe(true);
    });
  });

  describe('Risk Levels', () => {
    it('returns critical for private keys', () => {
      const text = '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----';
      const result = detector.scan(text);
      expect(result.riskLevel).toBe('critical');
    });

    it('returns high for AWS keys', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const result = detector.scan(text);
      expect(result.riskLevel).toBe('critical');
    });

    it('returns none for clean text', () => {
      const text = 'This is a normal prompt';
      const result = detector.scan(text);
      expect(result.riskLevel).toBe('none');
    });
  });

  describe('Password False-Positive Regression', () => {
    const STUDENT_ASSISTANCE_PROMPT = `Build an AI-Powered Student Assistance System for a college. The system must serve three user roles: Students, Faculty, and Administrators.

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

    it('accepts the full Student Assistance System prompt with no secrets', () => {
      const result = detector.scan(STUDENT_ASSISTANCE_PROMPT);
      expect(result.hasSecrets).toBe(false);
      expect(result.riskLevel).toBe('none');
    });

    it('accepts "Password strength indicator"', () => {
      const result = detector.scan('Password strength indicator');
      expect(result.hasSecrets).toBe(false);
    });

    it('accepts "Password\\n\\nOptions:"', () => {
      const result = detector.scan('Password\n\nOptions:');
      expect(result.hasSecrets).toBe(false);
    });

    it('accepts "Confirm Password"', () => {
      const result = detector.scan('Confirm Password');
      expect(result.hasSecrets).toBe(false);
    });

    it('accepts "Forgot password"', () => {
      const result = detector.scan('Forgot password');
      expect(result.hasSecrets).toBe(false);
    });

    it('accepts "Change password"', () => {
      const result = detector.scan('Change password');
      expect(result.hasSecrets).toBe(false);
    });

    it('accepts markdown list field "- Password"', () => {
      const result = detector.scan('- Password\n- Username\n- Email');
      expect(result.hasSecrets).toBe(false);
    });

    it('accepts documentation about password hashing', () => {
      const result = detector.scan('Password hashing should use bcrypt with a cost factor of 12. The password must be at least 8 characters.');
      expect(result.hasSecrets).toBe(false);
    });

    it('accepts "email/password, OAuth2, and magic links"', () => {
      const result = detector.scan('Authentication: Auth.js (NextAuth) with email/password, OAuth2, and magic links');
      expect(result.hasSecrets).toBe(false);
    });

    it('accepts .env.example placeholders', () => {
      const texts = [
        'PASSWORD=your_password_here',
        'PASSWORD=${PASSWORD}',
        'PASSWORD=<password>',
        'PASSWORD=changeme123',
        'DATABASE_URL=',
      ];
      for (const text of texts) {
        const result = detector.scan(text);
        expect(result.hasSecrets).toBe(false);
      }
    });
  });

  describe('Real Credential Blocking', () => {
    it('blocks "password: RealPassword123" as password type', () => {
      const result = detector.scan('password: RealPassword123');
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'password')).toBe(true);
      // Must NOT be classified as database_credentials
      expect(result.secrets.some(s => s.type === 'database_credentials')).toBe(false);
    });

    it('blocks "password=RealPassword123"', () => {
      const result = detector.scan('password=RealPassword123');
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'password')).toBe(true);
    });

    it('blocks password = "RealPassword123"', () => {
      const result = detector.scan('password = "RealPassword123"');
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'password')).toBe(true);
    });

    it('blocks PASSWORD="RealPassword123"', () => {
      const result = detector.scan('PASSWORD="RealPassword123"');
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'password')).toBe(true);
    });

    it('blocks real PostgreSQL connection string as database_credentials', () => {
      const result = detector.scan('DATABASE_URL=postgresql://admin:RealPassword123@prod.example.com:5432/app');
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'database_credentials')).toBe(true);
    });

    it('still blocks JWTs', () => {
      const result = detector.scan('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'jwt')).toBe(true);
    });

    it('still blocks AWS credentials', () => {
      const result = detector.scan('AKIAIOSFODNN7EXAMPLE');
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'aws_credentials')).toBe(true);
    });

    it('still blocks private keys', () => {
      const result = detector.scan('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----');
      expect(result.hasSecrets).toBe(true);
      expect(result.secrets.some(s => s.type === 'private_key')).toBe(true);
    });
  });
});