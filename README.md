# Neural Oculon

Um olho animado em tela cheia que funciona como a cara de uma IA. Ela conversa, resolve geografia, matemática, probabilidade e estatística, e responde pesquisas quando a mensagem começa com `PESQUISE`. Não navega na internet: responde com o que o modelo já sabe e avisa quando o assunto depende de informação recente.

## Como funciona

```
site no GitHub Pages  →  função no Supabase (guarda a chave)  →  API da Anthropic
```

O site não tem chave nenhuma. Quem guarda a chave é a função do Supabase, que só atende quem enviar o código de acesso.

## O que você precisa

- Uma chave da API da Anthropic, criada em console.anthropic.com. A cobrança é por uso e separada da assinatura do Claude. Defina um limite de gasto mensal na conta.
- Uma conta no Supabase (o plano grátis serve) e a CLI dele (`npx supabase` já basta).

## Passo a passo

1. Entre na CLI e ligue ao seu projeto do Supabase:

   ```
   npx supabase login
   npx supabase init
   npx supabase link --project-ref SEU_PROJECT_REF
   ```

   O `SEU_PROJECT_REF` é o código que aparece no endereço do projeto no painel do Supabase.

2. Guarde os segredos (troque os valores):

   ```
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ACCESS_CODE=uma-frase-longa-so-sua ALLOWED_ORIGINS=https://SEU-USUARIO.github.io
   ```

   `ALLOWED_ORIGINS` é só o endereço do site, sem barra no final e sem o nome do repositório. Para testar no seu computador, acrescente `,http://localhost:8000`.

3. Publique a função. O `--no-verify-jwt` é necessário porque o controle de acesso é feito pelo `ACCESS_CODE`:

   ```
   npx supabase functions deploy oculon-chat --no-verify-jwt
   ```

4. Abra o `config.js` e cole o endereço da função:

   ```js
   window.OCULON_CONFIG = {
     apiUrl: "https://SEU_PROJECT_REF.supabase.co/functions/v1/oculon-chat"
   };
   ```

5. No GitHub, em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`. Depois do commit, o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

6. Abra o site, digite `/codigo uma-frase-longa-so-sua` na barra e envie. O código fica salvo só naquele navegador. Depois é só conversar.

## Testar no computador

```
python3 -m http.server 8000
```

Abra http://localhost:8000. Lembre de ter `http://localhost:8000` em `ALLOWED_ORIGINS`.

## Segurança e custo

- A chave da Anthropic nunca vai para o repositório nem para o navegador.
- Quem não tiver o `ACCESS_CODE` recebe erro 401 e não gasta nada. Se o código vazar, troque-o com `npx supabase secrets set ACCESS_CODE=novo-codigo`.
- A função limita o tamanho dos pedidos e fixa o modelo e o máximo de resposta no servidor. O limite de gasto da conta na Anthropic continua sendo a proteção principal.
- Por padrão a função usa `claude-haiku-4-5-20251001` para perguntas curtas, `claude-sonnet-5-5` para as normais e `claude-opus-5-5` para pesquisas e perguntas difíceis de matemática e estatística. Dá para trocar com os segredos `MODEL_QUICK`, `MODEL_DEFAULT` e `MODEL_COMPLEX`.

## Problemas comuns

- **"A IA ainda não está configurada"**: o `apiUrl` do `config.js` está vazio.
- **"Código de acesso ausente ou inválido"**: digite `/codigo SEU_CODIGO` e envie.
- **"Sem conexão com o servidor da IA"**: confira o `apiUrl`, a internet e se o endereço do site está em `ALLOWED_ORIGINS` (o navegador bloqueia chamadas de origens não listadas).
- **Resposta de erro 500**: faltou definir `ANTHROPIC_API_KEY` ou `ACCESS_CODE`.

## Arquivos

- `index.html`: o site inteiro (olho, menu de conversas, chat).
- `config.js`: o endereço da função.
- `supabase/functions/oculon-chat/index.ts`: a função que guarda a chave.

O histórico de conversas fica só no navegador de quem usa (localStorage).
