<!-- Aura & Loom Inventory Studio workspace guidance -->
- [x] Verify that this copilot-instructions.md file exists in .github.
- [x] Clarify project requirements: React/Vite, Express, PostgreSQL, inventory operations, webhook and dashboard.
- [x] Scaffold the frontend and backend workspaces.
- [x] Customize the project: transactional inventory APIs, webhook, database seed/schema, and responsive dashboard are implemented.
- [x] Install required extensions: none specified.
- [x] Compile the project and resolve validation errors (typecheck and production build pass).
- [x] Create and run a development task.
- [ ] Launch the project after user confirmation.
- [x] Ensure README and workspace documentation are complete.

Project conventions: keep the Vite React UI in frontend/, Express TypeScript API in backend/, and PostgreSQL DDL in backend/sql/schema.sql. All inventory mutations must be transactional and enforce nonnegative stock. Keep credentials in environment variables; never commit .env files.
