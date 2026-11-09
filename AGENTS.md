# Repository instructions

All text files must be created, edited, read, and saved as UTF-8. Explicitly specify UTF-8 in scripts; never use CP949/EUC-KR or the Windows default code page.

Concert fixtures are fictional. Keep the preview disclosure visible until verified official data is connected. Saving an event must not be described as scheduling a push notification before push delivery exists.

## Concert automation direction

Before continuing concert collection/publication work, read [the API-first automation plan](docs/api-first-concert-publication-plan.md). The user wants deterministic scheduled API ingestion and silent publication without an AI dependency in normal runs. The plan distinguishes the proposed publication criteria from currently deployed guards; reading it does not authorize bypassing guards, changing production policy, or enabling a paused schedule. Preserve existing checkpoints and consult current user authorization before operational work.

For local UI or concert deduplication work, also read [the current runtime handoff](docs/release/local-ui-and-concert-dedup-handoff.md). It distinguishes deployed code and verified publication receipts from the unverified recurring schedule, identifies valid city/date variants, and records withdrawn test data. Preserve runtime checkpoints and do not replay setup or revive paused ChatGPT tasks while changing UI.

## Commit workflow

Follow CONTRIBUTING.md for commit types, validation, and the PR workflow.
During authorized development, commit each completed, validated logical change on the task branch instead of collecting an entire day's unrelated work into one commit. Use `<type>: <change purpose>` titles. Stage only files and hunks belonging to that change; never include unrelated user edits.
Choose commit boundaries by independently explainable behavior or purpose, not file count, elapsed time, or a daily commit quota. Keep dependent code together so each commit remains usable. Do not create empty commits, artificial changes, or split a working change into broken intermediate commits to inflate activity.
Run checks appropriate to the change before committing and record actual results and any limitations in the commit body or PR. Documentation-only changes need content and diff checks; application changes need lint/build and relevant behavior checks. Reuse passing checks when the validated files have not changed.
Use feature branches and PRs targeting `dev`; release integration into `main` also goes through a PR. Commit locally at completed checkpoints; push, publish PRs, and merge only within the user's authorized scope. Report completed commits and any blocked Git operations.
