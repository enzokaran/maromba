// supabase/functions/notify-login/index.ts
//
// Edge Function segura: envia um e-mail de aviso sempre que houver um
// NOVO login real na Academia Maromba.
//
// Por que isso roda aqui e não no navegador?
//   - A service_role key e a chave da API de e-mail nunca podem ficar
//     expostas no código do site (frontend). Aqui elas ficam só em
//     variáveis de ambiente do servidor (Supabase secrets).
//
// Proteção contra duplicidade (2ª camada, além da do frontend):
//   - Guardamos em auth.users.app_metadata.last_login_notified_at o
//     horário do último e-mail enviado para aquele usuário.
//   - Se o último aviso foi há menos de 60 segundos, NÃO reenvia.
//     Isso cobre casos de múltiplas abas, cliques duplos, etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const NOTIFY_TO = Deno.env.get("NOTIFY_EMAIL_TO") || "enzokaran2@gmail.com";
const NOTIFY_FROM = Deno.env.get("NOTIFY_EMAIL_FROM") || "Academia Maromba <onboarding@resend.dev>";

// Janela mínima entre dois e-mails para o mesmo usuário.
const DEDUPE_WINDOW_MS = 60_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formatDataHoraBrasil(date: Date) {
  const dataFmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  const horaFmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return { data: dataFmt, hora: horaFmt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // 1) Identifica o usuário a partir do token de autenticação enviado
    //    automaticamente pelo supabase.functions.invoke(...) no frontend.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const method = body?.method === "google" ? "Google" : "Google";

    // 2) Cliente admin (service_role) só para checar/gravar o carimbo de
    //    dedupe e ler dados básicos do usuário. Nunca é exposto ao cliente.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const now = new Date();
    const lastNotifiedRaw = user.app_metadata?.last_login_notified_at as string | undefined;
    if (lastNotifiedRaw) {
      const last = new Date(lastNotifiedRaw).getTime();
      if (!Number.isNaN(last) && now.getTime() - last < DEDUPE_WINDOW_MS) {
        // Já notificamos um login muito recente para este usuário: ignora.
        return new Response(JSON.stringify({ skipped: true, reason: "duplicate_window" }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // 3) Atualiza o carimbo ANTES de enviar, para reduzir corrida entre
    //    chamadas quase simultâneas (várias abas, por exemplo).
    await adminClient.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        last_login_notified_at: now.toISOString(),
      },
    });

    // 4) Monta e envia o e-mail (usando a API da Resend como exemplo).
    const { data: fmt } = { data: formatDataHoraBrasil(now) };
    const identificador = user.email || user.id;

    const assunto = "Novo login efetuado na Maromba";
    const corpo =
      `Novo login efetuado na Academia Maromba.\n\n` +
      `Data: ${fmt.data}\n` +
      `Hora: ${fmt.hora}\n` +
      `Método de acesso: ${method}\n` +
      `Identificador do usuário: ${identificador}\n`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [NOTIFY_TO],
        subject: assunto,
        text: corpo,
      }),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error("Erro ao enviar e-mail:", errText);
      return new Response(JSON.stringify({ error: "Falha ao enviar e-mail." }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro inesperado em notify-login:", err);
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
