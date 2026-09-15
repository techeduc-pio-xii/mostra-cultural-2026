/*
 * Mostra Cultural 2026 — frontend
 * Produção: Google Sheets → Apps Script → JSON → GitHub Pages
 * Em produção, configure CONFIG.API_URL e CONFIG.DEMO_MODE=false.
 */
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbwQyKE_BU1KUPJG67o4iThsCQq8uxPcf-m1lbWc3MAnIL_Q2yUAv-k0NLzdTmHm6H9cgQ/exec",
  POLLING_MS: 45000,
  PAGE_SIZE: 12,
  DEMO_MODE: false,
  SAMPLE_URL: "data/sample.json"
};

const NAV = [
  ["identificacao", "Identificação"],
  ["projeto", "Sobre o Projeto"],
  ["te", "Apoio TE"],
  ["dispositivos", "Dispositivos e Periféricos"],
  ["fabricacao", "Fabricação Digital"],
  ["ti", "TI"],
  ["av", "Audiovisual"],
  ["manutencao", "Manutenção"],
  ["comunicacao", "Comunicação"],
  ["gestao", "Gestão"]
];

const SECTOR_LABELS = {
  te: "Apoio TE",
  dispositivos: "Dispositivos e Periféricos",
  fabricacao: "Fabricação Digital",
  ti: "TI",
  av: "Audiovisual",
  manutencao: "Manutenção",
  comunicacao: "Comunicação"
};

const MAINTENANCE_FILTERS = [
  ["", "Todos os tipos"],
  ["Marcenaria", "Marcenaria"],
  ["Jardinagem", "Jardinagem"],
  ["Serralheria", "Serralheria"],
  ["Pintura", "Pintura / acabamento"],
  ["Mobiliário", "Mobiliário / movimentação"],
  ["Elétrica", "Elétrica / tomadas / extensões"],
  ["Estruturas Expositivas", "Estruturas expositivas"],
  ["Outros", "Outras solicitações"]
];

const COMMUNICATION_FILTERS = [
  ["", "Todos os tipos"],
  ["Faixa", "Faixa"],
  ["Justificativa", "Justificativa do projeto"],
  ["Gráfica", "Gráfica externa"],
  ["Arte", "Esboço para arte"],
  ["Banner", "Banner em lona"],
  ["Personalizados", "Itens personalizados"],
  ["Outros", "Outras solicitações"]
];

const state = {
  projects: [],
  inventory: [],
  structureCatalog: [],
  current: "identificacao",
  audit: false,
  token: sessionStorage.getItem("mostra_admin_token") || "",
  role: sessionStorage.getItem("mostra_admin_role") || "",
  page: 1,
  lastDataHash: "",
  subfilter: "",
  lightbox: { images: [], index: 0 }
};

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textVal(v) {
  const s = String(v == null ? "" : v).trim();
  return s || "Não informado";
}

function numberVal(v) {
  const m = String(v == null ? "" : v).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function isEmptyDemand(v) {
  const s = String(v == null ? "" : v).trim();
  return !s || /^(sem|não|nao)\s*(demanda|apoio|solicita|necessidade)/i.test(s);
}

function getCurrentSectorFromUrl() {
  return new URLSearchParams(location.search).get("setor") || "";
}

function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("show"), 3000);
}

async function api(action, payload = {}, method = "GET") {
  if (!CONFIG.API_URL) return null;
  const url = method === "GET"
  ? `${CONFIG.API_URL}?${new URLSearchParams({
      action,
      ...payload,
      _ts: Date.now()
    })}`
  : CONFIG.API_URL;
  const options = {
  method,
  redirect: "follow",
  cache: "no-store"
};
  if (method !== "GET") {
    options.headers = { "Content-Type": "text/plain;charset=utf-8" };
    options.body = JSON.stringify({ action, ...payload, token: state.token || "" });
  }
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  if (!json.success) throw new Error(json.error || "Erro na API");
  return json.data;
}

function normalizeProject(raw) {
  const p = raw || {};
  return {
    id: p.id || "",
    timestamp: p.timestamp || "",
    segmento: p.segmento || "",
    curriculo: p.curriculo || "",
    serie: p.serie || "",
    disciplina: p.disciplina || "",
    prof: p.prof || "",
    titulo: p.titulo || "Sem título",
    desc: p.desc || "",
    justificativa: p.justificativa || "",
    produto: p.produto || "",
    space: p.space || p.espacos || "",
    sala: p.sala || "",
    spaceAvailableFrom: p.spaceAvailableFrom || "",
    spaceAvailableAt: p.spaceAvailableAt || "",
    te: p.te || {},
    dispositivos: p.dispositivos || {},
    fabricacao: p.fabricacao || {},
    ti: p.ti || {},
    av: p.av || {},
    manutencao: p.manutencao || {},
    comunicacao: p.comunicacao || {},
    structures: p.structures || {},
    sectors: Array.isArray(p.sectors) ? p.sectors : [],
    checklist: p.checklist || {},
    audit: p.audit || {},
    files: Array.isArray(p.files) ? p.files : []
  };
}

function projectHasSector(p, sector) {
  if (sector === "te") return !isEmptyDemand(p.te?.tipoApoio) || !isEmptyDemand(p.te?.necessita) || !isEmptyDemand(p.te?.recursos) || !isEmptyDemand(p.te?.observacoes);
  if (sector === "dispositivos") return Object.values(p.dispositivos || {}).some(v => numberVal(v) > 0) || !isEmptyDemand(p.dispositivos?.outros);
  if (sector === "fabricacao") return Object.values(p.fabricacao || {}).some(v => !isEmptyDemand(v));
  if (sector === "ti") return !isEmptyDemand(p.ti?.internet) || !isEmptyDemand(p.ti?.adaptadoresCabos) || !isEmptyDemand(p.ti?.outros) || !isEmptyDemand(p.ti?.internetLocal);
  if (sector === "av") return Object.values(p.av || {}).some(v => numberVal(v) > 0) || !isEmptyDemand(p.av?.outros);
  if (sector === "manutencao") return maintenanceItems(p).length > 0;
  if (sector === "comunicacao") return communicationItems(p).length > 0;
  return false;
}

function maintenanceItems(p) {

  const m = p.manutencao || {};
  const items = [];

  const add = (type, label, value) => {
    if (!isEmptyDemand(value)) {
      items.push({
        type,
        label,
        value: String(value)
      });
    }
  };

  add(
    "Mobiliário",
    "Movimentação de mobiliário",
    m.movimentacao
  );

  add(
    "Mobiliário",
    "Descrição da movimentação",
    m.descricaoMovimentacao
  );

  add(
    "Mobiliário",
    "Local para guardar mobiliário retirado",
    m.guardarMobiliario
  );

  add(
    "Mobiliário",
    "Mesas que devem permanecer",
    m.mesasPermanecem
  );

  add(
    "Mobiliário",
    "Cadeiras que devem permanecer",
    m.cadeirasPermanecem
  );

  add(
    "Elétrica",
    "Tomadas extras",
    m.tomadasExtras
  );

  add(
    "Elétrica",
    "Quantidade de extensões",
    m.extensoes
  );

  add(
    "Elétrica",
    "Tamanho das extensões",
    m.tamanhoExtensao
  );

  add(
    "Jardinagem",
    "Projeto específico de jardinagem",
    m.jardinagem
  );

  add(
    "Marcenaria",
    "Projeto específico de marcenaria",
    m.marcenaria
  );

  add(
    "Serralheria",
    "Serviço específico de serralheria",
    m.serralheria
  );

  add(
    "Serralheria",
    "Serviço e materiais de serralheria",
    m.serralheriaDetalhe
  );

  add(
    "Pintura",
    "Pintura / acabamento",
    m.pintura
  );

  add(
    "Outros",
    "Outras solicitações",
    m.outras
  );

  /* =========================================
     ESTRUTURAS EXPOSITIVAS
     ========================================= */

  const structures = p.structures || {};

  Object.keys(structures)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(id => {

      const quantity = numberVal(
        structures[id]
      );

      if (quantity > 0) {

        const catalogItem =
          (state.structureCatalog || [])
            .find(item =>
              Number(item.id) === Number(id)
            );

        const description =
          catalogItem
            ? catalogItem.name
            : `Item ${String(id).padStart(2, "0")}`;

        items.push({
          type: "Estruturas Expositivas",
          label:
            `Item ${String(id).padStart(2, "0")} — ${description}`,
          value:
            `${quantity} unidade(s)`
        });

      }

    });

  return items;

}

function maintenanceTypes(p) {
  const types = new Set(maintenanceItems(p).map(x => x.type));
  if (Object.keys(p.structures || {}).length) types.add("Estruturas Expositivas");
  return [...types];
}

function communicationItems(p) {
  const c = p.comunicacao || {};
  const items = [];
  const add = (type, label, value) => { if (!isEmptyDemand(value)) items.push({ type, label, value: String(value) }); };
  add("Faixa", "Texto para faixa", c.faixa);
  add("Justificativa", "Texto de justificativa", c.justificativa);
  add("Gráfica", "Gráfica externa", c.graficaExterna);
  add("Arte", "Esboço para a Comunicação produzir a arte", c.esboco);
  add("Banner", "Banner em lona", c.banner);
  add("Banner", "Texto do banner", c.bannerTexto);
  add("Banner", "Medida do banner", c.bannerMedida);
  add("Personalizados", "Itens personalizados", c.itensPersonalizados);
  add("Personalizados", "Quantidade de personalizados", c.itensPersonalizadosQtd);
  add("Outros", "Outras solicitações", c.outras);
  add("Outros", "Quantidade de outras solicitações", c.outrasQtd);
  return items;
}

function communicationTypes(p) {
  return [...new Set(communicationItems(p).map(x => x.type))];
}

function sectorDemandItems(p, sector) {
  if (sector === "te") {
    const t = p.te || {};
    return [
      ["Necessita apoio TE", t.necessita],
      ["Etapa", t.etapa],
      ["Tipo de apoio", t.tipoApoio],
      ["Utiliza recursos digitais", t.recursosDigitais],
      ["Recursos digitais", t.recursos],
      ["Inteligência Artificial", t.ia],
      ["Quando o apoio é necessário", t.quando],
      ["Observações", t.observacoes]
    ].filter(([,v]) => !isEmptyDemand(v) && !/^(não|nao)$/i.test(String(v).trim()));
  }
  if (sector === "dispositivos") {
    const d = p.dispositivos || {};
    const labels = { notebookDell: "Notebook Dell", chromebook: "Chromebook", ipad: "iPad", fone: "Fone de ouvido", mouse: "Mouse", outros: "Outros" };
    return Object.entries(labels).map(([key,label]) => {
      const v = d[key];
      if (numberVal(v) > 0) return [label, String(v)];
      if (key === "outros" && !isEmptyDemand(v)) return [label, String(v)];
      return null;
    }).filter(Boolean);
  }
  if (sector === "fabricacao") {
    const f = p.fabricacao || {};
    return [
      ["Cortadora a Laser — produto", f.laserProduto], ["Cortadora a Laser — medidas", f.laserMedidas], ["Cortadora a Laser — quantidade", f.laserQtd], ["Cortadora a Laser — foto", f.laserFoto], ["Cortadora a Laser — arquivo", f.laserArquivo],
      ["Impressora 3D — produto", f.impressao3dProduto], ["Impressora 3D — medidas", f.impressao3dMedidas], ["Impressora 3D — quantidade", f.impressao3dQtd], ["Impressora 3D — foto", f.impressao3dFoto], ["Impressora 3D — arquivo", f.impressao3dArquivo]
    ].filter(([,v]) => !isEmptyDemand(v));
  }
  if (sector === "ti") {
    const t = p.ti || {};
    return [["Acesso à internet", t.internet], ["Local para internet", t.internetLocal], ["Adaptadores e cabos", t.adaptadoresCabos], ["Outras solicitações", t.outros]].filter(([,v]) => !isEmptyDemand(v));
  }
  if (sector === "av") {
    const a = p.av || {};
    return [["Projetor", a.projetor], ["Caixa de som", a.caixaSom], ["Microfone", a.microfone], ["TV / monitor", a.tvMonitor], ["Outros", a.outros]].filter(([,v]) => numberVal(v)>0 || !isEmptyDemand(v));
  }
  if (sector === "manutencao") return maintenanceItems(p).map(x => [x.label, x.value]);
  if (sector === "comunicacao") return communicationItems(p).map(x => [x.label, x.value]);
  return [];
}

function normalizeScopeText_(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstSeriesNumber_(value) {
  const match = String(value == null ? "" : value).match(/\\d+/);
  return match ? Number(match[0]) : null;
}

function projectMatchesRoleScope(p) {
  const role = String(state.role || "").toUpperCase();

  if (
    !role ||
    role === "ADMIN" ||
    role === "TE" ||
    role === "TI" ||
    role === "AUDIOVISUAL" ||
    role === "MANUTENCAO" ||
    role === "COMUNICACAO"
  ) {
    return true;
  }

  const segmento = normalizeScopeText_(p.segmento);
  const curriculo = normalizeScopeText_(p.curriculo);
  const disciplina = normalizeScopeText_(p.disciplina);
  const serie = firstSeriesNumber_(p.serie);

  switch (role) {
    case "EI":
      return segmento.includes("educacao infantil");

    case "EFAI":
      return (
        segmento.includes("ensino fundamental") &&
        serie != null &&
        serie >= 1 &&
        serie <= 5
      );

    case "EFAF":
      return (
        segmento.includes("ensino fundamental") &&
        serie != null &&
        serie >= 6 &&
        serie <= 9
      );

    case "EM":
      return segmento.includes("ensino medio");

    case "INTEGRAL":
      return curriculo === "integral";

    case "PASTORAL":
      return curriculo === "pastoral";

    case "INTERNACIONALIZACAO":
      return (
        curriculo === "middle school" ||
        curriculo === "high school" ||
        disciplina.includes("lingua inglesa")
      );

    default:
      return true;
  }
}

function filteredProjects() {
  const query =
    document.getElementById("search").value.trim().toLowerCase();

  const seg =
    document.getElementById("segmento").value;

  const serie =
    document.getElementById("serie").value;

  const disc =
    document.getElementById("disciplina").value;

  const forced =
    getCurrentSectorFromUrl();

  return state.projects
    .filter(p => {

      if (!projectMatchesRoleScope(p)) {
        return false;
      }

      const haystack =
        JSON.stringify(p).toLowerCase();

      const rawSegmento =
        String(p.segmento || "").trim();

      let segmentoMatch = true;

      if (seg) {

        if (seg === "Ensino Fundamental – Anos Iniciais") {
          segmentoMatch = [
            "Fund I",
            "Ensino Fundamental Anos Iniciais",
            "Ensino Fundamental – Anos Iniciais"
          ].includes(rawSegmento);

        } else if (seg === "Ensino Fundamental – Anos Finais") {
          segmentoMatch = [
            "Fund II",
            "Ensino Fundamental Anos Finais",
            "Ensino Fundamental – Anos Finais"
          ].includes(rawSegmento);

        } else if (seg === "Integral") {
          segmentoMatch =
            rawSegmento === "Integral" ||
            haystack.includes("integral");

        } else if (seg === "Pastoral") {
          segmentoMatch =
            rawSegmento === "Pastoral" ||
            haystack.includes("pastoral");

        } else if (seg === "Internacionalização") {
          segmentoMatch =
            String(p.disciplina || "")
              .toLowerCase()
              .includes("língua inglesa");

        } else {
          segmentoMatch =
            rawSegmento === seg;
        }
      }

      return (
        (!query || haystack.includes(query)) &&
        segmentoMatch &&
        (!serie || p.serie === serie) &&
        (!disc || p.disciplina === disc) &&
        (
          !forced ||
          !SECTOR_LABELS[forced] ||
          projectHasSector(p, forced)
        )
      );
    })
    .filter(p => {

      if (
        state.current === "manutencao" &&
        state.subfilter
      ) {
        return maintenanceTypes(p)
          .includes(state.subfilter);
      }

      if (
        state.current === "comunicacao" &&
        state.subfilter
      ) {
        return communicationTypes(p)
          .includes(state.subfilter);
      }

      return true;
    });
}

const filtered = filteredProjects;

function unique(field) {
  return [...new Set(state.projects.map(p => p[field]).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), "pt-BR"));
}

function fillSelect(id, values, allLabel) {
  const el = document.getElementById(id);
  const current = el.value;
  el.innerHTML = `<option value="">${esc(allLabel)}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if ([...el.options].some(o => o.value === current)) el.value = current;
}

function updateFilters() {

  const segmentos = new Set(
    state.projects
      .map(p => p.segmento)
      .filter(Boolean)
  );

  segmentos.add("Integral");
  segmentos.add("Pastoral");
  segmentos.add("Internacionalização");

  const segmentosExibicao = [...segmentos].map(labelSegmento);

  fillSelect(
    "segmento",
    [...new Set(segmentosExibicao)].sort((a, b) =>
      String(a).localeCompare(String(b), "pt-BR")
    ),
    "Todos"
  );

  fillSelect(
    "serie",
    unique("serie"),
    "Todas"
  );

  fillSelect(
    "disciplina",
    unique("disciplina"),
    "Todas"
  );
}
function labelSegmento(value) {
  if (!value) return "";

  const v = String(value).trim();

  if (
    v === "Fund I" ||
    v === "Ensino Fundamental Anos Iniciais" ||
    v === "Ensino Fundamental – Anos Iniciais"
  ) {
    return "Ensino Fundamental – Anos Iniciais";
  }

  if (
    v === "Fund II" ||
    v === "Ensino Fundamental Anos Finais" ||
    v === "Ensino Fundamental – Anos Finais"
  ) {
    return "Ensino Fundamental – Anos Finais";
  }

  return v;
}

function buildNav() {
  const forced = getCurrentSectorFromUrl();
  const nav = document.getElementById("navTabs");
  nav.innerHTML = NAV.map(([id,label]) => {
    const hide = forced && id !== "identificacao" && id !== forced;
    return `<button type="button" data-section="${id}" ${hide ? "hidden" : ""}>${label}</button>`;
  }).join("");
  nav.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => setSection(btn.dataset.section)));
  setSection(forced && SECTOR_LABELS[forced] ? forced : "identificacao");
}

function setSection(section) {
  state.current = section;
  state.page = 1;
  state.subfilter = "";
  document.querySelectorAll("#navTabs button").forEach(btn => btn.classList.toggle("active", btn.dataset.section === section));
  document.querySelectorAll(".section-content").forEach(el => el.classList.toggle("active", el.id === section));
  updateHeader();
  render();
}

function updateHeader() {
  const titles = { identificacao: "Projetos cadastrados", projeto: "Sobre o Projeto", gestao: "Gestão", ...SECTOR_LABELS };
  document.getElementById("sectionTitle").textContent = titles[state.current] || state.current;
  document.getElementById("sectionSubtitle").textContent = CONFIG.API_URL ? "Dados atualizados a partir do Google Sheets" : "Modo de demonstração com respostas reais de teste";
  document.getElementById("identificacaoPdfBtn").hidden = state.current !== "identificacao";
  document.getElementById("sectionChecklistBtn").hidden = !SECTOR_LABELS[state.current] || !filtered().some(p => projectHasSector(p, state.current));
  const sf = document.getElementById("sectorSubfilter");
  sf.classList.toggle("hidden", !["manutencao","comunicacao"].includes(state.current));
  if (state.current === "manutencao") {
    sf.innerHTML = MAINTENANCE_FILTERS.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
    sf.value = state.subfilter;
  } else if (state.current === "comunicacao") {
    sf.innerHTML = COMMUNICATION_FILTERS.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("");
    sf.value = state.subfilter;
  }
}
function formatDateOnly(value) {
  if (!value) return "";

  const text = String(value).trim();

  // Data ISO recebida da API
  const isoMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})T/
  );

  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  // Data no formato brasileiro
  const brMatch = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (brMatch) {
    return `${brMatch[1]}/${brMatch[2]}/${brMatch[3]}`;
  }

  return text;
}


function formatTimeOnly(value) {
  if (!value) return "";

  const text = String(value).trim();

  // Horário ISO com data fictícia ou data real
  const timeMatch = text.match(
    /T(\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (timeMatch) {
    return `${timeMatch[1]}:${timeMatch[2]}`;
  }

  // Horário simples HH:mm:ss
  const simpleMatch = text.match(
    /^(\d{2}):(\d{2})(?::\d{2})?$/
  );

  if (simpleMatch) {
    return `${simpleMatch[1]}:${simpleMatch[2]}`;
  }

  return text;
}

function spaceBlock(p) {
  const space =
    [p.spaceBase || p.space, p.sala]
      .filter(Boolean)
      .join(" • ") ||
    "Não informado";

  const dateFrom =
    formatDateOnly(p.spaceAvailableFrom);

  const timeFrom =
    formatTimeOnly(p.spaceAvailableAt);

  const availability = [
    dateFrom,
    timeFrom
  ].filter(Boolean).join(" • ");

  return `
    <div class="space-line">
      <b>📍 Espaço:</b> ${esc(space)}
      ${
        availability
          ? `<br><span>Disponível para preparação: ${esc(availability)}</span>`
          : ""
      }
    </div>
  `;
}

function projectSummary(p) {
  const cards = [
    ["Currículo", p.curriculo], ["Produto final", p.produto], ["Responsáveis", p.prof], ["Espaço", p.space],
    ["Apoio TE", summarizeSector(p,"te")], ["Dispositivos", summarizeSector(p,"dispositivos")], ["Fabricação Digital", summarizeSector(p,"fabricacao")], ["TI", summarizeSector(p,"ti")],
    ["Audiovisual", summarizeSector(p,"av")], ["Comunicação", summarizeSector(p,"comunicacao")], ["Manutenção", summarizeSector(p,"manutencao")], ["Etapa do projeto", p.te?.etapa]
  ];
  return `<div class="project-summary"><div class="project-area-grid">${cards.map(([label,value]) => `<div class="project-area-card"><b>${esc(label)}</b><div>${esc(value || "Não informado")}</div></div>`).join("")}</div></div>`;
}

function summarizeSector(p, sector) {
  const items = sectorDemandItems(p, sector);
  if (!items.length) return "Não solicitado";
  return items.slice(0,4).map(([label,value]) => `${label}: ${value}`).join("; ") + (items.length > 4 ? "…" : "");
}
function summarizeSectorCompleto(p, sector) {
  const items = sectorDemandItems(p, sector);

  if (!items.length) {
    return "Não solicitado";
  }

  return items
    .map(([label, value]) => `${label}: ${value}`)
    .join("; ");
}

function projectMedia(p) {

  const files = Array.isArray(p.files)
    ? p.files
    : [];

  if (!files.length) {

    return `
      <div class="project-media">
        <div class="media-group">
          <h4>Arquivos e imagens</h4>
          <div class="media-empty">
            Nenhum arquivo organizado ainda.
          </div>
        </div>
      </div>
    `;

  }

  const images = files.filter(f =>
    f.kind === "image" ||
    String(f.mimeType || "")
      .toLowerCase()
      .startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg|jfif)$/i.test(
      f.name || ""
    )
  );

  const others = files.filter(
    f => !images.includes(f)
  );

  const imgHtml = images.map(f => {

    /*
     * URL usada para EXIBIR, AMPLIAR e IMPRIMIR
     */
    const imageSrc =
      f.imageUrl ||
      f.thumbUrl ||
      "";

    /*
     * URL usada para abrir o arquivo no Drive
     */
    const driveUrl =
      f.url ||
      "";

    return `
      <div class="media-file">

        <img
          data-img-src="${esc(imageSrc)}"
          src="${esc(imageSrc)}"
          alt="${esc(f.name || "Imagem")}"
          loading="lazy"
          title="Clique para ampliar"
        >

        <div class="media-file-info">

          <div class="media-file-name">
            ${esc(f.name || "Imagem")}
          </div>

          <div class="media-file-meta">
            ${esc(f.category || "Imagem")}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap">

            <button
              class="media-print"
              data-print-src="${esc(imageSrc)}"
              type="button"
            >
              Imprimir A4
            </button>

            ${
              driveUrl
                ? `
                  <a
                    class="media-print"
                    href="${esc(driveUrl)}"
                    target="_blank"
                    rel="noopener"
                  >
                    Abrir no Drive
                  </a>
                `
                : ""
            }

          </div>

        </div>

      </div>
    `;

  }).join("");

  const fileHtml = others.map(f => `

    <div class="media-file">

      <div class="media-file-info">

        <div class="media-file-name">
          ${esc(f.name || "Arquivo")}
        </div>

        <div class="media-file-meta">
          ${esc(f.category || "Arquivo")}
        </div>

        <a
          class="media-print"
          href="${esc(f.url || "#")}"
          target="_blank"
          rel="noopener"
        >
          Abrir arquivo
        </a>

      </div>

    </div>

  `).join("");

  return `
    <div class="project-media">

      <div class="media-group">
        <h4>Imagens</h4>

        <div class="media-strip">

          ${
            imgHtml ||
            `
              <div class="media-empty">
                Nenhuma imagem.
              </div>
            `
          }

        </div>
      </div>

      <div class="media-group">
        <h4>Arquivos</h4>

        <div class="media-strip">

          ${
            fileHtml ||
            `
              <div class="media-empty">
                Nenhum arquivo adicional.
              </div>
            `
          }

        </div>
      </div>

    </div>
  `;
}

function sectorStatusHtml(p) {
  const sectors = [
    ["te", "Apoio TE"],
    ["dispositivos", "Dispositivos e Periféricos"],
    ["fabricacao", "Fabricação Digital"],
    ["ti", "TI"],
    ["av", "Audiovisual"],
    ["manutencao", "Manutenção"],
    ["comunicacao", "Comunicação"]
  ];

  const requested = sectors.filter(([key]) => projectHasSector(p, key));

  if (!requested.length) {
    return `
      <div class="sector-status">
        <div class="sector-status-title">Status dos setores</div>
        <div class="sector-status-empty">Nenhuma demanda de apoio registrada.</div>
      </div>
    `;
  }

  const items = requested.map(([key, label]) => {
    const status =
      String(p.checklist?.[key]?.status || "").toLowerCase();

    const done =
      status === "concluído" ||
      status === "concluido";

    return `
      <div class="sector-status-item ${done ? "done" : "pending"}">
        <span class="sector-status-icon">${done ? "✓" : "○"}</span>
        <span class="sector-status-label">${esc(label)}</span>
        <span class="sector-status-text">
          ${done ? "Concluído" : "Pendente"}
        </span>
      </div>
    `;
  }).join("");

  return `
    <div class="sector-status">
      <div class="sector-status-title">Status dos setores</div>
      <div class="sector-status-grid">
        ${items}
      </div>
    </div>
  `;
}

function renderIdentificacao(arr) {
  const start = 0;
const pageArr = arr;

  document.getElementById("projectRows").innerHTML = pageArr.map((p, offset) => {
    const i = start + offset;

    return `<tr>
      <td>${esc(p.titulo)}</td>
      <td>${esc(labelSegmento(p.segmento))}</td>
      <td>${esc(p.serie)}</td>
      <td>${esc(p.disciplina)}</td>
      <td>${esc(p.prof)}</td>
      <td><button class="detail-btn" type="button" data-open-detail="${i}">Ver detalhes ›</button></td>
    </tr>

    <tr id="detail-${i}" class="detail-row">
      <td colspan="6">
        <div class="detail-box">

          <h3>${esc(p.titulo)}</h3>

          <div class="detail-grid">

            <div class="detail-item">
              <b>Segmento</b>
              ${esc(labelSegmento(p.segmento))}
            </div>

            <div class="detail-item">
              <b>Série</b>
              ${esc(p.serie)}
            </div>

            <div class="detail-item">
              <b>Disciplina</b>
              ${esc(p.disciplina)}
            </div>

            <div class="detail-item">
              <b>Professor(es)</b>
              ${esc(p.prof)}
            </div>

            <div class="detail-item">
              <b>Produto final</b>
              ${esc(p.produto)}
            </div>

            <div class="detail-item">
              <b>Espaço</b>
              ${esc([p.space, p.sala].filter(Boolean).join(" • "))}
            </div>

          </div>

          <div class="detail-item" style="margin-top:10px">
            <b>Justificativa / descrição</b>
            ${esc(p.justificativa || "Não informada")}
            <br><br>
            ${esc(p.desc || "")}
          </div>

          ${sectorStatusHtml(p)}
${projectSummary(p)}
${projectMedia(p)}
${state.audit ? auditEditor(p) : ""}

        </div>
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="6"><div class="media-empty">Nenhum projeto encontrado.</div></td></tr>`;

  document.getElementById("pages").innerHTML = "";

document.getElementById("showing").textContent =
  `Mostrando ${arr.length} de ${arr.length} projetos`;

  bindDetailEvents();
}
function renderPages(total) {
  const pages = Math.max(1, Math.ceil(total / CONFIG.PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  document.getElementById("pages").innerHTML = Array.from({length:pages},(_,i) => `<button class="pagebtn ${i+1===state.page?"active":""}" type="button" data-page="${i+1}">${i+1}</button>`).join("");
  document.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => { state.page = Number(btn.dataset.page); render(); }));
}

function bindDetailEvents() {
  document.querySelectorAll("[data-open-detail]").forEach(btn => btn.addEventListener("click", () => document.getElementById(`detail-${btn.dataset.openDetail}`)?.classList.toggle("open")));
  document.querySelectorAll("[data-img-src]").forEach(img => img.addEventListener("click", () => openLightbox(img.dataset.imgSrc, img.closest(".detail-box"))));
  document.querySelectorAll("[data-print-src]").forEach(btn => btn.addEventListener("click", () => printImageA4(btn.dataset.printSrc)));
  bindAuditSave();
}

function openLightbox(src, scope) {
  const imgs = [...scope.querySelectorAll("[data-img-src]")].map(x => x.dataset.imgSrc);
  state.lightbox = { images: imgs, index: Math.max(0, imgs.indexOf(src)) };
  document.getElementById("lightbox").classList.add("open");
  document.getElementById("lightbox").setAttribute("aria-hidden", "false");
  showLightboxImage();
}
function showLightboxImage() { document.getElementById("lightboxImg").src = state.lightbox.images[state.lightbox.index] || ""; }
function closeLightbox() { document.getElementById("lightbox").classList.remove("open"); document.getElementById("lightbox").setAttribute("aria-hidden", "true"); }
function printImageA4(src) { const w = window.open("", "_blank"); if (!w) return; w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Imagem A4</title><style>@page{size:A4;margin:10mm}html,body{margin:0;padding:0}body{display:flex;align-items:center;justify-content:center;height:277mm}img{max-width:190mm;max-height:267mm;object-fit:contain}</style></head><body><img src="${esc(src)}" onload="setTimeout(()=>window.print(),250)"></body></html>`); w.document.close(); }

function detailForSector(p, sector) {
  const items = sectorDemandItems(p, sector);
  if (!items.length && !projectHasSector(p, sector)) return "";
  const rows = items.map(([label,value]) => `<div class="demand-row"><b>${esc(label)}</b><div>${esc(value)}</div></div>`).join("");
  return rows || `<div class="demand-row"><b>Demanda</b><div>Solicitação registrada.</div></div>`;
}

function sectorDemandHtml(p, sector) {
  if (!projectHasSector(p, sector)) return "";
  const check = p.checklist?.[sector] || {};
  const done = String(check.status || "").toLowerCase() === "concluído" || String(check.status || "").toLowerCase() === "concluido";
  const filterBadge = sector === "manutencao" && maintenanceTypes(p).length ? `<div class="checklist-meta">${maintenanceTypes(p).map(t=>`<span class="status-pill">${esc(t)}</span>`).join("")}</div>` : sector === "comunicacao" && communicationTypes(p).length ? `<div class="checklist-meta">${communicationTypes(p).map(t=>`<span class="status-pill">${esc(t)}</span>`).join("")}</div>` : "";
  return `<div class="check-item">
    <input type="checkbox" data-check-status data-project="${esc(p.id)}" data-sector="${esc(sector)}" ${done ? "checked" : ""} aria-label="Marcar ${esc(p.titulo)} como concluído">
    <div class="check-body">
      <b>${esc(p.titulo)}</b>
      <div class="small">${esc(labelSegmento(p.segmento))} • ${esc(p.serie)} • ${esc(p.disciplina)}${p.prof ? ` • ${esc(p.prof)}` : ""}</div>
      ${filterBadge}
      ${detailForSector(p, sector)}
${spaceBlock(p)}
${sector === "manutencao" ? croquiHtml(p) : ""}
${state.audit ? auditEditor(p, sector) : ""}
      ${check.note ? `<div class="meta" style="margin-top:7px">Observação do setor: ${esc(check.note)}</div>` : ""}
    </div>
    <div class="check-actions"><span class="status-pill ${done ? "done" : ""}">${done ? "Concluído" : "Pendente"}</span></div>
  </div>`;
}

function getCroquiFile(p) {
  const files = Array.isArray(p.files) ? p.files : [];

  return files.find(f => {
    const text = [
      f.name,
      f.category,
      f.kind,
      f.mimeType
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes("croqui");
  }) || null;
}

function croquiHtml(p, compact = false) {
  const croqui = getCroquiFile(p);

  if (!croqui) {
    return "";
  }

  const fileId = croqui.copiedId;

  if (!fileId) {
    return `
      <div class="croqui-box">
        <div class="croqui-title">Croqui / esboço</div>
        <div class="media-empty">
          Croqui encontrado, mas sem ID disponível para visualização.
        </div>
      </div>
    `;
  }

  const previewUrl =
    `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;

  return `
    <div class="croqui-box ${compact ? "compact" : ""}">

      <div class="croqui-header">
        <div>
          <div class="croqui-title">
            Croqui / esboço da apresentação
          </div>
          <div class="croqui-name">
            ${esc(croqui.name || "Arquivo do projeto")}
          </div>
        </div>

        ${
          croqui.url
            ? `
              <a
                class="croqui-open"
                href="${esc(croqui.url)}"
                target="_blank"
                rel="noopener"
              >
                Abrir no Drive
              </a>
            `
            : ""
        }

      </div>

      <div class="croqui-preview">
        <iframe
          src="${esc(previewUrl)}"
          title="Croqui / esboço do projeto"
          loading="lazy"
          allow="autoplay"
        ></iframe>
      </div>

    </div>
  `;
}

function croquiPdfHtml(p) {
  const croqui = getCroquiFile(p);

  if (!croqui) {
    return "";
  }

  const isPdf =
    String(croqui.mimeType || "").toLowerCase() === "application/pdf";

  const isImage =
    String(croqui.mimeType || "")
      .toLowerCase()
      .startsWith("image/");

  if (isImage) {
    const src =
      croqui.imageUrl ||
      croqui.thumbUrl ||
      croqui.url ||
      "";

    if (!src) return "";

    return `
      <div class="croqui-pdf-section">
        <div class="croqui-pdf-title">
          Croqui / esboço da apresentação
        </div>

        <img
          class="croqui-pdf-image"
          src="${esc(src)}"
          alt="${esc(croqui.name || "Croqui")}"
        />
      </div>
    `;
  }

  if (isPdf && croqui.copiedId) {
    const previewUrl =
      `https://drive.google.com/file/d/${encodeURIComponent(croqui.copiedId)}/preview`;

    return `
      <div class="croqui-pdf-section">
        <div class="croqui-pdf-title">
          Croqui / esboço da apresentação
        </div>

        <div class="croqui-pdf-link">
          Croqui em PDF:
          <a href="${esc(croqui.url || previewUrl)}" target="_blank">
            ${esc(croqui.name || "Abrir croqui")}
          </a>
        </div>
      </div>
    `;
  }

  return `
    <div class="croqui-pdf-section">
      <div class="croqui-pdf-title">
        Croqui / esboço da apresentação
      </div>

      <div class="croqui-pdf-link">
        ${esc(croqui.name || "Abrir croqui no Drive")}
      </div>
    </div>
  `;
}

function renderSector(arr, sector) {
  const items = arr.map(p => sectorDemandHtml(p, sector)).filter(Boolean).join("");
  const text = sector === "comunicacao"
    ? "Os textos, arquivos e solicitações preenchidos no Forms aparecem aqui agrupados por projeto. O espaço acompanha cada demanda."
    : "Cada projeto aparece com a solicitação específica do setor e o espaço onde o atendimento deverá ocorrer.";
  document.getElementById(`${sector}Cards`).innerHTML = `<div class="sector-note"><b>${esc(SECTOR_LABELS[sector])}</b><br>${text}</div>${items || `<div class="media-empty">Nenhuma demanda encontrada para este setor no recorte atual.</div>`}`;
  bindChecklist();
  bindAuditSave();
}

function renderProjectCards(arr) {
  document.getElementById("projetoCards").innerHTML = arr.map(p => `<div class="card"><div><h3>${esc(p.titulo)}</h3><div class="meta">${esc(labelSegmento(p.segmento))} • ${esc(p.serie)}<br>${esc(p.disciplina)} • ${esc(p.prof)}</div>${spaceBlock(p)}</div><div class="bodytxt"><b>Justificativa</b><br>${esc(p.justificativa || "Não informada")}<br><br><b>Descrição</b><br>${esc(p.desc || "Não informada")}${projectSummary(p)}${projectMedia(p)}${state.audit ? auditEditor(p) : ""}</div></div>`).join("") || `<div class="media-empty">Nenhum projeto encontrado.</div>`;
  bindDetailEvents();
}
function structureRequesters(arr, structureId) {
  const id = String(structureId).padStart(2, "0");

  return arr
    .map(p => {
      const quantity = numberVal(
        p.structures?.[id]
      );

      if (quantity <= 0) return null;

      return {
        serie: p.serie || "—",
        projeto: p.titulo || "Sem título",
        quantidade: quantity
      };
    })
    .filter(Boolean);
}


function renderGestao(arr) {
  const inv = state.inventory || [];
  const totals = Object.fromEntries(inv.map(item => [item.key, arr.reduce((sum,p) => sum + numberVal(p[item.sourceGroup]?.[item.sourceKey]), 0)]));
  const requestedCountable = inv.reduce((sum,item) => sum + Number(totals[item.key] || 0), 0);
  const structureRows = (state.structureCatalog || []).map(item => {
    const requested = arr.reduce((sum,p) => sum + numberVal(p.structures?.[String(item.id).padStart(2,"0")]), 0);
    return {...item, requested, remaining: item.available == null ? null : Number(item.available) - requested};
  });
  const activeStructures = structureRows.filter(x => x.requested > 0);
  const structureRequested = activeStructures.reduce((sum,x) => sum + x.requested, 0);
  
  const equipmentHtml = inv.map(item => {
    const requested = Number(totals[item.key] || 0);
    const available = item.available == null ? null : Number(item.available);
    const remaining = available == null ? null : available - requested;
    return `<div class="inventory-card"><div class="inventory-icon">${item.group === "Audiovisual" ? "◉" : item.group === "Manutenção" ? "⌁" : "▣"}</div><div class="inventory-main"><b>${esc(item.name)}</b><div class="inventory-meta">${esc(item.group)}</div></div><div class="inventory-numbers"><div><strong>${requested}</strong><span>solicitado(s)</span></div><div class="inventory-sep">/</div><div><strong>${available == null ? "—" : available}</strong><span>${available == null ? "disponível não informado" : "disponível(is)"}</span></div></div>${remaining != null ? `<div class="inventory-balance ${remaining < 0 ? "over" : ""}"><b>${remaining}</b><span>${remaining < 0 ? "déficit" : "saldo"}</span></div>` : ""}</div>`;
  }).join("");

  const structureHtml = activeStructures.map(row => {

  const requesters = structureRequesters(arr, row.id);

  const detailRows = requesters.length
    ? requesters.map(item => `
        <tr class="structure-detail-row">
          <td>${esc(item.serie)}</td>
          <td>${esc(item.projeto)}</td>
          <td>${item.quantidade}</td>
        </tr>
      `).join("")
    : `
        <tr class="structure-detail-row">
          <td colspan="3">Nenhum solicitante encontrado.</td>
        </tr>
      `;

  return `
    <tbody class="structure-group">

      <tr class="structure-main-row" data-structure-toggle>
        <td>
          <span class="structure-toggle-icon">›</span>
          <b>Item ${String(row.id).padStart(2,"0")}</b>
        </td>

        <td>${esc(row.name)}</td>

        <td>${row.requested}</td>

        <td>
          ${row.available == null ? "—" : row.available}
        </td>

        <td class="${row.remaining != null && row.remaining < 0 ? "deficit" : ""}">
          ${row.remaining == null ? "—" : row.remaining}
        </td>
      </tr>

      <tr class="structure-detail-container">
        <td colspan="5">

          <div class="structure-detail-panel">

            <div class="structure-detail-title">
              Quem solicitou
            </div>

            <table class="structure-detail-table">

              <thead>
                <tr>
                  <th>Série</th>
                  <th>Projeto</th>
                  <th>Quantidade</th>
                </tr>
              </thead>

              <tbody>
                ${detailRows}
              </tbody>

            </table>

          </div>

        </td>
      </tr>

    </tbody>
  `;
})
.join("") || `
  <tbody>
    <tr>
      <td colspan="5">
        <div class="media-empty">
          Nenhum item de estrutura expositiva foi solicitado no recorte atual.
        </div>
      </td>
    </tr>
  </tbody>
`;

  const nonCountable = [
    ["Adaptadores e cabos", arr.filter(p => !isEmptyDemand(p.ti?.adaptadoresCabos)).length],
    ["Outros dispositivos", arr.filter(p => !isEmptyDemand(p.dispositivos?.outros)).length]
  ];

  document.getElementById("gestaoContent").innerHTML = `
    <div class="management-intro"><div><b>Visão geral das solicitações</b><span>Quantidades consolidadas a partir das respostas reais do Forms.</span></div><div class="management-updated">${arr.length} projeto(s) no recorte atual</div></div>
    <div class="kpis">
    <section class="management-section">

  <div class="management-section-head">

    <div>
      <h3>Conflitos de espaços</h3>
      <p>
        Projetos diferentes utilizando o mesmo espaço no recorte atual.
      </p>
    </div>

  

  </div>


</section>
  <div class="kpi"><b>${arr.length}</b><span>Projetos no recorte</span></div>
  <div class="kpi"><b>${requestedCountable}</b><span>Itens quantificáveis solicitados</span></div>
  <div class="kpi"><b>${activeStructures.length}</b><span>Tipos de estruturas solicitados</span></div>
  <div class="kpi"><b>${structureRequested}</b><span>Estruturas solicitadas</span></div>

</div>
    <section class="management-section"><div class="management-section-head"><div><h3>Equipamentos e recursos</h3><p>Solicitado / disponível. A disponibilidade vem da aba ESTOQUE, não do Forms.</p></div></div><div class="inventory-grid">${equipmentHtml}</div><div class="management-note"><b>Importante:</b> quando o Forms não coleta quantidade de um recurso (por exemplo, adaptadores/cabos ou texto livre em “Outros”), o painel mostra o número de projetos solicitantes em vez de inventar uma quantidade.</div><div class="inventory-grid">${nonCountable.map(([name,count])=>`<div class="inventory-card"><div class="inventory-icon">≋</div><div class="inventory-main"><b>${esc(name)}</b><div class="inventory-meta">Solicitação em texto</div></div><div class="inventory-numbers"><div><strong>${count}</strong><span>projeto(s)</span></div></div></div>`).join("")}</div></section>
    <section class="management-section"><div class="management-section-head"><div><h3>Estruturas expositivas</h3><p>Itens 01–41 do Forms vinculados ao catálogo e às quantidades do depósito.</p></div><div class="structure-summary"><b>${activeStructures.length}</b><span>itens com solicitação</span></div></div><div class="table-wrap"><table class="inventory-table"><thead><tr><th>Item</th><th>Estrutura / descrição</th><th>Solicitado</th><th>Disponível</th><th>Saldo</th></tr></thead><tbody>${structureHtml}</tbody></table></div><div class="management-note"><b>Fonte:</b> catálogo de estruturas expositivas. A coluna “Solicitado” soma as respostas dos projetos nas colunas Item 01 a Item 41.</div></section>
    <section class="management-section"><div class="management-section-head"><div><h3>Projetos e respectivos espaços</h3><p>Referência rápida para distribuição e montagem.</p></div></div><div class="management-projects">${arr.map(p => `<div class="management-project"><div><b>${esc(p.titulo)}</b><span>${esc(labelSegmento(p.segmento))} • ${esc(p.serie)} • ${esc(p.disciplina)}</span></div><div class="management-space">📍 ${esc([p.space,p.sala].filter(Boolean).join(" • ") || "Não informado")}</div></div>`).join("") || `<div class="media-empty">Nenhum projeto.</div>`}</div></section>
    ${state.audit ? `<div class="audit-summary"><b>Auditoria da Gestão</b><br>Edições administrativas são gravadas no Sheets e entram no histórico.</div>${arr.map(p => auditEditor(p)).join("")}` : ""}
  `;
  document
  .querySelectorAll("[data-structure-toggle]")
  .forEach(row => {
    row.addEventListener("click", () => {

      const detailRow = row.nextElementSibling;

      if (!detailRow) return;

      const isOpen =
        detailRow.classList.contains("open");

      detailRow.classList.toggle("open", !isOpen);
      row.classList.toggle("open", !isOpen);

    });
  });


document
  .querySelectorAll("[data-space-conflict-toggle]")
  .forEach(row => {
    row.addEventListener("click", () => {

      const detailRow = row.nextElementSibling;

      if (!detailRow) return;

      const isOpen =
        detailRow.classList.contains("open");

      detailRow.classList.toggle("open", !isOpen);
      row.classList.toggle("open", !isOpen);

    });
  });

bindAuditSave();
}

function auditEditor(p, focusSector = "") {

    const role = String(state.role || "ADMIN").toUpperCase();

  const FULL_ACCESS_ROLES = [
    "ADMIN",
    "EI",
    "EFAI",
    "EFAF",
    "EM",
    "INTEGRAL",
    "PASTORAL",
    "INTERNACIONALIZACAO"
  ];

  const ROLE_SECTIONS = {
    TE: ["te", "dispositivos", "fabricacao"],
    TI: ["ti"],
    AUDIOVISUAL: ["av"],
    MANUTENCAO: ["manutencao", "estruturas"],
    COMUNICACAO: ["comunicacao"]
  };

  const isFullAccess = FULL_ACCESS_ROLES.includes(role);

  const canEditSection = (key) => {
    if (isFullAccess) return true;

    const allowed = ROLE_SECTIONS[role] || [];
    return allowed.includes(key);
  };

  const isSectorRole = Object.prototype.hasOwnProperty.call(
    ROLE_SECTIONS,
    role
  );

  const te = p.te || {};
  const d = p.dispositivos || {};
  const f = p.fabricacao || {};
  const ti = p.ti || {};
  const av = p.av || {};
  const m = p.manutencao || {};
  const c = p.comunicacao || {};
  const structures = p.structures || {};

  const field = (
    path,
    label,
    value,
    type = "input"
  ) => {

    const safeValue =
      value == null ? "" : String(value);

    if (type === "textarea") {

      return `
        <div class="fieldset">
          <label>${esc(label)}</label>
          <textarea
            data-audit-field="${esc(path)}"
          >${esc(safeValue)}</textarea>
        </div>
      `;

    }

    if (type === "number") {

  const isNumeric =
    safeValue === "" ||
    /^-?\d+(?:[.,]\d+)?$/.test(safeValue.trim());

  return `
    <div class="fieldset">
      <label>${esc(label)}</label>
      <input
        type="${isNumeric ? "number" : "text"}"
        ${isNumeric ? 'min="0" step="1"' : ""}
        ${isNumeric ? 'inputmode="numeric"' : ""}
        data-audit-field="${esc(path)}"
        value="${esc(safeValue)}"
      >
    </div>
  `;

}

    return `
      <div class="fieldset">
        <label>${esc(label)}</label>
        <input
          type="text"
          data-audit-field="${esc(path)}"
          value="${esc(safeValue)}"
        >
      </div>
    `;

  };

  const readonly = (label, value) => `
    <div class="fieldset">
      <label>${esc(label)}</label>
      <div class="audit-readonly">
        ${esc(value || "Não informado")}
      </div>
    </div>
  `;

  /*
   * focusSector define qual setor deve aparecer
   * na auditoria específica.
   *
   * "estruturas" também pertence à Manutenção,
   * portanto permitimos essa associação.
   */
    const section = (
    key,
    title,
    content,
    defaultOpen = true
  ) => {

    // Perfis de setor só enxergam as seções
    // que possuem permissão para editar.
    if (
  isSectorRole &&
  !canEditSection(key) &&
  key !== "geral" &&
  key !== "arquivos"
) {
  return "";
}

    // Mantém o comportamento de foco específico
    // quando a tela foi aberta para um setor.
    if (
      focusSector &&
      key !== focusSector &&
      !(focusSector === "manutencao" && key === "estruturas")
    ) {
      return "";
    }

    const open =
      focusSector === key || defaultOpen
        ? "open"
        : "";

    return `
      <details
        class="audit-section"
        ${open}
      >
        <summary>
          ${esc(title)}
        </summary>

        <div class="audit-section-body">
          <div class="audit-fields-grid">
            ${content}
          </div>
        </div>
      </details>
    `;
  };

  /* ======================================================
     DADOS GERAIS
     ====================================================== */

  const generalFields = [

    field(
      "titulo",
      "Título do projeto",
      p.titulo
    ),

    field(
      "prof",
      "Professor(es) responsável(is)",
      p.prof
    ),

    field(
      "segmento",
      "Segmento",
      p.segmento
    ),

    field(
      "curriculo",
      "Currículo",
      p.curriculo
    ),

    field(
      "serie",
      "Série",
      p.serie
    ),

    field(
      "disciplina",
      "Componente curricular",
      p.disciplina
    ),

    field(
      "produto",
      "Produto final esperado",
      p.produto
    ),

    field(
      "space",
      "Espaço",
      p.space
    ),

    field(
      "sala",
      "Sala / número / nome",
      p.sala
    ),

    field(
      "spaceAvailableFrom",
      "Data disponível para preparação",
      p.spaceAvailableFrom
    ),

    field(
      "spaceAvailableAt",
      "Horário disponível para preparação",
      p.spaceAvailableAt
    ),

    field(
      "desc",
      "Breve descrição do projeto",
      p.desc,
      "textarea"
    ),

    field(
      "justificativa",
      "Justificativa",
      p.justificativa,
      "textarea"
    )

  ].join("");


  const generalReadonlyFields = [
    readonly("Título do projeto", p.titulo),
    readonly("Professor(es) responsável(is)", p.prof),
    readonly("Segmento", p.segmento),
    readonly("Currículo", p.curriculo),
    readonly("Série", p.serie),
    readonly("Componente curricular", p.disciplina),
    readonly("Produto final esperado", p.produto),
    readonly("Espaço", p.space),
    readonly("Sala / número / nome", p.sala),
    readonly("Data disponível para preparação", p.spaceAvailableFrom),
    readonly("Horário disponível para preparação", p.spaceAvailableAt),
    readonly("Breve descrição do projeto", p.desc),
    readonly("Justificativa", p.justificativa)
  ].join("");

  /* ======================================================
     APOIO TE
     ====================================================== */

  const teFields = [

    field(
      "te.necessita",
      "Necessita apoio TE",
      te.necessita
    ),

    field(
      "te.etapa",
      "Etapa do projeto",
      te.etapa
    ),

    field(
      "te.tipoApoio",
      "Tipo de apoio esperado",
      te.tipoApoio,
      "textarea"
    ),

    field(
      "te.recursosDigitais",
      "Utiliza recursos digitais",
      te.recursosDigitais
    ),

    field(
      "te.recursos",
      "Recursos digitais",
      te.recursos,
      "textarea"
    ),

    field(
      "te.ia",
      "Inteligência Artificial",
      te.ia
    ),

    field(
      "te.quando",
      "Quando o apoio TE será necessário",
      te.quando,
      "textarea"
    ),

    field(
      "te.observacoes",
      "Observações",
      te.observacoes,
      "textarea"
    )

  ].join("");

  /* ======================================================
     DISPOSITIVOS E PERIFÉRICOS
     ====================================================== */

  const deviceFields = [

    field(
      "dispositivos.notebookDell",
      "Notebook Dell — quantidade",
      d.notebookDell,
      "number"
    ),

    field(
      "dispositivos.chromebook",
      "Chromebook — quantidade",
      d.chromebook,
      "number"
    ),

    field(
      "dispositivos.ipad",
      "iPad — quantidade",
      d.ipad,
      "number"
    ),

    field(
      "dispositivos.fone",
      "Fone de ouvido — quantidade",
      d.fone,
      "number"
    ),

    field(
      "dispositivos.mouse",
      "Mouse — quantidade",
      d.mouse,
      "number"
    ),

    field(
      "dispositivos.outros",
      "Outros dispositivos",
      d.outros,
      "textarea"
    )

  ].join("");

  /* ======================================================
     FABRICAÇÃO DIGITAL
     ====================================================== */

  const fabricationFields = [

    field(
      "fabricacao.laserProduto",
      "Cortadora a Laser — produto",
      f.laserProduto,
      "textarea"
    ),

    field(
      "fabricacao.laserMedidas",
      "Cortadora a Laser — medidas",
      f.laserMedidas
    ),

    field(
      "fabricacao.laserQtd",
      "Cortadora a Laser — quantidade",
      f.laserQtd,
      "number"
    ),

    readonly(
      "Cortadora a Laser — foto de referência",
      f.laserFoto
    ),

    readonly(
      "Cortadora a Laser — arquivo",
      f.laserArquivo
    ),

    field(
      "fabricacao.impressao3dProduto",
      "Impressora 3D — produto",
      f.impressao3dProduto,
      "textarea"
    ),

    field(
      "fabricacao.impressao3dMedidas",
      "Impressora 3D — medidas",
      f.impressao3dMedidas
    ),

    field(
      "fabricacao.impressao3dQtd",
      "Impressora 3D — quantidade",
      f.impressao3dQtd,
      "number"
    ),

    readonly(
      "Impressora 3D — foto de referência",
      f.impressao3dFoto
    ),

    readonly(
      "Impressora 3D — arquivo",
      f.impressao3dArquivo
    )

  ].join("");

  /* ======================================================
     TI
     ====================================================== */

  const tiFields = [

    field(
      "ti.internet",
      "Acesso à internet",
      ti.internet
    ),

    field(
      "ti.internetLocal",
      "Local para internet",
      ti.internetLocal,
      "textarea"
    ),

    field(
      "ti.adaptadoresCabos",
      "Adaptadores e cabos",
      ti.adaptadoresCabos,
      "textarea"
    ),

    field(
      "ti.outros",
      "Outras solicitações",
      ti.outros,
      "textarea"
    )

  ].join("");

  /* ======================================================
     AUDIOVISUAL
     ====================================================== */

  const avFields = [

    field(
      "av.somVideo",
      "Utilizará som ou vídeo",
      av.somVideo
    ),

    field(
      "av.projetor",
      "Projetor — quantidade",
      av.projetor,
      "number"
    ),

    field(
      "av.caixaSom",
      "Caixa de som — quantidade",
      av.caixaSom,
      "number"
    ),

    field(
      "av.microfone",
      "Microfone — quantidade",
      av.microfone,
      "number"
    ),

    field(
      "av.tvMonitor",
      "TV / monitor — quantidade",
      av.tvMonitor,
      "number"
    ),

    field(
      "av.outros",
      "Outras solicitações",
      av.outros,
      "textarea"
    )

  ].join("");

  /* ======================================================
     MANUTENÇÃO
     ====================================================== */

  const maintenanceFields = [

    field(
      "manutencao.subsetor",
      "Subsetor da Manutenção",
      m.subsetor
    ),

    field(
      "manutencao.movimentacao",
      "Movimentação de mobiliário",
      m.movimentacao
    ),

    field(
      "manutencao.descricaoMovimentacao",
      "Descrição da movimentação",
      m.descricaoMovimentacao,
      "textarea"
    ),

    field(
      "manutencao.guardarMobiliario",
      "Local para guardar mobiliário retirado",
      m.guardarMobiliario,
      "textarea"
    ),

    field(
      "manutencao.mesasPermanecem",
      "Mesas escolares que devem permanecer",
      m.mesasPermanecem,
      "number"
    ),

    field(
      "manutencao.cadeirasPermanecem",
      "Cadeiras escolares que devem permanecer",
      m.cadeirasPermanecem,
      "number"
    ),

    field(
      "manutencao.tomadasExtras",
      "Tomadas extras",
      m.tomadasExtras
    ),

    field(
      "manutencao.extensoes",
      "Extensões — quantidade",
      m.extensoes,
      "number"
    ),

    field(
      "manutencao.tamanhoExtensao",
      "Tamanho das extensões",
      m.tamanhoExtensao
    ),

    field(
      "manutencao.jardinagem",
      "Jardinagem",
      m.jardinagem,
      "textarea"
    ),

    field(
      "manutencao.marcenaria",
      "Marcenaria",
      m.marcenaria,
      "textarea"
    ),

    field(
      "manutencao.serralheria",
      "Serralheria",
      m.serralheria,
      "textarea"
    ),

    field(
      "manutencao.serralheriaDetalhe",
      "Detalhamento de serralheria e materiais",
      m.serralheriaDetalhe,
      "textarea"
    ),

    field(
      "manutencao.pintura",
      "Pintura / acabamento",
      m.pintura,
      "textarea"
    ),

    field(
      "manutencao.outras",
      "Outras solicitações",
      m.outras,
      "textarea"
    ),

    readonly(
      "Croqui / esboço da apresentação",
      m.croqui
    )

  ].join("");

  /* ======================================================
     COMUNICAÇÃO
     ====================================================== */

  const communicationFields = [

    field(
      "comunicacao.faixa",
      "Texto para faixa",
      c.faixa,
      "textarea"
    ),

    field(
      "comunicacao.justificativa",
      "Texto para justificativa",
      c.justificativa,
      "textarea"
    ),

    field(
      "comunicacao.graficaExterna",
      "Gráfica externa",
      c.graficaExterna
    ),

    readonly(
      "Esboço para criação da arte",
      c.esboco
    ),

    field(
      "comunicacao.banner",
      "Banner em lona",
      c.banner
    ),

    field(
      "comunicacao.bannerTexto",
      "Texto do banner",
      c.bannerTexto,
      "textarea"
    ),

    field(
      "comunicacao.bannerMedida",
      "Medida do banner",
      c.bannerMedida
    ),

    field(
      "comunicacao.itensPersonalizados",
      "Itens personalizados",
      c.itensPersonalizados,
      "textarea"
    ),

    field(
      "comunicacao.itensPersonalizadosQtd",
      "Quantidade de itens personalizados",
      c.itensPersonalizadosQtd,
      "number"
    ),

    readonly(
      "Foto de referência — personalizados",
      c.fotoPersonalizados
    ),

    field(
      "comunicacao.outras",
      "Outras solicitações",
      c.outras,
      "textarea"
    ),

    field(
      "comunicacao.outrasQtd",
      "Quantidade de outras solicitações",
      c.outrasQtd,
      "number"
    ),

    readonly(
      "Foto de referência — outras solicitações",
      c.fotoOutras
    )

  ].join("");

  /* ======================================================
     ESTRUTURAS EXPOSITIVAS
     ====================================================== */

  const structureFields =
    Array.from(
      { length: 41 },
      (_, index) => {

        const id =
          String(index + 1)
            .padStart(2, "0");

        const catalogItem =
          (state.structureCatalog || [])
            .find(
              x => Number(x.id) === Number(id)
            );

        let label =
          catalogItem
            ? catalogItem.name
            : `Item ${id}`;

        /*
         * O catálogo pode já trazer
         * "Item 07 — ...".
         * Removemos essa parte para evitar:
         * "Item 07 — Item 07 — ..."
         */
        label = String(label)
          .replace(
            new RegExp(
              `^Item\\s*${Number(id)}\\s*[—-]\\s*`,
              "i"
            ),
            ""
          )
          .trim();

        const currentValue =
          structures[id] == null
            ? ""
            : structures[id];

        return field(
          `structures.${id}`,
          `Item ${id} — ${label}`,
          currentValue,
          "number"
        );

      }
    ).join("");

  /* ======================================================
     ARQUIVOS
     ====================================================== */

  const filesHtml =
    Array.isArray(p.files) &&
    p.files.length

      ? p.files.map(f => {

          const href =
            f.url ||
            f.imageUrl ||
            f.thumbUrl ||
            "";

          return `
            <div class="fieldset">

              <label>
                ${esc(
                  f.category ||
                  "Arquivo"
                )}
              </label>

              ${
                href
                  ? `
                    <a
                      href="${esc(href)}"
                      target="_blank"
                      rel="noopener"
                    >
                      ${esc(
                        f.name ||
                        "Abrir arquivo"
                      )}
                    </a>
                  `
                  : esc(
                      f.name ||
                      "Arquivo"
                    )
              }

            </div>
          `;

        }).join("")

      : `
        <div class="media-empty">
          Nenhum arquivo organizado.
        </div>
      `;

  /* ======================================================
     MONTA AS SEÇÕES
     ====================================================== */

  let sectionsHtml = "";

  /*
   * DADOS GERAIS
   * Aparece somente na auditoria completa.
   */
  if (!focusSector) {
    sectionsHtml += section(
      "geral",
      "Dados gerais",
      isSectorRole ? generalReadonlyFields : generalFields,
      true
    );
  }

  sectionsHtml += section(
    "te",
    "Apoio TE",
    teFields,
    true
  );

  sectionsHtml += section(
    "dispositivos",
    "Dispositivos e Periféricos",
    deviceFields,
    true
  );

  sectionsHtml += section(
    "fabricacao",
    "Fabricação Digital",
    fabricationFields,
    true
  );

  sectionsHtml += section(
    "ti",
    "TI",
    tiFields,
    true
  );

  sectionsHtml += section(
    "av",
    "Audiovisual",
    avFields,
    true
  );

  sectionsHtml += section(
    "manutencao",
    "Manutenção",
    maintenanceFields,
    true
  );

  sectionsHtml += section(
    "comunicacao",
    "Comunicação",
    communicationFields,
    true
  );

  /*
   * ESTRUTURAS:
   *
   * Na auditoria geral:
   * aparece normalmente.
   *
   * Na auditoria de MANUTENÇÃO:
   * também aparece, porque as estruturas
   * fazem parte da demanda desse setor.
   */
  if (!focusSector || focusSector === "manutencao") {

    sectionsHtml += section(
      "estruturas",
      "Estruturas expositivas — Itens 01 a 41",
      structureFields,
      focusSector === "manutencao",
      ["manutencao"]
    );

  }

  /*
   * ARQUIVOS:
   * somente na auditoria geral.
   */
  if (!focusSector) {

    sectionsHtml += section(
      "arquivos",
      "Arquivos enviados — somente consulta",
      filesHtml,
      false
    );

  }

  /* ======================================================
     RETORNO DO EDITOR
     ====================================================== */

  return `
    <div
      class="audit-panel"
      data-audit-editor="${esc(p.id)}"
    >

      <div class="audit-title">
        Modo auditoria —
        ${esc(p.titulo)}
        ${
          focusSector
            ? ` • ${esc(
                SECTOR_LABELS[focusSector] ||
                focusSector
              )}`
            : ""
        }
      </div>

      <div class="audit-grid">

        <div class="audit-original">

          <b>Projeto</b>
          <br>
          ${esc(p.id)}

          <br><br>

          <b>Espaço</b>
          <br>
          ${esc(
            [p.space, p.sala]
              .filter(Boolean)
              .join(" • ") ||
            "Não informado"
          )}

          <br><br>

          <b>Setores solicitados</b>
          <br>
          ${esc(
            Array.isArray(p.sectors) &&
            p.sectors.length
              ? p.sectors.join(", ")
              : "Não informado"
          )}

          ${
            focusSector
              ? `
                <br><br>

                <span class="meta">
                  Nesta área, você está
                  editando os dados de
                  <b>${esc(
                    SECTOR_LABELS[focusSector] ||
                    focusSector
                  )}</b>.

                  ${
                    focusSector === "manutencao"
                      ? `
                        <br><br>
                        As estruturas expositivas
                        aparecem aqui porque fazem
                        parte das demandas de
                        Manutenção.
                      `
                      : ""
                  }
                </span>
              `
              : ""
          }

        </div>

        <div class="audit-fields">

          ${sectionsHtml}

          <div class="fieldset">

            <label>
              Observação da alteração
            </label>

            <textarea
              data-audit-note
              placeholder="Descreva a decisão ou motivo da alteração."
            ></textarea>

          </div>

          <button
            class="save-btn"
            type="button"
            data-save-project-audit
            data-project="${esc(p.id)}"
          >
            Salvar alterações
          </button>

          <span class="audit-saved"></span>

        </div>

      </div>

    </div>
  `;

}

function getAuditValue_(obj, path) {

  return String(path)
    .split(".")
    .reduce(
      (acc, key) =>
        acc == null
          ? undefined
          : acc[key],
      obj
    );

}

function bindAuditSave() {

  document
    .querySelectorAll(
      "[data-save-project-audit]"
    )
    .forEach(btn => {

      btn.addEventListener(
        "click",
        async () => {

          if (!state.audit) {
            return requireAdmin();
          }

          const root =
            btn.closest(
              "[data-audit-editor]"
            );

          const projectId =
            btn.dataset.project;

          const p =
            state.projects.find(
              x => x.id === projectId
            );

          if (!p) return;

          const noteEl =
            root.querySelector(
              "[data-audit-note]"
            );

          const note =
            noteEl
              ? noteEl.value
              : "";

          const edits =
            [
              ...root.querySelectorAll(
                "[data-audit-field]"
              )
            ]
              .map(input => {

                const field =
                  input.dataset.auditField;

                const before =
                  getAuditValue_(
                    p,
                    field
                  );

                return {
                  field,
                  before,
                  value: input.value
                };

              })
              .filter(edit =>

                String(
                  edit.before == null
                    ? ""
                    : edit.before
                ) !== edit.value

              )
              .map(edit => ({
                field: edit.field,
                value: edit.value
              }));

          if (!edits.length) {

            showToast(
              "Nenhuma alteração identificada."
            );

            return;

          }

          if (!CONFIG.API_URL) {

            showToast(
              "Auditoria só grava no Sheets quando a API estiver conectada."
            );

            return;

          }

          try {

            btn.disabled = true;

            btn.textContent =
              "Salvando...";

            await api(
              "saveProjectEdits",
              {
                projectId,
                edits,
                note
              },
              "POST"
            );

            showToast(
              "Alterações gravadas no Sheets"
            );

            await loadData(true);

          } catch (err) {

            console.error(err);

            showToast(
              err.message ||
              "Não foi possível salvar."
            );

          } finally {

            btn.disabled = false;

            btn.textContent =
              "Salvar alterações";

          }

        }
      );

    });

}

async function requireAdmin() {
  if (state.token) { state.audit = true; render(); return true; }
  const password = window.prompt("Modo Auditoria\nDigite a senha administrativa:");
  if (!password) return false;
  if (!CONFIG.API_URL) { showToast("Configure a API para ativar a auditoria real."); return false; }
  try {
    const data = await api("login", { password }, "POST");
    state.token = data.token;
    state.role = data.role || "";

sessionStorage.setItem(
  "mostra_admin_role",
  state.role
);
    sessionStorage.setItem("mostra_admin_token", state.token);
    state.audit = true;
    render();
    showToast(`Acesso liberado: ${data.roleLabel || data.role || "Perfil"}`);
    return true;
  } catch (err) { showToast("Senha inválida ou sessão indisponível."); return false; }
}

function bindChecklist() {
  document.querySelectorAll("[data-check-status]").forEach(cb => {
    cb.addEventListener("change", async e => {
      const pId = e.target.dataset.project;
      const sector = e.target.dataset.sector;
      const status = e.target.checked ? "Concluído" : "Pendente";
      const p = state.projects.find(x => x.id === pId);
      if (!p) return;
      p.checklist = p.checklist || {};
      p.checklist[sector] = { ...(p.checklist[sector] || {}), status, updatedAt: new Date().toISOString() };
      render();
      if (!CONFIG.API_URL) { showToast("Checklist marcado no modo de demonstração."); return; }
      try { await api("updateChecklist", { projectId: pId, sector, status, note: p.checklist[sector].note || "" }, "POST"); showToast("Checklist atualizado"); }
      catch (err) { showToast(err.message || "Não foi possível atualizar o checklist."); }
    });
  });
}

function render() {
  const arr = filtered();
  document.getElementById("countN").textContent = arr.length;
  updateHeader();
  if (state.current === "identificacao") renderIdentificacao(arr);
  else if (state.current === "projeto") renderProjectCards(arr);
  else if (state.current === "gestao") renderGestao(arr);
  else if (SECTOR_LABELS[state.current]) renderSector(arr, state.current);
  document.getElementById("auditBtn").textContent = state.audit ? "Sair da auditoria" : "Modo auditoria";
  document.getElementById("auditBtn").classList.toggle("active", state.audit);
}

function inventoryFromPayload(payload) {
  return Array.isArray(payload) ? payload : [];
}

async function loadDemo() {
  const response = await fetch(CONFIG.SAMPLE_URL, { cache: "no-store" });
  const json = await response.json();
  state.projects = (json.projects || []).map(normalizeProject);
  state.inventory = json.inventory || [];
  state.structureCatalog = json.structureCatalog || [];
}

async function loadData(silent = false) {

  try {

    if (CONFIG.API_URL) {

      const data = await api("getProjects");

      state.projects = (data.projects || []).map(normalizeProject);

      state.inventory = inventoryFromPayload(data.inventory);

      state.structureCatalog = Array.isArray(data.structureCatalog)
        ? data.structureCatalog
        : [];

      document.getElementById("siteStatus").textContent =
        "● Dados reais — Google Sheets";

    } else if (CONFIG.DEMO_MODE) {

      await loadDemo();

      document.getElementById("siteStatus").textContent =
        "● Modo demonstração — respostas de teste";

    } else {

      state.projects = [];

      document.getElementById("siteStatus").textContent =
        "● API ainda não configurada";

    }

    updateFilters();

    state.lastDataHash = JSON.stringify(state.projects);

    render();

  } catch (err) {

    console.error(err);

    if (!silent) {
      showToast(
        "Não foi possível atualizar os dados. Mantendo os dados atuais."
      );
    }

    const status = document.getElementById("siteStatus");

    if (status) {
      status.textContent = state.projects.length
        ? "● Dados reais — atualização temporariamente indisponível"
        : "● API indisponível";
    }

    // Mantém os dados atuais na tela.
    render();

  }

}

async function refreshSilently() {
  if (!CONFIG.API_URL) return;
  try {
    const data = await api("getProjects");
    const next = (data.projects || []).map(normalizeProject);
    const hash = JSON.stringify(next);
    if (hash !== state.lastDataHash) {
      state.projects = next;
      state.inventory = inventoryFromPayload(data.inventory);
      state.structureCatalog = Array.isArray(data.structureCatalog) ? data.structureCatalog : state.structureCatalog;
      state.lastDataHash = hash;
      updateFilters();
      render();
    }
  } catch (err) { console.warn("Atualização automática falhou", err); }
}

function gerarChecklistGeral(sector, arr) {
  const projetos = arr.filter(p => projectHasSector(p, sector));
  const sectorLabel = SECTOR_LABELS[sector] || sector;

  const cards = projetos.map((p, index) => {
    const status = p.checklist?.[sector]?.status || "Pendente";
    const note = p.checklist?.[sector]?.note || "";

    const statusClass =
      status === "Concluído"
        ? "done"
        : status === "Em andamento"
          ? "progress"
          : "pending";

    const statusIcon =
      status === "Concluído"
        ? "☑"
        : status === "Em andamento"
          ? "◐"
          : "☐";

    const space = [p.space, p.sala]
      .filter(Boolean)
      .join(" • ") || "Não informado";

    const demand = summarizeSectorCompleto(p, sector);

    return `
      <section class="project-card">

        <div class="project-header">
          <div class="project-number">
            ${String(index + 1).padStart(2, "0")}
          </div>

          <div class="project-title">
            ${esc(p.titulo)}
          </div>

          <div class="status ${statusClass}">
            <span>${statusIcon}</span>
            <span>${esc(status)}</span>
          </div>
        </div>

        <div class="project-body">

          <div class="info-grid">

            <div class="info-card">
              <div class="label">Segmento</div>
              <div class="value">
                ${esc(labelSegmento(p.segmento))}
              </div>
            </div>

            <div class="info-card">
              <div class="label">Série</div>
              <div class="value">
                ${esc(p.serie || "—")}
              </div>
            </div>

            <div class="info-card">
              <div class="label">Disciplina</div>
              <div class="value">
                ${esc(p.disciplina || "—")}
              </div>
            </div>

            <div class="info-card">
              <div class="label">Professor</div>
              <div class="value">
                ${esc(p.prof || "—")}
              </div>
            </div>

            <div class="info-card space-card">
              <div class="label">Espaço</div>
              <div class="value">
                📍 ${esc(space)}
              </div>
            </div>

          </div>

          <div class="demand-section">

            <div class="section-title">
              Demanda — ${esc(sectorLabel)}
            </div>

            <div class="demand-box">
              ${esc(demand || "Não informado")}
            </div>

          </div>

          <div class="note-section">

            <div class="section-title">
              Observação
            </div>

            <div class="note-box">
              ${
                note
                  ? esc(note)
                  : "____________________________________________"
              }
            </div>

          </div>
${
  sector === "manutencao"
    ? croquiPdfHtml(p)
    : ""
}
        </div>
      </section>
    `;
  }).join("");

  const w = window.open("", "_blank");
  if (!w) return;

  w.document.write(`
    <!DOCTYPE html>

    <html lang="pt-BR">

    <head>

      <meta charset="utf-8">

      <title>
        Checklist — ${esc(sectorLabel)}
      </title>

      <style>

        @page {
          size: A4;
          margin: 9mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: Arial, Helvetica, sans-serif;
          color: #2f2b2d;
          background: #fff;
        }

        .page-header {
          border-bottom: 3px solid #8c1730;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
        }

        h1 {
          margin: 0;
          color: #6e1024;
          font-size: 19px;
          line-height: 1.2;
        }

        .subtitle {
          margin-top: 4px;
          color: #6a6265;
          font-size: 9px;
        }

        .total {
          color: #8c1730;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .project-card {
          border: 1px solid #e3d7db;
          border-radius: 10px;
          overflow: visible;
          margin-bottom: 12px;
          background: #fff;

          break-inside: auto;
          page-break-inside: auto;
        }

        .project-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 11px;
          background: #8c1730;
          color: #fff;
          border-radius: 9px 9px 0 0;
        }

        .project-number {
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          border-radius: 50%;
          background: rgba(255,255,255,.18);

          display: flex;
          align-items: center;
          justify-content: center;

          font-size: 9px;
          font-weight: 700;
        }

       .project-title {
  flex: 1;
  font-size: 22px;
  line-height: 1.3;
  font-weight: 700;
}

        .status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 7px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 700;
          white-space: nowrap;
        }

        .status.pending {
          background: rgba(255,255,255,.18);
          color: #fff;
        }

        .status.progress {
          background: #f7e6b5;
          color: #654b12;
        }

        .status.done {
          background: #dceee4;
          color: #28563e;
        }

        .project-body {
          padding: 9px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          margin-bottom: 9px;
        }

        .info-card {
          border: 1px solid #eadde1;
          border-radius: 7px;
          padding: 7px;
          min-height: 43px;
          background: #fff;

          break-inside: avoid;
          page-break-inside: avoid;
        }

        .space-card {
          grid-column: span 2;
        }

        .label,
.section-title {
  color: #8c1730;
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 6px;
}

.value {
  color: #222;
  font-size: 25px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

        .demand-section {
          margin-top: 3px;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .section-title {
          margin-bottom: 4px;
        }

        ..demand-box {
  padding: 10px;
  border: 1px solid #eadde1;
  border-left: 3px solid #8c1730;
  border-radius: 7px;
  background: #faf5f6;

  color: #2f2b2d;
  font-size: 15px;
  line-height: 1.4;
}

       .note-box {
  min-height: 40px;
  padding: 10px;

  border: 1px solid #e3d7db;
  border-radius: 7px;
  background: #fff;

  color: #554d50;
  font-size: 14px;
  line-height: 1.4;
}

        @media print {

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .project-card,
          .project-header,
          .info-card,
          .demand-section,
          .demand-box,
          .note-section,
          .note-box {
            break-inside: avoid;
            page-break-inside: avoid;
          }

        }

      </style>

    </head>

    <body>

      <header class="page-header">

        <div class="header-top">

          <div>

            <h1>
              Mostra Cultural 2026 — Checklist
            </h1>

            <div class="subtitle">
              Setor: ${esc(sectorLabel)}
            </div>

          </div>

          <div class="total">
            ${projetos.length} projeto(s)
          </div>

        </div>

      </header>

      ${cards}

      <div class="footer">
        Mostra Cultural 2026 • ${esc(sectorLabel)}
      </div>

      <script>
        window.onload = () => {
          setTimeout(() => window.print(), 300);
        };
      <\/script>

    </body>

    </html>
  `);

  w.document.close();
}

function gerarPdfVisaoGeral() {
  const arr = filtered();

  const sectorConfig = [
    ["te", "TE"],
    ["dispositivos", "Dispositivos"],
    ["fabricacao", "Fabricação Digital"],
    ["ti", "TI"],
    ["av", "Audiovisual"],
    ["manutencao", "Manutenção"],
    ["comunicacao", "Comunicação"]
  ];

  const sections = arr.map((p, index) => {

    const demands = sectorConfig
      .map(([key, label]) => {
        const value = summarizeSectorCompleto(p, key);
        if (!value || value === "Não solicitado") return "";
        return `
          <div class="demand-card">
            <div class="demand-title">${esc(label)}</div>
            <div class="demand-text">${esc(value)}</div>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");

    return `
      <section class="project">

        <div class="project-header">
          <div class="project-number">${String(index + 1).padStart(2, "0")}</div>
          <div class="project-title">${esc(p.titulo)}</div>
        </div>

        <div class="project-body">

          <div class="idgrid">

            <div class="info-card">
              <span class="label">Segmento</span>
              <span class="value">${esc(labelSegmento(p.segmento))}</span>
            </div>

            <div class="info-card">
              <span class="label">Série</span>
              <span class="value">${esc(p.serie || "—")}</span>
            </div>

            <div class="info-card">
              <span class="label">Disciplina</span>
              <span class="value">${esc(p.disciplina || "—")}</span>
            </div>

            <div class="info-card">
              <span class="label">Professor</span>
              <span class="value">${esc(p.prof || "—")}</span>
            </div>

            <div class="info-card">
              <span class="label">Produto final</span>
              <span class="value">${esc(p.produto || "—")}</span>
            </div>

            <div class="info-card">
              <span class="label">Espaço</span>
              <span class="value">
                ${esc([p.space, p.sala].filter(Boolean).join(" • ") || "—")}
              </span>
            </div>

          </div>

          <div class="description-block">

            <div class="description-item">
              <div class="section-label">Justificativa</div>
              <div class="section-text">
                ${esc(p.justificativa || "Não informada")}
              </div>
            </div>

            <div class="description-item">
              <div class="section-label">Descrição</div>
              <div class="section-text">
                ${esc(p.desc || "Não informada")}
              </div>
            </div>

          </div>

          ${
            demands
              ? `
                <div class="demands-section">
                  <div class="section-label">Demandas de apoio</div>

                  <div class="demands-grid">
                    ${demands}
                  </div>
                </div>
              `
              : ""
          }

        </div>
      </section>
    `;
  }).join("");

  const w = window.open("", "_blank");
  if (!w) return;

  w.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">

    <head>
      <meta charset="utf-8">

      <title>
        Mostra Cultural 2026 — Visão Geral
      </title>

      <style>

        @page {
          size: A4;
          margin: 9mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: Arial, Helvetica, sans-serif;
          background: #ffffff;
          color: #222;
        }

        .page-header {
          border-bottom: 3px solid #8c1730;
          padding-bottom: 10px;
          margin-bottom: 14px;
        }

        .brand {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
        }

        .title {
          color: #6e1024;
          font-size: 19px;
          font-weight: 700;
          margin: 0;
        }

        .subtitle {
          color: #6a6a6a;
          font-size: 9px;
          margin-top: 4px;
        }

        .total {
          color: #8c1730;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .project {
  
        border: 1px solid #e3d7db;
  
        border-radius: 10px;
  
        overflow: visible;
  
        margin-bottom: 12px;
  
        background: #fff;

  break-inside: auto;
  page-break-inside: auto;
}

        .project-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 11px;
          background: #8c1730;
          color: #fff;
        }

        .project-number {
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          border-radius: 50%;
          background: rgba(255,255,255,.18);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: 700;
        }

      .project-title {
  font-size: 17px;
  line-height: 1.3;
  font-weight: 700;
}

        .project-body {
          padding: 9px;
        }

        .idgrid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-bottom: 9px;
        }

        .info-card {
          border: 1px solid #eadde1;
          border-radius: 7px;
          padding: 7px;
          min-height: 42px;
          background: #fff;
        }

      .label,
.section-label {
  display: block;
  color: #8c1730;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 4px;
}

.value {
  display: block;
  color: #222;
  font-size: 16px;
  line-height: 1.35;
  font-weight: 400;
  overflow-wrap: anywhere;
}

        .description-block {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
          margin-bottom: 9px;
        }

       .description-item {
  background: #faf5f6;
  border-left: 3px solid #8c1730;
  border-radius: 6px;
  padding: 8px;

  break-inside: avoid;
  page-break-inside: avoid;
}

        .section-text {
  color: #222;
  font-size: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

        .demands-section {
          border-top: 1px solid #eadde1;
          padding-top: 8px;
        }

        .demands-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.project-header,
.info-card,
.demands-section,
.demands-grid {
  break-inside: avoid;
  page-break-inside: avoid;
}

.demand-card {
  border: 1px solid #eadde1;
  border-radius: 7px;
  padding: 7px;
  background: #fff;

  break-inside: avoid;
  page-break-inside: avoid;
}

        .demand-card {
  border: 1px solid #eadde1;
  border-radius: 7px;
  padding: 7px;
  background: #fff;

  break-inside: avoid;
  page-break-inside: avoid;
}
  

        .demand-title {
  color: #6e1024;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 4px;
}

.demand-text {
  color: #333;
  font-size: 15px;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

        .footer {
          margin-top: 10px;
          padding-top: 6px;
          border-top: 1px solid #ddd;
          text-align: center;
          color: #777;
          font-size: 7px;
        }

        @media print {

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .project {
            break-inside: avoid;
            page-break-inside: avoid;
          }

        }

      </style>
    </head>

    <body>

      <header class="page-header">

        <div class="brand">

          <div>
            <div class="title">
              Mostra Cultural 2026
            </div>

            <div class="subtitle">
              Visão Geral dos Projetos • Colégio Franciscano Pio XII
            </div>
          </div>

          <div class="total">
            ${arr.length} projeto(s)
          </div>

        </div>

      </header>

      ${sections}

      <div class="footer">
        Mostra Cultural 2026 • Visão Geral
      </div>

      <script>
        window.onload = () => {
          setTimeout(() => window.print(), 300);
        };
      <\/script>

    </body>

    </html>
  `);

  w.document.close();
}
function setupEvents() {
  ["search","segmento","serie","disciplina"].forEach(id => document.getElementById(id).addEventListener(id === "search" ? "input" : "change", () => { state.page = 1; render(); }));
  document.getElementById("clear").addEventListener("click", () => { document.getElementById("search").value = ""; ["segmento","serie","disciplina"].forEach(id => document.getElementById(id).value = ""); state.page = 1; state.subfilter = ""; render(); });
  document.getElementById("sectorSubfilter").addEventListener("change", e => { state.subfilter = e.target.value; state.page = 1; render(); });
  document.getElementById("auditBtn").addEventListener("click", async () => { if (state.audit) { state.audit = false; render(); showToast("Modo auditoria encerrado"); } else await requireAdmin(); });
  document.getElementById("identificacaoPdfBtn").addEventListener("click", gerarPdfVisaoGeral);
  document.getElementById("sectionChecklistBtn").addEventListener("click", () => gerarChecklistGeral(state.current, filtered()));
  document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
  document.getElementById("lightboxPrev").addEventListener("click", () => { state.lightbox.index = (state.lightbox.index - 1 + state.lightbox.images.length) % state.lightbox.images.length; showLightboxImage(); });
  document.getElementById("lightboxNext").addEventListener("click", () => { state.lightbox.index = (state.lightbox.index + 1) % state.lightbox.images.length; showLightboxImage(); });
  document.getElementById("lightboxPrint").addEventListener("click", () => printImageA4(state.lightbox.images[state.lightbox.index]));
  document.getElementById("lightbox").addEventListener("click", e => { if (e.target.id === "lightbox") closeLightbox(); });
}

async function boot() {
  setupEvents();
  buildNav();
  await loadData();
  if (CONFIG.API_URL) setInterval(refreshSilently, CONFIG.POLLING_MS);
}

boot();

async function diagnosticoTokenFrontend() {
  try {
    console.log("Token atual:", sessionStorage.getItem("mostra_admin_token"));

    const resultado = await api(
      "diagnosticoToken",
      {},
      "POST"
    );

    console.log("Resultado do diagnóstico:", resultado);

  } catch (err) {
    console.error("Erro no diagnóstico:", err);
  }
}

function diagnosticarSegmentos() {
  const valores = [...new Set(
    state.projects
      .map(p => String(p.segmento || "").trim())
      .filter(Boolean)
  )].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  console.table(valores);
  console.log("Total de projetos:", state.projects.length);
}