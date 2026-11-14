# Release verification

[Production](https://before-the-click.vercel.app) · [Vercel environment settings](https://vercel.com/adeelfalaksher900-creators-projects/before-the-click/settings/environment-variables)

| Feature | Verification |
| --- | --- |
| Workspace and team invitations | Production Postgres created a temporary workspace, denied acceptance by the wrong account, and accepted both assigned reviewers. |
| Approval and revision | A second reviewer could not approve ahead of the first. A request for changes created a new version, and the old version could no longer be approved. Two reviewers then approved the revised content. |
| Publish and audit | The approved revision was saved and read back from `workspace_records`. Repeating publication returned the same record and left a single completion event. A member exported the workspace audit history. |
| Workspace isolation | An authenticated nonmember was denied the complete audit export and could read neither the workflow nor its published record. The temporary production test data was rolled back. |
| Responsive website | The action preview controls, guide navigation and account form modes passed desktop and 390 px mobile Chromium checks against the production build. The live homepage served the updated preview after deployment. |
| Authentication | The production workspace redirected a signed-out visitor to sign-in. Username sign-up and recovery codes replace email-based accounts. |
| Google integrations | OAuth credentials were absent in Vercel. The connectors are implemented. A live account connection, read, approved write, and result readback for each provider remain to be verified. Drive access is limited to files granted to this app. |
| Drafting | Production's planner status reported Gemini Flash-Lite configured. The authenticated workspace drafting endpoint and optional OpenRouter fallback require separate live verification. |

Test Gmail with two dedicated test mailboxes, Calendar with a private test event, and Drive with two app-authorized private folders. Independently read back each provider result and check the corresponding audit receipt. Use two unique test usernames to check enrollment, account isolation, invitation acceptance and recovery.
