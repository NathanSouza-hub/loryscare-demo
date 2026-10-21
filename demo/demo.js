// Modo demo do Lory's Care: o back-end original (Express + PostgreSQL) roda aqui no navegador.
// - servidor.js: o app.js real empacotado, com um Express mínimo e o pg apontando para o PGlite
// - migracoes.js: as migrations reais do projeto
// - semear.js: dados de exemplo fictícios, criados pela própria API
// O banco fica no IndexedDB, então os dados sobrevivem à troca de página.
(function () {
  const PGLITE_URL = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js";
  const BANCO = "idb://loryscare-demo";
  const EMAIL = "demo@loryscare.dev";
  const SENHA = "demo1234";
  const CODIGO = "https://github.com/NathanSouza-hub/Loryscare";

  const { app, definirBanco } = window.LorysServidor;

  // Quem chega pelo portfólio entra direto: a conta demo (id 1) e a cuidadora Ana (id 1)
  // são as primeiras criadas pelo semear.js. O token segue o formato do shim de jsonwebtoken.
  // Na tela de login (depois de "Sair") a sessão não é recriada.
  function abrirSessaoDemo() {
    const pagina = location.pathname.split("/").pop();
    if (pagina === "login.html" || pagina === "cadastro.html") return;
    try {
      const atual = localStorage.getItem("loreroutine:token");
      if (atual) {
        const { exp } = JSON.parse(atob(atual.slice(5)));
        if (!exp || exp * 1000 > Date.now()) return;
      }
      const agora = Math.floor(Date.now() / 1000);
      localStorage.setItem("loreroutine:token", "demo." + btoa(JSON.stringify({ userId: "1", iat: agora, exp: agora + 30 * 86400 })));
      localStorage.setItem("loreroutine:userName", "Família Duarte");
      localStorage.setItem("loreroutine:profileId", "1");
      localStorage.setItem("loreroutine:profileName", "Ana Souza");
      localStorage.setItem("loreroutine:profileColor", "#2563eb");
    } catch (e) {}
  }
  abrirSessaoDemo();

  async function iniciar() {
    const { PGlite } = await import(PGLITE_URL);
    // int8 como texto, igual ao node-postgres
    const db = await PGlite.create(BANCO, { parsers: { 20: (v) => v } });
    definirBanco(db);

    const existe = await db.query("SELECT to_regclass('public.users') AS tabela");
    if (!existe.rows[0].tabela) {
      mostrarAviso("Preparando o banco de dados da demo…");
      for (const sql of window.LORYS_MIGRACOES) await db.exec(sql);
      await window.semearLorys(chamarApi);
    }
    esconderAviso();

    // Na primeira visita a página carrega antes de haver paciente escolhida:
    // escolhe a paciente da conta demo e recarrega uma vez para o painel vir preenchido
    try {
      if (localStorage.getItem("loreroutine:token") && !localStorage.getItem("loreroutine:patientId")) {
        const paciente = await db.query("SELECT id::text AS id FROM patients WHERE user_id = 1 ORDER BY id LIMIT 1");
        if (paciente.rows[0]) {
          localStorage.setItem("loreroutine:patientId", paciente.rows[0].id);
          location.reload();
        }
      }
    } catch (e) {}
  }

  function chamarApi(method, url, body, headers = {}) {
    return app.atender({ method, url, body, headers: { "Content-Type": "application/json", ...headers } });
  }

  const pronto = iniciar().catch((erro) => {
    console.error("Falha ao iniciar a demo:", erro);
    mostrarAviso("Não foi possível iniciar a demo neste navegador.");
    throw erro;
  });

  // Requisições para /api/... vão para o servidor da demo
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async function (entrada, opcoes = {}) {
    const endereco = new URL(typeof entrada === "string" ? entrada : entrada.url, location.href);
    const posicao = endereco.pathname.indexOf("/api/");
    if (posicao === -1) return fetchOriginal(entrada, opcoes);

    await pronto;
    const cabecalhos = {};
    new Headers(opcoes.headers || (typeof entrada === "string" ? undefined : entrada.headers)).forEach((valor, nome) => {
      cabecalhos[nome] = valor;
    });
    let corpo;
    if (typeof opcoes.body === "string") {
      try { corpo = JSON.parse(opcoes.body); } catch (e) { corpo = opcoes.body; }
    }
    const url = endereco.pathname.slice(posicao) + endereco.search;
    const r = await app.atender({ method: opcoes.method || "GET", url, headers: cabecalhos, body: corpo });
    const semCorpo = r.body === null || r.body === undefined || r.status === 204;
    return new Response(semCorpo ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  };

  // Atualização em tempo real não se aplica: o "servidor" está nesta aba
  const EventSourceOriginal = window.EventSource;
  window.EventSource = function (url, config) {
    if (String(url).includes("/api/stream")) {
      return { close() {}, addEventListener() {}, removeEventListener() {}, onmessage: null, onerror: null, readyState: 1 };
    }
    return new EventSourceOriginal(url, config);
  };

  async function restaurar() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("loreroutine:")).forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    await new Promise((resolve) => {
      const pedido = indexedDB.deleteDatabase("/pglite/loryscare-demo");
      pedido.onsuccess = pedido.onerror = pedido.onblocked = resolve;
    });
    location.href = "index.html";
  }

  // Faixa de aviso da demo e indicador de carregamento
  let aviso;
  function mostrarAviso(texto) {
    if (!document.body) return document.addEventListener("DOMContentLoaded", () => mostrarAviso(texto), { once: true });
    if (!aviso) {
      aviso = document.createElement("div");
      aviso.className = "demo-carregando";
      aviso.setAttribute("role", "status");
      document.body.append(aviso);
    }
    aviso.textContent = texto;
  }
  function esconderAviso() {
    if (aviso) aviso.remove();
    aviso = null;
  }

  function montarFaixa() {
    const estilo = document.createElement("style");
    estilo.textContent = `
      .demo-faixa { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 9999;
        display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 14px;
        width: max-content; max-width: calc(100vw - 24px); padding: 9px 16px; border-radius: 10px;
        background: #12151c; color: #e6e8ee; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        box-shadow: 0 10px 30px -10px rgba(0,0,0,.5); }
      .demo-faixa strong { color: #7cb7ff; }
      .demo-faixa code { font-family: ui-monospace, Consolas, monospace; color: #9fd9a8; }
      .demo-faixa button, .demo-faixa a { background: none; border: 0; padding: 0; color: #7cb7ff; font: inherit;
        cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .demo-carregando { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 10000;
        padding: 8px 14px; border-radius: 8px; background: #1d4ed8; color: #fff;
        font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
      @media print { .demo-faixa, .demo-carregando { display: none; } }
    `;
    document.head.append(estilo);

    const faixa = document.createElement("div");
    faixa.className = "demo-faixa";
    faixa.setAttribute("role", "note");
    faixa.innerHTML = `
      <span><strong>Demo</strong> · paciente e dados fictícios, salvos só no seu navegador</span>
      <span>Trocar de cuidador: PIN <code>1234</code></span>
      <button type="button">Restaurar dados</button>
      <a href="${CODIGO}" target="_blank" rel="noopener">Código ↗</a>
    `;
    faixa.querySelector("button").addEventListener("click", restaurar);
    document.body.append(faixa);
    document.body.style.paddingBottom = "72px";

    // Na tela de login, já deixa as credenciais da demo preenchidas
    if (location.pathname.endsWith("login.html")) {
      const email = document.querySelector('input[type="email"]');
      const senha = document.querySelector('input[type="password"]');
      if (email && senha) {
        email.value = EMAIL;
        senha.value = SENHA;
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montarFaixa);
  else montarFaixa();
})();
