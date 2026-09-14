// repro-ask.ts — 复现 pi-mobile「Ask 面板只有选项没有问题」
// 用真实 AskDialog（工作站扩展）+ 恒等主题（rpc-manager PLAIN_TEXT_THEME 同款语义）
// 渲染宽屏/普通两版 lines，再跑 pi-mobile 的 plainCustomLines + parseAskPanel。
import { AskDialog } from "C:/Users/CyYu/.pi/agent/extensions/dancher/ask_user.ts";
import {
  parseAskPanel,
  plainCustomLines,
} from "C:/Users/CyYu/D-Programs/pi-mobile/src/util/ask-panel.ts";

// 恒等主题：fg/bg/bold 原样返回（PLAIN_TEXT_THEME 在 headless 下的行为）
const plainTheme = {
  fg: (_n: string, text: string) => text,
  bg: (_n: string, text: string) => text,
  bold: (t: string) => t,
} as any;
const stubTui = { requestRender: () => {} } as any;

function renderOnce(questions: any, width: number) {
  const dlg = new AskDialog({
    tui: stubTui,
    theme: plainTheme,
    questions,
    onFinish: () => {},
  } as any);
  return dlg.render(width);
}

// 场景 A：带 preview 的选项（触发 widePreview 并排分支，width=110）
const linesA = renderOnce(
  [
    {
      question: "要不要现在发版 v1.16？",
      header: "发布",
      options: [
        { label: "现在发（推荐）", description: "立即可用", preview: "npm run build" },
        { label: "先不发", description: "再等等" },
      ],
    },
  ],
  110,
);
// 场景 B：无 preview（普通分支）
const linesB = renderOnce(
  [
    {
      question: "要不要现在发版 v1.16？",
      header: "发布",
      options: [
        { label: "现在发（推荐）", description: "立即可用" },
        { label: "先不发", description: "再等等" },
      ],
    },
  ],
  110,
);

for (const [name, lines] of [
  ["A 带 preview(110 列)", linesA],
  ["B 无 preview(110 列)", linesB],
] as const) {
  console.log(`\n===== ${name} =====`);
  for (const l of lines) console.log(JSON.stringify(l));
  const st = parseAskPanel(plainCustomLines(lines));
  console.log("--- parseAskPanel →");
  console.log("question:", JSON.stringify(st?.question));
  console.log("options:", st?.options.map(o => `${o.n}.${o.label}${o.focused ? "(焦点)" : ""}`));
}

// 场景 C：多题（进度前缀 + tab 栏）；D：多选（勾选框 + 提交行）
const linesC = renderOnce(
  [
    { question: "先做哪个？", header: "优先级", options: [{ label: "修 bug" }, { label: "写文档" }] },
    { question: "什么时候发？", options: [{ label: "今天" }, { label: "明天" }] },
  ],
  110,
);
const dlgD = new AskDialog({ tui: stubTui, theme: plainTheme, questions: [
  { question: "要哪些功能？", multiSelect: true, options: [{ label: "A" }, { label: "B (Recommended)" }] },
], onFinish: () => {} } as any);
// 多选：数字键 1、2 勾选两项再渲染
for (const k of ['1', '2']) dlgD.handleInput?.(k);
const linesD = dlgD.render(110);
for (const [name, lines] of [["C 多题", linesC], ["D 多选已勾", linesD]] as const) {
  console.log(`\n===== ${name} =====`);
  for (const l of lines) console.log(JSON.stringify(l).slice(0, 100));
  const st = parseAskPanel(plainCustomLines(lines));
  console.log("--- parseAskPanel →");
  console.log("question:", JSON.stringify(st?.question), "| progress:", st?.progress, "| tabs:", JSON.stringify(st?.tabs)?.slice(0,60));
  console.log("options:", st?.options.map(o => `${o.n}.${o.label}${o.checked===true?'[✓]':''}${o.focused ? "(焦点)" : ""}`));
  console.log("submitRow:", st?.hasSubmitRow, "| multiSelect:", st?.multiSelect);
}
