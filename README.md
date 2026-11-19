# opencode-cp

Comando `/cp` para o [OpenCode](https://opencode.ai) no Windows (WSL2). Copia para a área de transferência
um bloco de código marcado da última resposta do assistente, sem precisar selecionar texto.

## Uso

Na resposta do modelo, marque o que você quer copiar com a palavra `prompt` na cerca:

````
```prompt
texto que você quer copiar
```
````

No OpenCode:

| Comando | Efeito |
|---|---|
| `/cp` | Copia o último bloco `prompt` da resposta mais recente que tenha um |
| `/cp 2` | Copia o 2º bloco contando do fim (`1` é o último) |
| `/cp all` | Copia todos os blocos `prompt` da resposta, separados por linha em branco |
| `/cp msg` | Copia a resposta inteira, sem procurar bloco |
| `/cp tag=nome` | Usa outra marca no lugar de `prompt` |
| `/cp force` | Copia mesmo que o filtro de segredos reclame |

A confirmação mostra só contagens (linhas e caracteres), nunca o conteúdo.

## Proteções

- **Segredos:** bloqueia padrões de tokens do GitHub, chaves de API (`sk-`), AWS, chaves privadas e cabeçalhos
  `Bearer`. Só o rótulo aparece na mensagem. `/cp force` libera.
- **Bloco sem fechamento:** não copia um texto cortado.
- **Tamanho:** recusa conteúdo acima de 200 KB.
- **Codificação:** envia UTF-16LE com BOM ao `clip.exe`, para não corromper acentos e japonês.

## Instalação

Requisitos: WSL2 com interop ligado (o `clip.exe` precisa estar no PATH), Node 22 ou Python 3 para o instalador.

```bash
git clone https://github.com/ProsperWare/opencode-cp.git
cd opencode-cp
./install.sh
```

Depois, reinicie o OpenCode. Para remover: `./install.sh --uninstall`.

O instalador copia os arquivos para `~/.config/opencode/opencode-cp/`, grava `commands/cp.md` e acrescenta
o plugin à lista `plugin` do `opencode.json`. Antes de alterar a configuração, cria um backup com carimbo de data.
Para testar numa cópia, use `CP_CONFIG_DIR=/caminho ./install.sh`.

## Testes

```bash
npm test
```

Os testes usam um `clip.exe` falso e um cliente simulado, então não precisam do OpenCode nem do Windows.
O teste de codificação real (`Get-Clipboard`) é manual.

## Limitações

- O comando dispara uma rodada curta do modelo (`commands/cp.md` fixa o Haiku). O custo é de poucos tokens.
- Só funciona com `clip.exe` (WSL). Não há suporte nativo para Linux ou macOS; a variável `CP_CLIP`
  permite apontar outro programa que leia a entrada.
- Depende da API de plugins do OpenCode 1.x (`command.execute.before`, `session.messages`), verificada na
  versão 1.16.2.

## Licença

MIT.
