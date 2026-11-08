<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# DIGITAL CAMPUS — PROJECT RULES

## 1. Project overview
Digital Campus is an AI-powered university
platform for MGIMO.

The platform has three user roles:
- Student
- Teacher
- Dean's Office

All roles work with one shared database.

## 2. Core principles
- Follow the approved project specification.
- Never invent or silently change business rules.
- Do not remove approved functionality.
- Do not replace real functionality with mock data.
- Ask before making architectural decisions
  that affect existing requirements.
- Work in small, verifiable steps.

## 3. Technology
- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- PostgreSQL (planned database)
- Server-side authorization and validation

Use the existing project structure.
Do not introduce unnecessary dependencies.

## 4. Security
- Enforce RBAC on the server.
- Never rely on hidden UI elements for security.
- Validate all mutations on the server.
- Protect private user data.
- Never expose API keys or secrets.
- Require explicit confirmation for protected actions.

## 5. Design system
Visual direction: Electric Blue City.

Design requirements:
- Dark navy and electric blue palette.
- Bright magenta accents.
- Modern editorial typography.
- Clean layouts and clear hierarchy.
- Subtle gradients and geometric details.
- Consistent navigation across pages.
- Avoid excessive visual effects.

Use the approved visual references.
Do not redesign approved components without asking.

## 6. Development workflow
For every task:
1. Inspect existing code.
2. Explain the planned changes.
3. Implement only the agreed scope.
4. Run relevant tests and checks.
5. Report changed files and results.
6. Do not commit without user approval.

Use meaningful Git commit messages.
Never use destructive Git commands without approval.

## 7. Quality requirements
- TypeScript without unnecessary any types.
- Handle loading, empty, error and forbidden states.
- Validate forms.
- Ensure responsive layouts.
- Preserve data integrity.
- Avoid duplicate operations.
- Test important user workflows.

## 8. Important restrictions
Do not implement AI actions that bypass
server authorization or user confirmation.

Do not change official academic records
without the approved workflow.

Do not claim functionality is implemented
unless it has been tested.

When requirements are ambiguous,
ask before making assumptions.