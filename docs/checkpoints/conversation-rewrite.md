# Conversation rewrite — September 2026

The three example conversations in the Mattis document are the behavioral reference. The current user request takes precedence over their older widget examples.

The chat now owns getting acquainted, lesson planning, topic changes, homework corrections and appointment scheduling. Ordinary replies show a small typing indicator. Image upload and an optional manual homework editor remain practical controls. A confirmed plan has a compact current/next label.

Text and calculation images share the authenticated tutor handler, history, safety processing and replay behavior. The handler obtains task text, learner preferences, recent messages, learning notes, the actual plan and saved appointments from storage. It executes structured lesson actions before publishing one tutor message. When an action changes what the learner sees, the final response is composed from its actual result; normal tutoring still needs one generation. Legacy two-part opening messages are stored as one message.

The prompt distinguishes a correct intermediate step, a completed answer, a request to understand why and a session-control instruction. A correct answer can complete the task without another ritual question. A learner asking why stays on the same task. Clock thresholds advise the teacher; they no longer change the activity automatically. A learner can revisit an earlier task without reopening its mastery outcome.

Actions reuse existing authenticated data operations and existing JSON/profile fields; no database migration is required. New task and schedule IDs derive from the client message ID to recover a repeated action. Replacement tasks are created before remaining old tasks are retired. Homework corrections are checked against this session's detected tasks. Calendar inputs are validated, use Oslo time and reuse matching appointments. Safety responses suppress lesson actions and task completion.

Verification covers replacement failure/recovery, deferred actions, homework correction and confirmation, ownership checks, invalid/duplicate appointments, profile and plan contracts, stopping, and one published operational reply with idempotent replay. Mobile and desktop synthetic views were inspected, including the typing indicator. The real AI Gateway and a signed-in learner session were not exercised in this environment; the three full example conversations still need a preview run with live services before production rollout.
