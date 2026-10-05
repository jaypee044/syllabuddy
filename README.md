# Syllabuddy

Upload your syllabi. Syllabuddy finds every deadline, you check them, and you get a week-by-week study plan that shows where the crunch is before it hits.

Built for the AI Lodge hackathon, track: **Productivity and workflows**.

## 1. Problem Statement

**The problem.** At the start of a semester, a student gets one syllabus per course, and each is written differently: a list, a paragraph, a table, a PDF, a photo of a slide. The deadlines are scattered across them. Nobody adds them up, so the week where three assignments and an exam collide only becomes obvious when it is already on top of them.

**Who has it.** Any university or college student taking several courses at once. Students juggling four or five courses, working part-time, or studying alone without a study group feel it most.

**Why it is worth solving.** Typing every deadline from every syllabus into a calendar is tedious, so most students don't do it, or do it halfway. The cost of missing the pattern is real: cramming, late submissions and lower grades. Spotting a crunch week three weeks ahead gives a student time to act. Spotting it the night before does not.

## 2. Solution Overview

Syllabuddy turns a pile of syllabi into one plan in four steps:

1. **Read.** The student uploads a PDF or photo, or pastes the assessment section. An AI model extracts each assessed item: course, title, type, due date and grade weight.
2. **Check.** Code verifies the AI's output against the syllabus text and flags anything doubtful. The student reviews an editable table before anything is planned.
3. **Plan.** A deterministic scheduler spreads study hours across the days before each deadline, within the student's daily limits, and flags crunch weeks.
4. **Adapt.** The student can say what changed in plain English ("I'm sick from Thursday to Sunday", "the Econ essay is now due 6 November"). The AI proposes small, validated changes, the student approves them, and the plan updates.

The AI does the two things that are hard to do with code: reading messy documents and understanding free-text updates. Everything else, including checking the AI's work, scheduling and crunch detection, is ordinary code that behaves predictably.

## 3. Key Features

- **Syllabus reading** from PDF, image (PNG, JPG, WEBP) or pasted text, for any number of courses. PDFs with a text layer are read as text, so they get the same date checking as pasted text
- **Today dashboard:** hours planned this week against available hours, the next deadline, share of grade due in the next 14 days, items needing attention, and today's study blocks
- **Verification of every extracted item:** each item must quote the line it came from. Quotes are checked against the pasted text, and the date, month and year in the quote must match. Items show a "verified" or "check this" mark
- **Editable review table** with a "Looks right" confirmation for flagged items, and a warning when a course's grade weights don't add up to 100%
- **Week-by-week study plan** (earliest deadline first, with daily hour limits) and **crunch-week detection**: 3 or more deadlines in a week, 40% or more of the grade due, or study time near the limit
- **"Something changed?"**: plain-English updates turned into validated changes that the student approves before they apply (time off, mark done, move a deadline, change study hours)
- **"I fell behind: re-plan from today"** to rebuild the plan from the current date, skipping finished work
- **Calendar export** as an `.ics` file for Google or Apple Calendar
- **Private by default:** the plan is saved only in the student's browser, with a one-click erase
- **Works without the AI** for the planner, dashboard and calendar export (try the built-in sample semester)

## 4. AI Integration

The AI is used in two places. Both go through one module, `lib/llm.ts`.

| Where | What the AI does | What code does |
| --- | --- | --- |
| **Syllabus extraction** (`app/api/extract/route.ts`, `lib/extraction.ts`) | Reads a PDF, image or pasted text and returns a fixed JSON structure: course, items, dates, grade weights, and the exact line each item came from | Verifies each quote against the text, checks dates against the quote, flags doubtful items, drops items that look like commands, and sets `done` to false itself. The AI's output is never trusted as-is |
| **Plan changes** (`app/api/adjust/route.ts`, `lib/adjust.ts`) | Turns a plain-English message into proposed changes, using only four allowed kinds | Validates every field, drops unknown items and bad dates, writes the plain-English description itself, and applies nothing until the student clicks Apply |

The AI **does not** build the plan. `lib/planner.ts` is deterministic code, so the same inputs always give the same plan and the student can predict what will happen.

**Design choices that go beyond calling an API:**
- **Structured output.** The model must return a fixed JSON shape, not free text.
- **Untrusted input.** The syllabus is treated as data. The prompt says so, and the output is checked for planted instructions.
- **Reliability.** Each call has a timeout, up to three attempts with backoff, and a fallback to another provider or model when one is busy or retired.
- **Human in the loop.** A review step sits between extraction and planning, and between the AI's proposed changes and the plan.

## 5. External Tools & Datasets

**AI models**
- **Google Gemini** through its REST API (`generateContent`, JSON output). The default model is `gemini-3.8-flash`, and the app falls back to other Flash models if it is unavailable. Used by default.
- **Anthropic API** (optional). If a valid `ANTHROPIC_API_KEY` is set, the app uses it first with a forced tool call for structured output. If it is missing or fails, the app falls back to Gemini.

**Libraries**
- Next.js 15 (App Router), React 19 and TypeScript
- `@anthropic-ai/sdk` for the optional Anthropic provider
- `unpdf` to read the text layer of PDFs on the server
- `tsx` for the tests and evaluation scripts
- Google Fonts: Bricolage Grotesque and Hanken Grotesk

**Datasets.** None. There is no training data and no external dataset. The test syllabi in `eval/cases.ts` and the sample semester in `lib/sample.ts` were written by us for this project.

## 6. Installation & Setup

**You need:** Node.js 20 or newer, and an AI key. A free Gemini key from [Google AI Studio](https://aistudio.google.com/apikey) is enough.

```bash
# 1. Get the code
git clone <your-repo-url>
cd semester-planner

# 2. Install dependencies
npm install

# 3. Add your key (create a file called .env.local in the project folder)
#    The file needs one line:
#    GEMINI_API_KEY=your-key-here

# 4. Start the app
npm run dev
# open http://localhost:3000
```

**Optional settings** in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Free Gemini key. Used when no Anthropic key is set |
| `ANTHROPIC_API_KEY` | Use Anthropic instead. Needs a paid key |
| `GEMINI_MODEL` | Override the default Gemini model |
| `ANTHROPIC_MODEL` | Override the default Anthropic model |

**No key?** Click **Try a sample semester**. The planner, dashboard and calendar export work without the AI. Reading syllabi and "Something changed?" need a key.

**Try the safety demo:** on the intake panel, click **Fill in injection test**, then **Extract deadlines**.

**Run the tests** (no key needed):

```bash
npm test
```

**Run the evaluation** (needs a key; calls the real model and writes `eval/results.md`):

```bash
npm run eval
```

**Troubleshooting**
- *"The AI service is busy"*: the free tier is sometimes overloaded. The app retries and falls back to another model automatically. Wait a moment and try again.
- *`.env.local` changes not picked up*: restart `npm run dev`.
- *Project inside OneDrive and `npm run dev` fails with `EINVAL readlink`*: delete the `.next` folder, or move the project out of OneDrive.

## 7. AI Safety & Limitations

The syllabus a student uploads is untrusted, and the model can be wrong or be tricked. The design assumes both and checks everything the model returns before the student relies on it. The full risk table is in [`SAFETY.md`](./SAFETY.md).

### Main risks and guardrails

| Risk | Guardrail |
| --- | --- |
| **Prompt injection** (a syllabus says "ignore previous instructions…") | The prompt treats the syllabus as data. Output is a fixed structure. Input and output are scanned for instruction-like text, command-like items are dropped, and the student is warned. Item status (`done`) is never taken from the model |
| **Wrong or invented dates** | Each item must quote its source line. The server checks the quote exists and that its date, month and year match. Dates worked out from week numbers, and dates far in the past or future, are flagged |
| **Missed or misread grade weights** | Weights are totalled per course, and the student is warned when they don't add up to 100% |
| **Over-trusting the AI** | A human review step sits before planning. Every field is editable. The plan is built by deterministic code, not by the model |
| **AI acting on its own** | The model can only propose four kinds of change. Code validates each one, and nothing applies until the student approves |
| **Service failures** | Timeouts, retries with backoff, provider and model fallback, and clear error messages. The planner works without the AI |
| **Privacy** | Files are processed in memory and not stored on a server. The plan is saved only in the student's browser, with one-click erase. API keys stay on the server |
| **Abuse and cost** | 10 MB file limit, 60,000 character text limit, a 100-item cap and field length limits |

### Testing done

- **Unit tests** (`npm test`) cover the planner, the safety checks (20 checks), the plan-change validation (13), the evaluation scoring (9) and the dashboard (6). They include a case where the model is assumed to have obeyed a planted instruction, plus fabricated quotes, wrong dates and oversized output. These use simulated model output.
- **Evaluation on a real model** (`npm run eval`): six test syllabi with known answers, including a list, prose, week numbers, a numeric-date table and two attack syllabi. Run on 2026-10-05 with Gemini `gemini-3.8-flash`:

| Measure | Result |
| --- | --- |
| Deadlines found | 24 of 24 |
| Dates correct | 24 of 24 |
| Grade weights correct | 23 of 23 |
| Invented items | 0 |
| Attack syllabi where the model followed the planted instruction | 0 of 2 |
| Attack syllabi where the injection warning was shown | 2 of 2 |
| Items the model marked as done | 0 |

The full report is in [`eval/results.md`](./eval/results.md).

### Limitations

- **Small test set.** Six syllabi is a rough guide, not a guarantee. A different model, or a syllabus unlike these, could do worse.
- **Quote checking needs readable text.** It works on pasted text and on PDFs with a text layer. For scanned PDFs and photos there is no text to check against, so those items get plausibility checks and a warning to compare against the original.
- **The injection scan is pattern-based.** It catches common attacks and not every phrasing. It is one layer, alongside the fixed output structure and the human review step.
- **Wrong-date flagging is not exercised by the real-model run.** The model made no wrong dates in the evaluation, so that path is covered by unit tests with simulated bad output.
- **Study-hour estimates are rough.** They are a starting point, and every item's hours can be changed.
- **No sign-in or rate limiting.** A public deployment would need both.
- **Data terms.** The syllabus is sent to the AI provider. Check the provider's terms before using real student material, because free tiers can differ from paid ones.

## Project structure

```
app/            Next.js pages and API routes (/api/extract, /api/adjust)
components/     Intake, Dashboard, ReviewTable, AdjustPanel, PlanView
lib/            planner, safety checks, AI client, extraction prompt, calendar export
eval/           test syllabi, scoring, and the latest results
scripts/        tests and the evaluation runner
SAFETY.md       full risk table and measured results
DEMO.md         three-minute demo script
```
