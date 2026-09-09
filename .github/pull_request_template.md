## Requirement and scope

- Requirement / issue:
- Changes / intentionally excluded scope:
- Related PRs / shared interfaces or state:

## Pre-merge code review

- Reviewed base SHA / head SHA:
- Reviewer / review record (identify self-review explicitly):
- Findings: severity · file:line · trigger/impact · evidence · disposition (or none found):
- Remaining risks / unverified paths:

- [ ] Reviewed the affected call chain and cross-PR integration, not just the diff.
- [ ] Resolved blocking findings; reviewed later changes against current `main` and reran affected gates.
- [ ] Required CI passes for the reviewed head (fill at merge readiness, not in advance).

## Verification evidence

<!-- Record commands, tested SHA and actual results. Mark skipped checks with reasons. -->

- Checks / results:
- Evidence links:

## Human acceptance handoff

<!-- Normal acceptance is AFTER merge on main sandbox (3081). CI and agent checks are not human approval. -->

- Acceptance steps: where → action → expected outcome:
- Proposed scope / prerequisites (docs-only: documents to review):
- After merge: comment with the actual running SHA, technical results/blockers, and `qa:pending` handoff.
- On explicit human confirmation: append the decision, confirmer/time, tested SHA, scope/results and evidence; synchronize exactly one of `qa:pending`, `qa:passed`, `qa:failed`.

Do not check off human acceptance before it happens. Read the latest PR comments/labels before updating; do not overwrite a newer decision. Missing evidence or partial acceptance is not a whole-PR pass. A fix merge still needs explicit human re-acceptance. Keep post-merge records in PR comments, not a report-only commit.

## Learning

<!-- At every closeout/handoff, including blocked or pending work: 1–3 evidence-backed items, or explicitly “no new learning.” Append human feedback after acceptance. -->

- Observation → evidence → next action:

Workflow: [English](https://github.com/kedoupi/xiaotaozi-dsh/blob/main/docs/workflow.md#review-and-human-acceptance) · [中文](https://github.com/kedoupi/xiaotaozi-dsh/blob/main/docs/workflow.zh.md#代码审查与人工验收).
