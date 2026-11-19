import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import plugin from "../src/cp-plugin.mjs";

// clip.exe falso: grava o stdin (bytes) num arquivo e sai com 0.
function fakeClip(mode = "ok") {
  const dir = mkdtempSync(join(tmpdir(), "cp-"));
  const out = join(dir, "clip.bin");
  const script = join(dir, "clip.sh");
  const body = mode === "fail"
    ? "cat > /dev/null; echo 'falha simulada' >&2; exit 3\n"
    : `cat > "${out}"\n`;
  writeFileSync(script, `#!/bin/sh\n${body}`);
  chmodSync(script, 0o755);
  return { script, out };
}

async function run({ messages, command = "cp", args = "", clip = fakeClip(), clientError }) {
  process.env.CP_CLIP = clip.script;
  const hooks = await plugin.server({
    client: {
      session: {
        messages: async () => {
          if (clientError) throw new Error(clientError);
          return { data: messages };
        },
      },
    },
  });
  const output = { parts: [] };
  await hooks["command.execute.before"]({ command, sessionID: "ses_test", arguments: args }, output);
  return { text: output.parts[0]?.text ?? "", clip };
}

const asst = (...texts) => ({ info: { role: "assistant" }, parts: texts.map((t) => ({ type: "text", text: t })) });
const user = (t) => ({ info: { role: "user" }, parts: [{ type: "text", text: t }] });

test("/cp copia o último bloco prompt e confirma sem o conteúdo inteiro", async () => {
  const r = await run({ messages: [asst("```prompt\nPRIMEIRO\n```"), asst("```prompt\nÚLTIMO: Ação 日本語\n```")] });
  assert.match(r.text, /copiado \(bloco único/);
  assert.ok(!r.text.includes("ÚLTIMO: Ação 日本語"), "a confirmação não deve trazer o conteúdo todo");
  const bytes = readFileSync(r.clip.out);
  assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(bytes.subarray(2).toString("utf16le"), "ÚLTIMO: Ação 日本語");
});

test("/cp 2 pega o segundo bloco contando do fim", async () => {
  const r = await run({
    messages: [asst("```prompt\nA\n```\n```prompt\nB\n```\n```prompt\nC\n```")],
    args: "2",
  });
  assert.equal(readFileSync(r.clip.out).subarray(2).toString("utf16le"), "B");
});

test("/cp all junta os blocos da resposta", async () => {
  const r = await run({ messages: [asst("```prompt\nA\n```\n```prompt\nB\n```")], args: "all" });
  assert.equal(readFileSync(r.clip.out).subarray(2).toString("utf16le"), "A\n\nB");
});

test("/cp m copia a resposta inteira", async () => {
  const r = await run({ messages: [asst("texto livre")], args: "m" });
  assert.equal(readFileSync(r.clip.out).subarray(2).toString("utf16le"), "texto livre");
});

test("/cp msg (apelido) copia a resposta inteira", async () => {
  const r = await run({ messages: [asst("texto livre")], args: "msg" });
  assert.equal(readFileSync(r.clip.out).subarray(2).toString("utf16le"), "texto livre");
});

test("sem bloco: avisa e não copia; ignora mensagens do usuário", async () => {
  const clip = fakeClip();
  const r = await run({ messages: [user("```prompt\nNÃO\n```"), asst("sem bloco")], clip });
  assert.match(r.text, /nenhum bloco/);
  assert.throws(() => readFileSync(clip.out));
});

test("bloco sem fechamento não é copiado", async () => {
  const clip = fakeClip();
  const r = await run({ messages: [asst("```prompt\nincompleto")], clip });
  assert.match(r.text, /sem fechamento/);
  assert.throws(() => readFileSync(clip.out));
});

test("segredo bloqueia; force libera; o rótulo aparece, não o valor", async () => {
  const token = "gho_abcdefghijklmnopqrstuvwxyz0123";
  const blocked = await run({ messages: [asst("```prompt\n" + token + "\n```")] });
  assert.match(blocked.text, /bloqueado, parece conter token GitHub/);
  assert.ok(!blocked.text.includes(token));
  const forced = await run({ messages: [asst("```prompt\n" + token + "\n```")], args: "force" });
  assert.match(forced.text, /copiado/);
});

test("argumento inválido e erro de leitura viram aviso", async () => {
  assert.match((await run({ messages: [], args: "xyz" })).text, /argumento desconhecido/);
  assert.match((await run({ clientError: "sessão indisponível" })).text, /não consegui ler a sessão/);
});

test("falha do clip.exe é relatada com o código de saída", async () => {
  const r = await run({ messages: [asst("```prompt\nX\n```")], clip: fakeClip("fail") });
  assert.match(r.text, /falha ao copiar: clip.exe saiu com código 3/);
});

test("ignora outros comandos", async () => {
  const r = await run({ messages: [asst("```prompt\nX\n```")], command: "outro" });
  assert.equal(r.text, "");
});
