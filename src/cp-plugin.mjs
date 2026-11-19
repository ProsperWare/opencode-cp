// Plugin /cp: copia para a área de transferência do Windows um bloco marcado
// da última resposta do assistente. Acionado só pelo comando /cp (sem automação).
import { spawn } from "node:child_process";
import {
  parseArgs, findInMessages, lastAssistantText, selectBlock,
  scanSecrets, toClipboardBuffer, summarize, MAX_BYTES,
} from "./cp-core.mjs";

function runClip(buffer) {
  const clip = process.env.CP_CLIP || "clip.exe";
  return new Promise((resolve, reject) => {
    const child = spawn(clip, [], { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("clip.exe não respondeu em 5 s"));
    }, 5000);
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`não foi possível executar ${clip}: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`clip.exe saiu com código ${code}${err ? `: ${err.trim()}` : ""}`));
    });
    child.stdin.end(buffer);
  });
}

function textPart(sessionID, text) {
  return { id: `cp-${Date.now()}`, sessionID, messageID: "cp", type: "text", text };
}

function reply(output, sessionID, text) {
  output.parts = [textPart(sessionID, text)];
}

export default {
  id: "opencode-cp",
  server: async (input) => ({
    "command.execute.before": async (hook, output) => {
      if (hook.command !== "cp") return;
      const { sessionID } = hook;
      const args = parseArgs(hook.arguments);
      if (!args.ok) return reply(output, sessionID, `/cp: ${args.error}`);

      let messages;
      try {
        const res = await input.client.session.messages({ path: { id: sessionID } });
        messages = res.data ?? res;
      } catch (e) {
        return reply(output, sessionID, `/cp: não consegui ler a sessão (${e.message})`);
      }

      let text;
      let origem;
      if (args.mode === "msg") {
        const r = lastAssistantText(messages);
        if (!r) return reply(output, sessionID, "/cp: nenhuma resposta do assistente nesta sessão.");
        text = r.text;
        origem = r.messagesBack === 0 ? "última resposta" : `${r.messagesBack + 1}ª resposta contando do fim`;
      } else {
        const found = findInMessages(messages, args.tag);
        if (!found) {
          return reply(output, sessionID,
            `/cp: nenhum bloco \`\`\`${args.tag} encontrado nas respostas desta sessão.`);
        }
        const blocks = found.blocks;
        if (args.mode === "all") {
          text = blocks.map((b) => b.text).join("\n\n");
          origem = `${blocks.length} bloco(s) da resposta`;
        } else {
          const sel = selectBlock(blocks, args.mode, args.n);
          if (!sel) {
            return reply(output, sessionID,
              `/cp: a resposta tem ${blocks.length} bloco(s); não existe o ${args.n}º a partir do fim.`);
          }
          if (sel.block.unclosed) {
            return reply(output, sessionID,
              "/cp: o bloco está sem fechamento (```). Nada foi copiado. Peça a resposta novamente.");
          }
          text = sel.block.text;
          origem = blocks.length > 1 ? `bloco ${blocks.length - sel.index} de ${blocks.length}` : "bloco único";
        }
        if (found.messagesBack > 0) origem += `, ${found.messagesBack + 1}ª resposta contando do fim`;
      }

      if (!text.trim()) return reply(output, sessionID, "/cp: o bloco está vazio. Nada foi copiado.");
      if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
        return reply(output, sessionID, `/cp: conteúdo acima de ${MAX_BYTES / 1024} KB. Nada foi copiado.`);
      }
      const secrets = scanSecrets(text);
      if (secrets.length && !args.force) {
        return reply(output, sessionID,
          `/cp: bloqueado, parece conter ${secrets.join(", ")}. Use \`/cp force\` se tiver certeza.`);
      }

      try {
        await runClip(toClipboardBuffer(text));
      } catch (e) {
        return reply(output, sessionID, `/cp: falha ao copiar: ${e.message}`);
      }
      const s = summarize(text);
      reply(output, sessionID,
        `/cp: copiado (${origem}): ${s.lines} linha(s), ${s.chars} caractere(s).`);
    },
  }),
};
