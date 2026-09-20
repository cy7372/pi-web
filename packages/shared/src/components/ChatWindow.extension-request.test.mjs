import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./ChatWindow.tsx", import.meta.url),
  "utf8",
);
const dialogSource = source.slice(source.indexOf("function ExtensionDialog"));
const customSource = source.slice(
  source.indexOf("function ExtensionCustomPanel"),
);

test("confines extension overlays to the content region above the composer", () => {
  assert.doesNotMatch(source, /function ExtensionRequestSheet/);
  assert.match(
    source,
    /className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"[\s\S]*?<ExtensionDialog[\s\S]*?<ExtensionCustomPanel[\s\S]*?className="relative shrink-0"[\s\S]*?{chatInputElement}/,
  );
  assert.match(dialogSource, /position: "absolute"[\s\S]*?inset: 0/);
  assert.match(dialogSource, /pointerEvents: "none"/);
  assert.match(dialogSource, /pointerEvents: "auto"/);
  assert.match(customSource, /position: "absolute"[\s\S]*?inset: 0/);
  assert.match(customSource, /pointerEvents: "none"/);
  assert.doesNotMatch(source, /z-\[100\]|zIndex: 100/);
  assert.match(customSource, /maxHeight: "min\(760px, 100%\)"/);
});

test("adds collapse without replacing cancel", () => {
  assert.match(dialogSource, /setCollapsed\(true\)/);
  assert.match(dialogSource, /chat\.extensionCollapse/);
  assert.match(dialogSource, /chat\.cancel/);
  assert.doesNotMatch(dialogSource, /chat\.extensionSkip/);
});

test("renders extension confirmation and options as markdown", () => {
  // Local fork: the dialog renders structured dialogParts (heading/prose with
  // markdown) and select options through the rich renderer — see
  // splitDialogTitle/parseStructuredOption in ChatWindow.tsx. Upstream's plain
  // `<MarkdownBody>{request.message}</MarkdownBody>` assertion does not apply.
  assert.match(source, /import \{ MarkdownBody \} from "\.\/MarkdownBody"/);
  assert.match(dialogSource, /\{dialogParts\.heading\}/);
  assert.match(dialogSource, /\{dialogParts\.prose\}/);
});

test("preserves title newlines like pi's TUI and keeps long titles from hiding the body", () => {
  // Local fork: the dialog renders splitDialogTitle's structured parts
  // (heading/prose) instead of the raw title; newline semantics live on the
  // heading div (pre-wrap + overflowWrap) and the header is capped at 50%
  // with its own scroll so long titles cannot push the body out.
  const header = dialogSource.slice(dialogSource.indexOf('role="dialog"'), dialogSource.indexOf("{request.method === \"confirm\""));
  assert.match(header, /maxHeight: "50%",[\s\S]*?overflowY: "auto"/);
  const hIdx = header.indexOf("{dialogParts.heading}");
  assert.notEqual(hIdx, -1, "heading element not found");
  const headingStyle = header.slice(Math.max(0, hIdx - 600), hIdx);
  assert.match(headingStyle, /whiteSpace: "pre-wrap"/);
  assert.match(headingStyle, /overflowWrap: "anywhere"/);
});

test("resets collapse state when a new extension request arrives", () => {
  assert.match(source, /<ExtensionDialog key=\{extensionDialog.id\}/);
  // Local fork (multi-slot custom UIs): panels map over extensionCustomUis, keyed by panel.id.
  assert.match(source, /<ExtensionCustomPanel key=\{panel.id\} request=\{panel\}/);
  assert.match(
    customSource,
    /if \(!collapsed\) inputRef.current\?\.focus\(\);\s*}, \[collapsed\]\)/,
  );
});

test("interactive custom panels expand by default after SSE replay", () => {
  // Re-entry recovery re-mounts the panel from the replayed
  // extension_ui_request: panels flagged overlayOptions.awaiting
  // (ask_user_question) or carrying touch actions must mount expanded.
  // Only passive overlays (toasts, footer stats) stay collapsed pills —
  // 80cb661 collapsed ALL custom panels and made ask_user look unrecoverable.
  assert.match(
    customSource,
    /const \[collapsed, setCollapsed\] = useState\(\s*\(\) => !\(request\.awaiting \|\| request\.actions\?\.length\)\s*,?\s*\)/,
  );
});
