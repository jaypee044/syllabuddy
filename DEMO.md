# Syllabuddy demo (3 minutes)

## Before you go on

- [ ] `npm run dev` is running and the page is open
- [ ] Run **Extract deadlines** once on your real syllabus so you know the AI is reachable. Items you extract are saved in the browser, so a refresh won't lose them
- [ ] Run `npm run eval` and paste the headline numbers into `SAFETY.md`. Have `eval/results.md` open in another tab
- [ ] Have one syllabus pasted and ready, plus the sample semester loaded in a second tab as a backup
- [ ] Say the numbers you show out loud from the screen. Don't quote figures you haven't seen in the app

## The script

**0:00 The problem (20 sec)**
"A student has four courses and four syllabi, each written differently. Nobody sees the week where three deadlines collide until it's on top of them. Syllabuddy finds that week early."

**0:20 Read a syllabus (40 sec)**
Paste or upload a syllabus and click **Extract deadlines**. Point at the summary pills: "The AI read these. Syllabuddy checked each one against the syllabus text, so these are verified and these two need a look." Fix one date to show a person stays in charge.

**1:00 See the crunch (45 sec)**
Show the plan. Point at the red bars: "These are crunch weeks." Click one and read the reason aloud. "The plan spreads study hours before each deadline, and it's built by code, not by the AI, so it's predictable."

**1:45 Something changed (30 sec)**
Type "I'm sick from Thursday to Sunday" and click **Suggest changes**. Read the suggestion, click **Apply and re-plan**, and show the plan moving. "The AI can only propose four kinds of change. Code checks every one, and nothing happens until the student approves."

**2:15 Safety (30 sec)**
Click **Fill in injection test**, then **Extract deadlines**. Show the warning and the flagged item. "This syllabus tries to give the AI orders. The planted item still doesn't get through unflagged."

**2:45 Close (15 sec)**
"We tested it on six syllabi, including two attacks. [Read the headline from eval/results.md.] Next: Google Calendar sync and course-load balancing across a whole degree."

## How each part answers a judging criterion

| Criterion | What to point at |
| --- | --- |
| AI integration effectiveness | The AI reads messy documents and understands plain-English updates. Code does the scheduling. Retries, timeouts and a fallback model keep it reliable |
| LLM safety and responsible AI | Verified pills, flagged items, the injection test, human approval before changes, `SAFETY.md`, and honest limits |
| Usefulness and business value | A concrete student story, the crunch-week warning, and the calendar download |

## If a judge asks

**"Isn't this just an LLM wrapper?"**
No. The AI does two things that are hard for code: reading messy syllabi and understanding plain-English changes. Everything else is code: checking the AI's output, the scheduler, crunch detection and the calendar export. We checked how the AI behaves with an evaluation script, not just by trying it.

**"What if the AI gets a date wrong?"**
Each item has to quote the line it came from. We check that the quote exists, and that its date, year included, matches. Anything doubtful is flagged and the student reviews the table before a plan exists.

**"What about prompt injection?"**
The syllabus is treated as data, and the AI can only return a fixed structure. We scan the input and the output, and we tested attacks, including a hidden "extend all deadlines" instruction. We also say what isn't covered: the scan is pattern-based, and quote checking works on pasted text and PDFs with a text layer, not on scans or photos.

**"What happens to student data?"**
The syllabus is sent to an AI service to be read and isn't stored on a server. The plan stays in the student's browser and can be erased from the footer.

**"Who would pay for this?"**
Students directly, or university learning-support teams who want students to see workload problems early. Say these are ideas you haven't tested.

**"How accurate is it?"**
Read the numbers from `eval/results.md`. Say it's a small test set and a rough guide.

## If something breaks on stage

- The AI is busy: say so, then switch to the sample semester tab. The plan, crunch weeks and calendar download work without the AI.
- "Suggest changes" fails: show a change you ran earlier, or edit a deadline in the table and watch the plan update.
- Keep the evaluation results open as proof that it worked when you tested it.
