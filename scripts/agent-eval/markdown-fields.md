## Checking fields in Markdown

When changing a checker for human-written forms, trace the raw lines through every cleanup step. A leading `* ` can mark a list item. The paired asterisks in `**Impact:** fits on one track` enclose a label and its colon. Check that cleanup preserves the whole label and that the checker finds the answer on that line.

Here the following paragraph answers the standalone bold question.

```markdown
**What changed for players?**

Saved patterns now keep their track names.
```

Keep enough of the original line to recognize the heading after normalizing its words. Try replacing the answer paragraph with another bold heading. The first field should then be unanswered.

Before finishing, substitute a field the checker actually recognizes into both layouts. Check the complete description, including its other required text, through the normal entry point. If execution is unavailable, trace each input through the edited file and its final verdict.
