import assert from "node:assert/strict";
import test from "node:test";
import {
	createDisplayEntryDrafts,
	findHighlightLines,
	normalizePhrases,
	transformAssistantMarkdown,
} from "../.pi/extensions/step-highlight/matcher.mjs";

const match = "Step 1/3: Inspect the API";

test("matches standalone numbered progress lines only", () => {
	assert.deepEqual(findHighlightLines(`${match}\nStep 2/3: Add tests`), [
		match,
		"Step 2/3: Add tests",
	]);
	assert.deepEqual(
		findHighlightLines(
			[
				"Step 1/3:",
				"Step 1 of 3: Inspect the API",
				"The current Step 1/3: Inspect the API is inline",
				"Step 1/3:   ",
				"Step 1/3: Real summary",
			].join("\n"),
		),
		["Step 1/3: Real summary"],
	);
});

test("finds several matches and preserves their order", () => {
	assert.deepEqual(
		findHighlightLines(`${match}\nordinary text\nStep 3/3: Verify in TUI`),
		[match, "Step 3/3: Verify in TUI"],
	);
});

test("matches whole-line Markdown emphasis and displays clean highlight text", () => {
	const emphasized = [
		`**${match}**`,
		`__Step 2/3: Write tests__`,
		`*Step 3/3: Verify output*`,
		`_Step 4/4: Finish_`,
	].join("\n");

	assert.deepEqual(findHighlightLines(emphasized), [
		match,
		"Step 2/3: Write tests",
		"Step 3/3: Verify output",
		"Step 4/4: Finish",
	]);
	assert.equal(
		transformAssistantMarkdown(emphasized, { messageType: "assistant", isStreaming: false }),
		"",
	);
	assert.deepEqual(
		createDisplayEntryDrafts({ role: "assistant", content: [{ type: "text", text: emphasized }] }),
		[
			{ type: "custom", customType: "step-highlight", data: { text: match } },
			{ type: "custom", customType: "step-highlight", data: { text: "Step 2/3: Write tests" } },
			{ type: "custom", customType: "step-highlight", data: { text: "Step 3/3: Verify output" } },
			{ type: "custom", customType: "step-highlight", data: { text: "Step 4/4: Finish" } },
		],
	);
});

test("handles CRLF without including carriage returns in highlight text", () => {
	assert.deepEqual(findHighlightLines(`${match}\r\nStep 2/3: Write tests`), [
		match,
		"Step 2/3: Write tests",
	]);
});

test("matches up to three leading Markdown spaces in both rendering paths", () => {
	const secondMatch = "Step 3/3: This final line should also be highlighted";
	const source = `   ${match}\n   This ordinary line stays plain\n   ${secondMatch}`;
	const renderedMarkdown = source.trim();

	assert.deepEqual(findHighlightLines(source), [match, secondMatch]);
	assert.equal(
		transformAssistantMarkdown(renderedMarkdown, {
			messageType: "assistant",
			isStreaming: false,
		}),
		"",
	);
});

test("ignores fenced code, blockquotes, list items, and indented lines", () => {
	const markdown = [
		"```text",
		match,
		"```",
		"",
		"~~~",
		match,
		"~~~",
		"",
		`> ${match}`,
		"",
		`  > ${match}`,
		"",
		`- ${match}`,
		"",
		`* ${match}`,
		"",
		`+ ${match}`,
		"",
		`1. ${match}`,
		"",
		`2) ${match}`,
		"",
		`    ${match}`,
		"",
		match,
	].join("\n");
	assert.deepEqual(findHighlightLines(markdown), [match]);
});

test("ignores lazy continuation lines in blockquotes and lists", () => {
	const markdown = [
		"> quoted paragraph",
		match,
		"",
		match,
		"- list paragraph",
		"Step 2/3: Lazy list continuation",
		"",
		"Step 3/3: Outside the list",
	].join("\n");
	assert.deepEqual(findHighlightLines(markdown), [match, "Step 3/3: Outside the list"]);
});

test("uses configured phrases as progress labels", () => {
	const phrases = normalizePhrases({ phrases: ["Phase", "Checkpoint"] });
	assert.deepEqual(phrases, ["Phase", "Checkpoint"]);
	assert.deepEqual(
		findHighlightLines("Phase 2/4: Implement\nCheckpoint 4/4: Done\nStep 1/1: Default", phrases),
		["Phase 2/4: Implement", "Checkpoint 4/4: Done"],
	);
});

test("falls back to the default phrase when config is missing or invalid", () => {
	assert.deepEqual(normalizePhrases(undefined), ["Step"]);
	assert.deepEqual(normalizePhrases({ phrases: "Step" }), ["Step"]);
	assert.deepEqual(normalizePhrases({ phrases: [] }), []);
	assert.deepEqual(normalizePhrases({ phrases: ["", 42] }), ["Step"]);
	assert.deepEqual(normalizePhrases({ phrases: ["", 42, " Phase "] }), ["Phase"]);
});

test("hides matched assistant blocks after streaming but preserves other message types", () => {
	const markdown = `Before\n${match}\nAfter`;
	assert.equal(
		transformAssistantMarkdown(markdown, { messageType: "assistant", isStreaming: false }),
		"",
	);
	assert.equal(
		transformAssistantMarkdown(markdown, { messageType: "assistant", isStreaming: true }),
		"Before\n\nAfter",
	);
	for (const messageType of ["user", "assistant-thinking"]) {
		assert.equal(
			transformAssistantMarkdown(markdown, { messageType, isStreaming: false }),
			markdown,
		);
	}
	assert.equal(
		transformAssistantMarkdown("ordinary assistant text", {
			messageType: "assistant",
			isStreaming: false,
		}),
		"ordinary assistant text",
	);
});

test("suppresses a possible partial progress line only while streaming", () => {
	const partial = "Step 2/3:";
	assert.equal(
		transformAssistantMarkdown(partial, { messageType: "assistant", isStreaming: true }),
		"",
	);
	assert.equal(
		transformAssistantMarkdown(partial, { messageType: "assistant", isStreaming: false }),
		partial,
	);
});

test("splits matching assistant Markdown into ordered display entries", () => {
	const secondMatch = "Step 3/3: Verify output";
	const middleChunk = [
		"Middle paragraph.",
		"",
		"> Step 2/3: Quoted line stays plain.",
		"- Step 2/3: List item stays plain.",
		"",
		"```text",
		"Step 2/3: Code line stays plain.",
		"```",
	].join("\n");
	const markdown = [
		"Before **the first step**.",
		"",
		match,
		"",
		middleChunk,
		"",
		secondMatch,
		"",
		"After the steps.",
	].join("\n");
	const entries = createDisplayEntryDrafts({
		role: "assistant",
		content: [{ type: "text", text: markdown }],
	});

	assert.deepEqual(
		entries,
		[
			{ type: "custom", customType: "step-highlight-text", data: { text: "Before **the first step**." } },
			{ type: "custom", customType: "step-highlight", data: { text: match } },
			{ type: "custom", customType: "step-highlight-text", data: { text: middleChunk } },
			{ type: "custom", customType: "step-highlight", data: { text: secondMatch } },
			{ type: "custom", customType: "step-highlight-text", data: { text: "After the steps." } },
		],
	);
});

test("creates one highlight entry per match without changing the message", () => {
	const message = Object.freeze({
		role: "assistant",
		content: Object.freeze([
			Object.freeze({ type: "text", text: `${match}\nStep 2/3: Write tests` }),
			Object.freeze({ type: "thinking", thinking: "Step 3/3: Hidden thought" }),
			Object.freeze({ type: "text", text: "Step 3/3: Verify" }),
		]),
	});
	const originalContent = message.content;
	const entries = createDisplayEntryDrafts(message);
	assert.deepEqual(
		entries,
		[
			{ type: "custom", customType: "step-highlight", data: { text: match } },
			{ type: "custom", customType: "step-highlight", data: { text: "Step 2/3: Write tests" } },
			{ type: "custom", customType: "step-highlight", data: { text: "Step 3/3: Verify" } },
		],
	);
	assert.equal(message.content, originalContent);
	assert.deepEqual(message.content[0].text, `${match}\nStep 2/3: Write tests`);
});

test("does not create entries for nonmatches, non-assistant messages, or thinking", () => {
	assert.deepEqual(createDisplayEntryDrafts({ role: "user", content: match }), []);
	assert.deepEqual(
		createDisplayEntryDrafts({
			role: "assistant",
			content: [{ type: "text", text: "ordinary assistant text" }],
		}),
		[],
	);
	assert.deepEqual(
		createDisplayEntryDrafts({
			role: "assistant",
			content: [{ type: "thinking", thinking: match }],
		}),
		[],
	);
});
