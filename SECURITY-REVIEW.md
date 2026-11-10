# Pre-publication security review

Reviewed the new certification-workspace application using the security-review skill.

Critical: none. High: none. Medium: none. Low: none found in the reviewed application surface.

Surface: static files, local browser progress, practice/exam forms, and a user-selected JSON backup. No backend, authentication implementation, database, analytics, audio, or external runtime services. Hosting access is enforced by Sites owner-private access controls; it is not simulated by client code.

Source content is escaped at every HTML rendering boundary. Source field presence, question IDs, choice references and optional explanations are validated before rendering. Backups have a 5 MB byte limit, strict types, known question/choice IDs, session bounds and deadline validation; only recognized fields are copied into state. Malformed imports leave existing state untouched. Unreadable stored data is preserved, and saving is blocked until a valid import replaces it. Storage exceptions produce visible warnings and allow export.

The only runtime HTTP request is the local static source JSON through a wrapper with a 15-second timeout and explicit error handling. No eval, remote scripts, inline handlers, or dependencies. Static CSP is present in index.html; local server and deployable _headers also declare nosniff, referrer policy, CSP and frame-ancestors. Browser checks found no application console errors, failed resources, or CSP violations.

The new files were checked for credential/private-key patterns; none found. Source study text mentioning passwords or shared secrets is educational content. The Sites credential remains in session memory and travels through the supported helper's hidden stdin; it is not written to project files. The hosting sync uses an ignored standalone repository, preserving the shared repository and its remotes.

`npm audit --json`: zero vulnerabilities and zero third-party dependencies. The externally installed Playwright tool is used for local QA only and is absent from deployment assets. Two local font families retain their upstream OFL licenses.

Limitations: this is a browser-local study tool, not a secure/proctored exam. Answer keys necessarily exist in the downloaded source JSON. The absolute timer protects against ordinary refresh/closure; local clock or storage tampering is outside the requested static architecture. Browser storage is not encrypted and is specific to origin/device. Exports are user-controlled JSON backups. Do not store credentials in the app.

Decision: ship the reviewed static application privately.
