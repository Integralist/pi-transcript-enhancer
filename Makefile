.PHONY: test try
test:
	node --test test/step-highlight.test.mjs

try:
	pi --no-extensions --extension ./.pi/extensions/step-highlight/index.ts
