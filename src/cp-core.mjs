// Núcleo puro do /cp: sem dependência do OpenCode nem do Windows.
// Interpreta argumentos, extrai blocos de código marcados e filtra segredos.

export const DEFAULT_TAG = "prompt";
export const MAX_BYTES = 200 * 1024;

const SECRET_PATTERNS = [
  { label: "token GitHub", re: /\b(gho|ghp|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/ },
  { label: "chave OpenAI/Anthropic", re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { label: "chave AWS", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "chave privada", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "cabeçalho Bearer", re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/ },
];

/**
 * Interpreta a string de argumentos do comando.
 * Retorna { ok: true, mode, n, tag, force } ou { ok: false, error }.
 * mode: "last" | "nth" | "all" | "msg"
 */
export function parseArgs(raw) {
  const out = { ok: true, mode: "last", n: 1, tag: DEFAULT_TAG, force: false };
  const tokens = String(raw ?? "").trim().split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      const n = Number(tok);
      if (n < 1) return { ok: false, error: "o número deve ser 1 ou maior (1 é o último bloco)" };
      out.mode = "nth";
      out.n = n;
    } else if (tok === "all") {
      out.mode = "all";
    } else if (tok === "msg") {
      out.mode = "msg";
    } else if (tok === "force") {
      out.force = true;
    } else if (tok.startsWith("tag=")) {
      const tag = tok.slice(4);
      if (!/^[A-Za-z0-9_-]+$/.test(tag)) return { ok: false, error: `marca inválida: ${tag}` };
      out.tag = tag;
    } else {
      return { ok: false, error: `argumento desconhecido: ${tok}` };
    }
  }
  return out;
}

/**
 * Extrai blocos de código cercados (``` ou ~~~) cuja primeira palavra do info string
 * é `tag`. Segue a regra do CommonMark: a cerca de fechamento usa o mesmo caractere
 * e tem pelo menos o mesmo comprimento da abertura, e cercas internas mais curtas
 * não fecham o bloco.
 * Retorna [{ text, unclosed }] na ordem em que aparecem.
 */
export function extractBlocks(markdown, tag = DEFAULT_TAG) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const openRe = /^ {0,3}(`{3,}|~{3,})(.*)$/;
  let i = 0;
  while (i < lines.length) {
    const m = openRe.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const fence = m[1];
    const info = m[2].trim();
    const firstWord = info.split(/\s+/)[0] ?? "";
    // Backticks não podem aparecer no info string de uma cerca com crase (regra CommonMark).
    const validInfo = !(fence[0] === "`" && info.includes("`"));
    const body = [];
    let j = i + 1;
    let closed = false;
    const closeRe = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
    while (j < lines.length) {
      if (closeRe.test(lines[j])) {
        closed = true;
        break;
      }
      body.push(lines[j]);
      j++;
    }
    if (validInfo && firstWord === tag) {
      blocks.push({ text: body.join("\n"), unclosed: !closed });
    }
    i = closed ? j + 1 : lines.length;
  }
  return blocks;
}

/** Escolhe o bloco pelo modo. Retorna { block, index } ou null. */
export function selectBlock(blocks, mode, n = 1) {
  if (!blocks.length) return null;
  if (mode === "nth") {
    const idx = blocks.length - n;
    return idx >= 0 ? { block: blocks[idx], index: idx } : null;
  }
  return { block: blocks[blocks.length - 1], index: blocks.length - 1 };
}

/**
 * Procura, da resposta mais recente para a mais antiga, a primeira que contenha
 * blocos com a marca. `messages` é a lista do SDK: [{ info: { role }, parts: [...] }].
 * Retorna { blocks, messageIndexFromEnd } ou null.
 */
export function findInMessages(messages, tag = DEFAULT_TAG) {
  const assistant = (messages ?? []).filter((m) => m?.info?.role === "assistant");
  for (let k = assistant.length - 1, back = 0; k >= 0; k--, back++) {
    const text = assistantText(assistant[k]);
    const blocks = extractBlocks(text, tag);
    if (blocks.length) return { blocks, messagesBack: back };
  }
  return null;
}

/** Texto visível de uma mensagem do assistente (ignora partes sintéticas e ignoradas). */
export function assistantText(message) {
  return (message?.parts ?? [])
    .filter((p) => p?.type === "text" && !p.synthetic && !p.ignored && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

/** Última resposta do assistente inteira (modo msg). */
export function lastAssistantText(messages) {
  const assistant = (messages ?? []).filter((m) => m?.info?.role === "assistant");
  for (let k = assistant.length - 1; k >= 0; k--) {
    const t = assistantText(assistant[k]);
    if (t.trim()) return { text: t, messagesBack: assistant.length - 1 - k };
  }
  return null;
}

/** Lista de padrões de segredo encontrados (só rótulos, nunca o valor). */
export function scanSecrets(text) {
  return SECRET_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

/** Converte para UTF-16LE com BOM, formato que o clip.exe e o Get-Clipboard leem sem perda. */
export function toClipboardBuffer(text) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
}

/** Resumo para a confirmação: só contagens, nunca trechos do conteúdo. */
export function summarize(text) {
  return {
    lines: text.split("\n").length,
    chars: [...text].length,
    bytes: Buffer.byteLength(text, "utf8"),
  };
}
