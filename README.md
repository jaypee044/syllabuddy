# Syllabuddy

Upload a syllabus, check the deadlines the AI extracts, and get a week-by-week study plan with crunch weeks flagged. Download it as a calendar file.

## Run it

```bash
npm install
cp .env.local.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev                         # http://localhost:3000
```

No API key yet? Click **Try a sample semester** to use the planner with built-in data.

## How it works

1. `app/api/extract/route.ts` sends the PDF, image or pasted text to the AI and forces a structured tool call, so the response is always JSON (course, items, dates, grade weights).
2. `components/ReviewTable.tsx` lets the student fix anything before it is used.
3. `lib/planner.ts` spreads work across the days before each deadline (earliest deadline first, within daily hour limits) and flags weeks with 3+ deadlines, 40%+ of the grade due, or study time near the limit.
4. `lib/ics.ts` exports deadlines and study blocks as an `.ics` file for Google or Apple Calendar.

"I fell behind: re-plan from today" regenerates the plan from today, skipping anything marked done.

**Something changed?** Describe a change in plain English ("I'm sick Thursday to Sunday", "the Econ essay is now due 6 November"). The AI turns it into a small set of validated adjustments (`app/api/adjust/route.ts`, `lib/adjust.ts`), you approve them, and the planner re-plans around them. All AI calls go through `lib/llm.ts`, which adds timeouts and a retry. See `SAFETY.md` for the risks and safeguards.

## Evaluation

`npm run eval` runs the real syllabus-reading step on six test syllabi with known answers, including two attacks, and writes the scores to `eval/results.md`. It needs a key in `.env.local`. Test cases live in `eval/cases.ts`.

## Demo

`DEMO.md` has a three-minute demo script, a backup plan, and answers to likely judge questions.

## Tests

```bash
npm test
```
