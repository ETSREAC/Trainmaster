# Rule: TrainMaster Versioning & Release Steering

Whenever a feature, bugfix, or change is made to the TrainMaster project:

1. **Version Classification Decision**:
   - **MAJOR (`X.0.0`)**: Breaking API/protocol changes, incompatible layout schema changes, architectural overhauls.
   - **MINOR / Sub-Version (`1.X.0`)**: New features, new hardware drivers, new UI tabs, new language systems, backwards-compatible extensions.
   - **PATCH / Sub-Sub-Version (`1.0.X`)**: Bugfixes, UI/CSS refinements, performance enhancements, docs/text fixes.

2. **Action Requirements**:
   - Decide the classification and state the rationale.
   - Update `version` in:
     - `package.json`
     - `client/package.json`
     - `server/package.json`
     - `client/index.html` (Header badge)
   - Update `CHANGELOG.md` with the new version section, date, and items under `Added`, `Changed`, or `Fixed`.
   - Build and verify: `npm run build` in client and server.
   - Commit and push to Git remote `origin main`.
