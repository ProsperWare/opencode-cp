import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs, extractBlocks, selectBlock, findInMessages, lastAssistantText,
  scanSecrets, toClipboardBuffer, summarize, MAX_BYTES,
} from "../src/cp-core.mjs";

test("parseArgs: vazio usa o último bloco", () => {
  assert.deepEqual(parseArgs(""), { ok: true, mode: "last", n: 1, tag: "prompt", force: false });
});

test("parseArgs: m e o apelido msg viram o mesmo modo", () => {
  assert.equal(parseArgs("m").mode, "msg");
  assert.equal(parseArgs("msg").mode, "msg");
  assert.equal(parseArgs("m").ok, true);
});

test("parseArgs: número, all, m, tag e force", () => {
  assert.equal(parseArgs("2").mode, "nth");
  assert.equal(parseArgs("2").n, 2);
  assert.equal(parseArgs("all").mode, "all");
  assert.equal(parseArgs("tag=pronuncia").tag, "pronuncia");
  assert.equal(parseArgs("force").force, true);
  assert.equal(parseArgs("2 force tag=x").n, 2);
});

test("parseArgs: rejeita 0, marca inválida e argumento desconhecido", () => {
  assert.equal(parseArgs("0").ok, false);
  assert.equal(parseArgs("tag=a/b").ok, false);
  assert.equal(parseArgs("qualquer").ok, false);
});

test("extractBlocks: vários blocos da marca, na ordem", () => {
  const md = "x\n```prompt\nUM\n```\ny\n```python\nno\n```\n```prompt\nDOIS\n```";
  const b = extractBlocks(md, "prompt");
  assert.deepEqual(b.map((x) => x.text), ["UM", "DOIS"]);
});

test("extractBlocks: cerca de 4 crases com bloco de 3 dentro", () => {
  const md = "````prompt\nantes\n```bash\nls\n```\ndepois\n````";
  const b = extractBlocks(md, "prompt");
  assert.equal(b.length, 1);
  assert.equal(b[0].text, "antes\n```bash\nls\n```\ndepois");
  assert.equal(b[0].unclosed, false);
});

test("extractBlocks: til e crase não se fecham mutuamente", () => {
  const md = "~~~prompt\nA\n```\nB\n~~~";
  assert.deepEqual(extractBlocks(md, "prompt"), [{ text: "A\n```\nB", unclosed: false }]);
});

test("extractBlocks: bloco sem fechamento é marcado", () => {
  const b = extractBlocks("```prompt\nsem fim", "prompt");
  assert.equal(b.length, 1);
  assert.equal(b[0].unclosed, true);
});

test("extractBlocks: CRLF é normalizado", () => {
  const b = extractBlocks("```prompt\r\nlinha1\r\nlinha2\r\n```\r\n", "prompt");
  assert.equal(b[0].text, "linha1\nlinha2");
});

test("extractBlocks: acentos e japonês preservados", () => {
  const b = extractBlocks("```prompt\nAção é útil, 日本語\n```", "prompt");
  assert.equal(b[0].text, "Ação é útil, 日本語");
});

test("extractBlocks: info string com a marca seguida de texto conta", () => {
  assert.equal(extractBlocks("```prompt extra\nX\n```", "prompt").length, 1);
});

test("selectBlock: último, enésimo a partir do fim e fora do intervalo", () => {
  const blocks = [{ text: "A" }, { text: "B" }, { text: "C" }];
  assert.equal(selectBlock(blocks, "last").block.text, "C");
  assert.equal(selectBlock(blocks, "nth", 2).block.text, "B");
  assert.equal(selectBlock(blocks, "nth", 9), null);
  assert.equal(selectBlock([], "last"), null);
});

test("findInMessages: procura da resposta mais recente para a mais antiga", () => {
  const msgs = [
    { info: { role: "assistant" }, parts: [{ type: "text", text: "```prompt\nVELHO\n```" }] },
    { info: { role: "user" }, parts: [{ type: "text", text: "pergunta" }] },
    { info: { role: "assistant" }, parts: [{ type: "text", text: "sem bloco" }] },
  ];
  const r = findInMessages(msgs, "prompt");
  assert.equal(r.messagesBack, 1);
  assert.equal(r.blocks[0].text, "VELHO");
});

test("findInMessages: ignora partes sintéticas", () => {
  const msgs = [{ info: { role: "assistant" }, parts: [
    { type: "text", text: "```prompt\nFALSO\n```", synthetic: true },
  ] }];
  assert.equal(findInMessages(msgs, "prompt"), null);
});

test("lastAssistantText: texto inteiro da última resposta", () => {
  const msgs = [
    { info: { role: "assistant" }, parts: [{ type: "text", text: "um" }] },
    { info: { role: "assistant" }, parts: [{ type: "text", text: "dois" }] },
  ];
  assert.equal(lastAssistantText(msgs).text, "dois");
  assert.equal(lastAssistantText([]), null);
});

test("scanSecrets: detecta padrões e devolve só rótulos", () => {
  const t = "token gho_abcdefghijklmnopqrstuvwxyz e AKIAABCDEFGHIJKLMNOP";
  const labels = scanSecrets(t);
  assert.ok(labels.includes("token GitHub"));
  assert.ok(labels.includes("chave AWS"));
  assert.ok(!labels.join(" ").includes("abcdefgh"));
  assert.deepEqual(scanSecrets("texto comum"), []);
});

test("toClipboardBuffer: BOM UTF-16LE e volta sem perda", () => {
  const buf = toClipboardBuffer("Ação é útil, 日本語");
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xfe);
  assert.equal(buf.subarray(2).toString("utf16le"), "Ação é útil, 日本語");
});

test("summarize: só contagens, sem trechos do conteúdo", () => {
  const s = summarize("primeira linha\n" + "x".repeat(200));
  assert.equal(s.lines, 2);
  assert.equal(s.chars, 215);
  assert.deepEqual(Object.keys(s).sort(), ["bytes", "chars", "lines"]);
});

test("limite de tamanho documentado", () => {
  assert.equal(MAX_BYTES, 200 * 1024);
});
