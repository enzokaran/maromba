# Configuração — Login com Google + Notificação por E-mail

Este guia lista **exatamente** o que você precisa configurar fora do código.
Nenhuma credencial foi inventada — você precisa preencher tudo abaixo.

## 1. Criar um projeto no Supabase

1. Acesse https://supabase.com e crie um projeto (gratuito).
2. Em **Project Settings → API**, copie:
   - `Project URL` → cole em `SUPABASE_URL` (no `index.html`, dentro de `window.MAROMBA_CONFIG`).
   - `anon public key` → cole em `SUPABASE_ANON_KEY` (no `index.html`).
   
   Essas duas chaves são **públicas por natureza** e podem ficar no frontend.
   Nunca coloque a `service_role key` no `index.html`.

## 2. Configurar o login com Google (OAuth)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um
   projeto e vá em **APIs & Services → Credentials → Create Credentials →
   OAuth client ID** (tipo "Web application").
2. Em **Authorized redirect URIs**, adicione a URL de callback do Supabase
   (formato `https://SEU-PROJETO.supabase.co/auth/v1/callback`) — o próprio
   painel do Supabase mostra esse valor exato em:
   **Authentication → Providers → Google**.
3. Copie o **Client ID** e o **Client Secret** gerados pelo Google e cole
   nesses mesmos campos em **Authentication → Providers → Google** no
   Supabase. Ative o provider.
4. Em **Authentication → URL Configuration**, defina:
   - **Site URL**: a URL final do site (ex.: `https://academiamaromba.com.br`).
   - **Redirect URLs**: a mesma URL (e `http://localhost:...` se for testar localmente).

## 3. Configurar o envio de e-mail (Edge Function)

O e-mail é enviado pelo backend (`supabase/functions/notify-login`), nunca
pelo navegador. O exemplo usa a [Resend](https://resend.com) (tem plano
gratuito e é simples de configurar), mas você pode trocar por
SendGrid/Postmark/SMTP alterando só o bloco `fetch` do arquivo.

1. Crie uma conta em https://resend.com, verifique um domínio (ou use o
   domínio de teste deles para começar) e gere uma **API Key**.
2. Instale a CLI do Supabase (`npm i -g supabase`) e faça login:
   ```
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   ```
3. Configure os *secrets* da função (nunca commitar esses valores):
   ```
   supabase secrets set RESEND_API_KEY=coloque_sua_chave_aqui
   supabase secrets set NOTIFY_EMAIL_TO=enzokaran2@gmail.com
   supabase secrets set NOTIFY_EMAIL_FROM="Academia Maromba <onboarding@resend.dev>"
   ```
   > `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já
   > existem automaticamente dentro das Edge Functions — não precisa setá-los.
4. Publique a função:
   ```
   supabase functions deploy notify-login
   ```

## 4. Onde cada credencial pode/não pode ficar

| Credencial | Onde fica | Pode estar no frontend? |
|---|---|---|
| `SUPABASE_URL` | `index.html` | Sim |
| `SUPABASE_ANON_KEY` | `index.html` | Sim (é pública por design) |
| Google Client ID/Secret | Painel do Supabase (Auth → Providers) | Não |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret da Edge Function (automático) | **Nunca** |
| `RESEND_API_KEY` | Secret da Edge Function | **Nunca** |

## 5. Como testar (checklist)

- [ ] Clicar em "Continuar com Google" abre a tela oficial do Google.
- [ ] Após autorizar, volta para o site já logado (chip com nome/foto no header).
- [ ] Recarregar a página mantém o login e **não** dispara novo e-mail.
- [ ] Clicar em "Sair da conta" desconecta e volta a mostrar o botão de login.
- [ ] Um novo login real dispara o e-mail para `enzokaran2@gmail.com`.
- [ ] Testar no celular (o widget mobile fica dentro do menu ☰).

## Observação sobre o campo "identificador do usuário"

Por padrão a função usa o e-mail da conta Google autenticada. Se preferir
não expor o e-mail no corpo da notificação (por privacidade), troque
`user.email` por `user.id` em `supabase/functions/notify-login/index.ts`.
