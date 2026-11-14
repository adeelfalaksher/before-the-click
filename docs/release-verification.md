# Release verification

[Production](https://before-the-click.vercel.app) · [Vercel environment settings](https://vercel.com/adeelfalaksher900-creators-projects/before-the-click/settings/environment-variables)

| Feature | Verification |
| --- | --- |
| Workspace and team invitations | Production Postgres created a temporary workspace, denied acceptance by the wrong account, and accepted both assigned reviewers. |
| Approval and revision | A second reviewer could not approve ahead of the first. A request for changes created a new version, and the old version could no longer be approved. Two reviewers then approved the revised content. |
| Publish and audit | The approved revision was saved and read back from `workspace_records`. Repeating publication returned the same record and left a single completion event. A member exported the workspace audit history. |
| Workspace isolation | An authenticated nonmember was denied the complete audit export and could read neither the workflow nor its published record. The temporary production test data was rolled back. |
| Responsive website | The restored hero without a dark frame, field guide, and navigation passed desktop, 320 px, and 390 px Chromium checks. |
| Authentication | The production workspace redirected a signed-out visitor to sign-in. Production accepted username sign-up and sign-in, rejected duplicates regardless of case, isolated workspaces, rotated the recovery code, and invalidated the old session after reset. |
| Google integrations | OAuth credentials were absent in Vercel. The connectors are implemented. A live account connection, read, approved write, and result readback for each provider remain to be verified. Drive access is limited to files granted to this app. |
| Drafting | The authenticated production drafting endpoint returned drafts from Gemini and the free OpenRouter router. |

Test Gmail with two dedicated test mailboxes, Calendar with a private test event, and Drive with two app-authorized private folders. Independently read back each provider result and check the corresponding audit receipt. Use two unique test usernames to check enrollment, account isolation, invitation acceptance and recovery.
