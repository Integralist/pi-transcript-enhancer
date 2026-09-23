import { readFileSync } from "node:fs";
import { Box, Markdown, Text } from "@earendil-works/pi-tui";
import { getMarkdownTheme, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import {
	createDisplayEntryDrafts,
	normalizePhrases,
	transformAssistantMarkdown,
} from "./matcher.mjs";

const CONFIG_URL = new URL("../../step-highlight.json", import.meta.url);
const GOLD_TRUECOLOR_BG = "\x1b[48;2;184;134;11m";
const GOLD_256_BG = "\x1b[48;5;136m";
const BLACK_TRUECOLOR_FG = "\x1b[38;2;0;0;0m";
const BLACK_256_FG = "\x1b[38;5;16m";

type DisplayEntryData = { text: string };

function loadPhrases(): string[] {
	try {
		return normalizePhrases(JSON.parse(readFileSync(CONFIG_URL, "utf8")));
	} catch {
		return normalizePhrases(undefined);
	}
}

function renderStepHighlight(text: string, theme: Theme) {
	const trueColor = theme.getColorMode() === "truecolor";
	const background = trueColor ? GOLD_TRUECOLOR_BG : GOLD_256_BG;
	const foreground = trueColor ? BLACK_TRUECOLOR_FG : BLACK_256_FG;
	const box = new Box(1, 1, (content) => `${background}${content}\x1b[49m`);
	box.addChild(new Text(`${foreground}${text}\x1b[39m`, 0, 0));
	return box;
}

export default function (pi: ExtensionAPI): void {
	const phrases = loadPhrases();

	pi.registerMarkdownTransformer((markdown, context) =>
		transformAssistantMarkdown(markdown, context, phrases),
	);

	pi.registerEntryRenderer<DisplayEntryData>("step-highlight", (entry, _options, theme) => {
		if (typeof entry.data?.text !== "string") return undefined;
		return renderStepHighlight(entry.data.text, theme);
	});

	pi.registerEntryRenderer<DisplayEntryData>("step-highlight-text", (entry) => {
		if (typeof entry.data?.text !== "string") return undefined;
		return new Markdown(entry.data.text, 1, 0, getMarkdownTheme(), undefined, {
			preserveOrderedListMarkers: true,
			preserveBackslashEscapes: true,
		});
	});

	pi.on("turn_end", (event, ctx) => {
		if (ctx.mode !== "tui") return;

		const entries = createDisplayEntryDrafts(event.message, phrases);
		return entries.length > 0 ? { entries } : undefined;
	});
}
