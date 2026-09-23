export const DEFAULT_PHRASES = ["Step"];

const LIST_ITEM = /^ {0,3}(?:[-+*]|\d+[.)])\s+/;
const BLOCKQUOTE = /^ {0,3}>/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export function normalizePhrases(config) {
	if (!Array.isArray(config?.phrases)) {
		return [...DEFAULT_PHRASES];
	}

	if (config.phrases.length === 0) return [];

	const phrases = [
		...new Set(
			config.phrases
				.filter((phrase) => typeof phrase === "string")
				.map((phrase) => phrase.trim())
				.filter(Boolean),
		),
	];
	return phrases.length > 0 ? phrases : [...DEFAULT_PHRASES];
}

function lineWithoutCR(line) {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function startsFence(line) {
	const match = FENCE.exec(line);
	if (!match || (match[1][0] === "`" && match[2].includes("`"))) {
		return undefined;
	}
	return { marker: match[1][0], length: match[1].length };
}

function closesFence(line, fence) {
	const match = FENCE.exec(line);
	return (
		match !== null &&
		match[1][0] === fence.marker &&
		match[1].length >= fence.length &&
		match[2].trim() === ""
	);
}

function progressSuffix(line, phrase) {
	const prefix = `${phrase} `;
	if (!line.startsWith(prefix)) return undefined;

	const suffix = line.slice(prefix.length);
	const match = /^(\d+)\/(\d+): (.*)$/.exec(suffix);
	if (!match || !match[3].trim()) return undefined;
	return match;
}

function isPotentialProgressPrefix(line, phrase) {
	if (line === phrase) return true;
	const prefix = `${phrase} `;
	if (!line.startsWith(prefix)) return false;

	// The line may still be a valid progress line while the model streams its
	// counter, separator, or summary. A colon must be followed by a space.
	return /^\d+(?:\/\d*(?::(?: .*)?)?)?$/.test(line.slice(prefix.length));
}

function interruptsLazyContinuation(line) {
	return (
		/^ {0,3}#{1,6}(?:[ \t]|$)/.test(line) ||
		/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)
	);
}

function hasLazyParagraphContent(line, marker) {
	const content =
		marker === "blockquote"
			? line.replace(/^ {0,3}>[ \t]?/, "")
			: line.replace(/^ {0,3}(?:[-+*]|\d+[.)])\s+/, "");
	return content.trim() !== "" && !interruptsLazyContinuation(content);
}

function classifyLines(markdown, phrases, isStreaming) {
	const hidden = new Set();
	let fence;
	let inLazyContainer = false;

	for (const [index, rawLine] of markdown.split("\n").entries()) {
		const line = lineWithoutCR(rawLine);
		if (fence) {
			if (closesFence(line, fence)) fence = undefined;
			continue;
		}

		if (line.trim() === "") {
			inLazyContainer = false;
			continue;
		}

		const openingFence = startsFence(line);
		if (openingFence) {
			inLazyContainer = false;
			fence = openingFence;
			continue;
		}

		if (BLOCKQUOTE.test(line)) {
			inLazyContainer = hasLazyParagraphContent(line, "blockquote");
			continue;
		}
		if (LIST_ITEM.test(line)) {
			inLazyContainer = hasLazyParagraphContent(line, "list");
			continue;
		}

		if (inLazyContainer && !interruptsLazyContinuation(line)) continue;
		inLazyContainer = false;

		if (/^(?: {4,}|\t)/.test(line)) continue;
		if (interruptsLazyContinuation(line)) continue;

		const candidateLine = line.replace(/^ {1,3}/, "");
		if (phrases.some((phrase) => progressSuffix(candidateLine, phrase) !== undefined)) {
			hidden.add(index);
			continue;
		}

		if (isStreaming && phrases.some((phrase) => isPotentialProgressPrefix(candidateLine, phrase))) {
			hidden.add(index);
		}
	}

	return hidden;
}

export function findHighlightLines(markdown, phrases = DEFAULT_PHRASES) {
	const lines = markdown.split("\n");
	const hidden = classifyLines(markdown, phrases, false);
	return lines
		.filter((_line, index) => hidden.has(index))
		.map((line) => lineWithoutCR(line).replace(/^ {1,3}/, ""));
}

export function transformAssistantMarkdown(markdown, context, phrases = DEFAULT_PHRASES) {
	if (context?.messageType !== "assistant") return markdown;

	const matches = classifyLines(markdown, phrases, false);
	if (context.isStreaming !== true) return matches.size > 0 ? "" : markdown;

	const hidden = classifyLines(markdown, phrases, true);
	const lines = markdown.split("\n");
	return lines.map((line, index) => (hidden.has(index) ? "" : line)).join("\n");
}

function splitDisplaySegments(markdown, phrases) {
	const matches = classifyLines(markdown, phrases, false);
	if (matches.size === 0) return [];

	const segments = [];
	let normalLines = [];
	const flushNormal = () => {
		const text = normalLines
			.map(lineWithoutCR)
			.join("\n")
			.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "");
		normalLines = [];
		if (text.trim()) segments.push({ highlighted: false, text });
	};

	for (const [index, rawLine] of markdown.split("\n").entries()) {
		if (!matches.has(index)) {
			normalLines.push(rawLine);
			continue;
		}

		flushNormal();
		segments.push({ highlighted: true, text: lineWithoutCR(rawLine).replace(/^ {1,3}/, "") });
	}
	flushNormal();
	return segments;
}

export function createDisplayEntryDrafts(message, phrases = DEFAULT_PHRASES) {
	if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];

	return message.content.flatMap((part) => {
		if (part?.type !== "text" || typeof part.text !== "string") return [];
		return splitDisplaySegments(part.text, phrases).map((segment) => ({
			type: "custom",
			customType: segment.highlighted ? "step-highlight" : "step-highlight-text",
			data: { text: segment.text },
		}));
	});
}
