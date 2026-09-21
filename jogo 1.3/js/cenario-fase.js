// ======================================================
// cenario-fase.js — Fundo e ambientação das fases (um tema por fase)
//
// Tudo que é estático é desenhado UMA vez em canvas fora da tela
// (nebulosas, estrelas, planetas, relevo, chão). No loop só copiamos
// fatias desses canvas com deslocamentos diferentes — é isso que dá
// o parallax e mantém o custo por frame baixo.
// ======================================================

// ---------- Temas de cenário ----------
// Cada fase escolhe um tema (campo "tema" em js/fases.js). Trocar de tema
// muda só cores e sementes: a estrutura das camadas é a mesma.
//
//   campo : Fase 1 — roxo/azul, o visual original do jogo.
//   arena : Fase 2 — vermelho/brasa, com colunas ao fundo (arena do Mecha).
//
// Quer uma terceira fase com outro clima? Copie um tema, mude as cores e
// troque o "tema" da fase em fases.js. Nada mais precisa mudar.
const TEMAS_DE_CENARIO = {
    campo: {
        sementeExtra: 0,
        ceuTopo: "#03010a", ceuMeio: "#090419", ceuBaixo: "#120a26",
        nebulosas: ["rgba(123, 63, 228, 0.20)", "rgba(196, 65, 168, 0.14)", "rgba(47, 107, 212, 0.15)"],
        tonsDeEstrela: ["#ffffff", "#dbe7ff", "#ffe6c2", "#c9d8ff", "#ffd7f2"],
        estrelaPiscando: { centro: "255,255,255", meio: "190,210,255", borda: "160,107,255" },
        planetas: [
            { x: 380, y: 176, raio: 38, cor: "#8c4d34", corEscura: "#1e0b04", anel: false },
            { x: 1060, y: 150, raio: 54, cor: "#35588f", corEscura: "#06101f", anel: true },
            { x: 1820, y: 196, raio: 29, cor: "#653e8c", corEscura: "#150926", anel: false },
            { x: 2520, y: 162, raio: 43, cor: "#8c7134", corEscura: "#1f1604", anel: false },
            { x: 3140, y: 190, raio: 26, cor: "#348c72", corEscura: "#041a16", anel: false },
        ],
        relevoLonge: "#241549",
        relevoPerto: "#0a0518",
        cristaDoRelevo: "rgba(180,140,255,0.45)",
        chaoTopo: "#241645", chaoMeio: "#150b2c", chaoBase: "#060210",
        labio: "170,125,240",
        cristal: { halo: "180,120,255", pontaClara: "#e3cdff", pontaEscura: "#8a67c9", base: "#4a2a86" },
        linhaDoChao: "#a06bff",
        linhaDoChaoRgb: "160,107,255",
        poeira: "#cbb8ff",
        colunas: null,
    },

    arena: {
        sementeExtra: 4242,
        ceuTopo: "#0b0204", ceuMeio: "#1d060a", ceuBaixo: "#3a1210",
        nebulosas: ["rgba(255, 70, 40, 0.20)", "rgba(210, 25, 95, 0.16)", "rgba(255, 150, 40, 0.12)"],
        tonsDeEstrela: ["#fff2e6", "#ffd9b8", "#ffb48a", "#ffe6c2", "#ffc9c9"],
        estrelaPiscando: { centro: "255,240,220", meio: "255,190,150", borda: "255,100,60" },
        planetas: [
            // Lua vermelha enorme ao fundo: dá o clima de "arena do chefe".
            { x: 640, y: 170, raio: 96, cor: "#b03a20", corEscura: "#1c0402", anel: false, luz: "#ffd2b0", haloRgb: "255,120,70" },
            { x: 250, y: 118, raio: 26, cor: "#8c6a3a", corEscura: "#1f1204", anel: false, luz: "#ffe2bd", haloRgb: "255,190,120" },
            { x: 1120, y: 214, raio: 32, cor: "#7a2a4a", corEscura: "#1a0612", anel: false, luz: "#ffc9d6", haloRgb: "255,120,160" },
        ],
        relevoLonge: "#42150f",
        relevoPerto: "#160607",
        cristaDoRelevo: "rgba(255,150,100,0.45)",
        chaoTopo: "#42201a", chaoMeio: "#260e0c", chaoBase: "#0b0303",
        labio: "255,140,90",
        cristal: { halo: "255,110,60", pontaClara: "#ffd6bd", pontaEscura: "#d0703f", base: "#7d2a15" },
        linhaDoChao: "#ff7a45",
        linhaDoChaoRgb: "255,110,60",
        poeira: "#ffb891",
        colunas: { corpo: "#1a0808", topo: "#341210", brilho: "255,100,50" },
    },
};

// Cada camada tem seu fator de parallax: 0 = fixo no fundo, 1 = anda junto com o mundo.
const CAMADAS = {
    nebulosa: 0.08,
    estrelasLonge: 0.18,
    estrelasMeio: 0.34,
    planetas: 0.26,
    relevoLonge: 0.45,
    colunas: 0.56,
    relevoPerto: 0.68,
    poeiraDaFrente: 1.25,
};

function criarCenarioDaFase(larguraDaTela, alturaDaTela, larguraDoNivel, alturaDoChao, tema) {
    const cenario = {
        tema: tema || TEMAS_DE_CENARIO.campo,
        larguraDaTela,
        alturaDaTela,
        larguraDoNivel,
        alturaDoChao,
        tempo: 0,
        camadas: {},
        estrelasBrilhantes: [],
        poeira: [],
    };

    prepararCamadas(cenario);
    prepararEstrelasBrilhantes(cenario);
    prepararPoeira(cenario);

    return cenario;
}

// ---------- Aleatório determinístico ----------
// Semente fixa: o cenário fica igual em toda partida, o que evita
// "estrelas diferentes a cada reinício" e facilita comparar builds.
function criarSorteio(semente) {
    let estado = semente >>> 0;
    return function sortear() {
        estado = (estado * 1664525 + 1013904223) >>> 0;
        return estado / 4294967296;
    };
}

function criarTelaFora(largura, altura) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(largura));
    canvas.height = Math.max(1, Math.ceil(altura));
    return { canvas, contexto: canvas.getContext("2d") };
}

// Largura que a camada precisa ter para cobrir o nível inteiro no seu parallax.
function larguraDaCamada(cenario, fator) {
    return Math.ceil(cenario.larguraDoNivel * fator) + cenario.larguraDaTela + 4;
}

// ---------- Montagem das camadas ----------

function prepararCamadas(cenario) {
    const tema = cenario.tema;
    const extra = tema.sementeExtra;

    cenario.camadas.nebulosa = desenharNebulosa(cenario);
    cenario.camadas.estrelasLonge = desenharCampoDeEstrelas(cenario, CAMADAS.estrelasLonge, 900, 0.45, 1.3);
    cenario.camadas.estrelasMeio = desenharCampoDeEstrelas(cenario, CAMADAS.estrelasMeio, 420, 0.8, 2.1);
    cenario.camadas.planetas = desenharPlanetas(cenario);
    cenario.camadas.relevoLonge = desenharRelevo(cenario, CAMADAS.relevoLonge, tema.relevoLonge, 118, 7719 + extra);
    if (tema.colunas) cenario.camadas.colunas = desenharColunas(cenario);
    cenario.camadas.relevoPerto = desenharRelevo(cenario, CAMADAS.relevoPerto, tema.relevoPerto, 74, 31337 + extra);
    cenario.camadas.chao = desenharChao(cenario);
}

function desenharNebulosa(cenario) {
    const largura = larguraDaCamada(cenario, CAMADAS.nebulosa);
    const { canvas, contexto } = criarTelaFora(largura, cenario.alturaDaTela);
    const sortear = criarSorteio(20260918 + cenario.tema.sementeExtra);
    const cores = cenario.tema.nebulosas;

    for (let i = 0; i < 11; i++) {
        const x = sortear() * largura;
        const y = sortear() * cenario.alturaDoChao * 0.85;
        const raio = 110 + sortear() * 180;
        const cor = cores[Math.floor(sortear() * cores.length)];

        const brilho = contexto.createRadialGradient(x, y, 0, x, y, raio);
        brilho.addColorStop(0, cor);
        brilho.addColorStop(0.5, cor.replace(/[\d.]+\)$/, "0.05)"));
        brilho.addColorStop(1, "rgba(0,0,0,0)");

        contexto.fillStyle = brilho;
        contexto.beginPath();
        contexto.ellipse(x, y, raio, raio * (0.5 + sortear() * 0.4), sortear() * Math.PI, 0, Math.PI * 2);
        contexto.fill();
    }

    return canvas;
}

function desenharCampoDeEstrelas(cenario, fator, quantidade, tamanhoMinimo, tamanhoMaximo) {
    const largura = larguraDaCamada(cenario, fator);
    const { canvas, contexto } = criarTelaFora(largura, cenario.alturaDaTela);
    const sortear = criarSorteio(Math.floor(fator * 100000) + 7 + cenario.tema.sementeExtra);
    const tons = cenario.tema.tonsDeEstrela;

    // "quantidade" foi calibrada para o nível antigo (3600px). Níveis menores
    // recebem menos estrelas para a densidade do céu continuar a mesma.
    const larguraDeReferencia = 3600 * fator + cenario.larguraDaTela + 4;
    const total = Math.round(quantidade * (largura / larguraDeReferencia));

    for (let i = 0; i < total; i++) {
        const x = sortear() * largura;
        const y = sortear() * (cenario.alturaDoChao - 12);
        const tamanho = tamanhoMinimo + sortear() * (tamanhoMaximo - tamanhoMinimo);

        contexto.globalAlpha = 0.25 + sortear() * 0.7;
        contexto.fillStyle = tons[Math.floor(sortear() * tons.length)];
        contexto.beginPath();
        contexto.arc(x, y, tamanho, 0, Math.PI * 2);
        contexto.fill();
    }

    contexto.globalAlpha = 1;
    return canvas;
}

function desenharPlanetas(cenario) {
    const largura = larguraDaCamada(cenario, CAMADAS.planetas);
    const { canvas, contexto } = criarTelaFora(largura, cenario.alturaDaTela);

    const planetas = cenario.tema.planetas;

    planetas.forEach((planeta) => {
        if (planeta.x > largura + 120) return;

        if (planeta.anel) desenharAnelDoPlaneta(contexto, planeta, true);

        // Halo de atmosfera
        const halo = contexto.createRadialGradient(
            planeta.x, planeta.y, planeta.raio * 0.9,
            planeta.x, planeta.y, planeta.raio * 1.5
        );
        const haloRgb = planeta.haloRgb || "160,190,255";
        halo.addColorStop(0, "rgba(" + haloRgb + "," + (planeta.haloRgb ? 0.16 : 0.07) + ")");
        halo.addColorStop(1, "rgba(" + haloRgb + ",0)");
        contexto.fillStyle = halo;
        contexto.beginPath();
        contexto.arc(planeta.x, planeta.y, planeta.raio * 1.5, 0, Math.PI * 2);
        contexto.fill();

        // Corpo, com a luz vindo do alto à esquerda
        const corpo = contexto.createRadialGradient(
            planeta.x - planeta.raio * 0.45, planeta.y - planeta.raio * 0.45, planeta.raio * 0.1,
            planeta.x, planeta.y, planeta.raio
        );
        corpo.addColorStop(0, planeta.luz || "#d7e2ff");
        corpo.addColorStop(0.3, planeta.cor);
        corpo.addColorStop(1, planeta.corEscura);
        contexto.fillStyle = corpo;
        contexto.beginPath();
        contexto.arc(planeta.x, planeta.y, planeta.raio, 0, Math.PI * 2);
        contexto.fill();

        desenharCrateras(contexto, planeta);

        if (planeta.anel) desenharAnelDoPlaneta(contexto, planeta, false);
    });

    return canvas;
}

function desenharCrateras(contexto, planeta) {
    const sortear = criarSorteio(Math.floor(planeta.x * 31 + planeta.raio));

    contexto.save();
    contexto.beginPath();
    contexto.arc(planeta.x, planeta.y, planeta.raio, 0, Math.PI * 2);
    contexto.clip();

    for (let i = 0; i < 7; i++) {
        const angulo = sortear() * Math.PI * 2;
        const distancia = sortear() * planeta.raio * 0.8;
        const raio = planeta.raio * (0.08 + sortear() * 0.18);

        contexto.globalAlpha = 0.16;
        contexto.fillStyle = planeta.corEscura;
        contexto.beginPath();
        contexto.arc(
            planeta.x + Math.cos(angulo) * distancia,
            planeta.y + Math.sin(angulo) * distancia,
            raio, 0, Math.PI * 2
        );
        contexto.fill();
    }

    contexto.restore();
}

function desenharAnelDoPlaneta(contexto, planeta, atras) {
    contexto.save();
    contexto.translate(planeta.x, planeta.y);
    contexto.rotate(-0.38);
    contexto.scale(1, 0.26);

    contexto.beginPath();
    contexto.arc(0, 0, planeta.raio * 1.85, atras ? Math.PI : 0, atras ? Math.PI * 2 : Math.PI);
    contexto.lineWidth = planeta.raio * 0.34;
    contexto.strokeStyle = atras ? "rgba(150,175,225,0.16)" : "rgba(175,200,245,0.30)";
    contexto.stroke();

    contexto.restore();
}

// Escurece uma cor #rrggbb pela metade, para o pé da montanha sumir no escuro.
function escurecer(cor) {
    const valor = parseInt(cor.slice(1), 16);
    const r = Math.floor(((valor >> 16) & 255) * 0.35);
    const g = Math.floor(((valor >> 8) & 255) * 0.35);
    const b = Math.floor((valor & 255) * 0.35);
    return "rgb(" + r + "," + g + "," + b + ")";
}

// Silhuetas de relevo no horizonte, feitas com ruído simples somado.
function desenharRelevo(cenario, fator, cor, alturaMaxima, semente) {
    const largura = larguraDaCamada(cenario, fator);
    const { canvas, contexto } = criarTelaFora(largura, cenario.alturaDaTela);
    const sortear = criarSorteio(semente);
    const base = cenario.alturaDoChao;

    const picos = [];
    for (let i = 0; i < 40; i++) picos.push(sortear());

    function alturaEm(x) {
        const escala = largura / 26;
        const indice = x / escala;
        const i0 = Math.floor(indice) % picos.length;
        const i1 = (i0 + 1) % picos.length;
        const t = indice - Math.floor(indice);
        const suave = t * t * (3 - 2 * t);
        const valor = picos[i0] * (1 - suave) + picos[i1] * suave;
        const detalhe = Math.sin(x * 0.013 + semente) * 0.12 + Math.sin(x * 0.051) * 0.05;
        return base - (valor * 0.75 + 0.25 + detalhe) * alturaMaxima;
    }

    contexto.beginPath();
    contexto.moveTo(0, base);
    for (let x = 0; x <= largura; x += 4) contexto.lineTo(x, alturaEm(x));
    contexto.lineTo(largura, base);
    contexto.closePath();

    const preenchimento = contexto.createLinearGradient(0, base - alturaMaxima, 0, base);
    preenchimento.addColorStop(0, cor);
    preenchimento.addColorStop(1, escurecer(cor));
    contexto.fillStyle = preenchimento;
    contexto.fill();

    // Fio de luz na crista, como se o sol batesse de raspão
    contexto.beginPath();
    for (let x = 0; x <= largura; x += 4) {
        const y = alturaEm(x);
        if (x === 0) contexto.moveTo(x, y); else contexto.lineTo(x, y);
    }
    contexto.strokeStyle = cenario.tema.cristaDoRelevo;
    contexto.lineWidth = 1.5;
    contexto.stroke();

    return canvas;
}

// Colunas/pilares ao fundo (só nos temas que definem "colunas"): dão a
// sensação de estar dentro de uma construção antiga, como uma arena.
function desenharColunas(cenario) {
    const cor = cenario.tema.colunas;
    const largura = larguraDaCamada(cenario, CAMADAS.colunas);
    const { canvas, contexto } = criarTelaFora(largura, cenario.alturaDaTela);
    const sortear = criarSorteio(4711 + cenario.tema.sementeExtra);
    const base = cenario.alturaDoChao;

    let x = 50 + sortear() * 120;
    while (x < largura) {
        const larguraDaColuna = 46 + sortear() * 32;
        const altura = 190 + sortear() * 160;
        const topo = base - altura;
        const centro = x + larguraDaColuna / 2;

        // Brilho de brasa no alto da coluna
        const halo = contexto.createRadialGradient(centro, topo - 6, 2, centro, topo - 6, 90);
        halo.addColorStop(0, "rgba(" + cor.brilho + ",0.32)");
        halo.addColorStop(1, "rgba(" + cor.brilho + ",0)");
        contexto.fillStyle = halo;
        contexto.fillRect(centro - 90, topo - 96, 180, 180);

        // Corpo
        const corpo = contexto.createLinearGradient(0, topo, 0, base);
        corpo.addColorStop(0, cor.topo);
        corpo.addColorStop(1, cor.corpo);
        contexto.fillStyle = corpo;
        contexto.fillRect(x, topo, larguraDaColuna, altura);
        contexto.fillRect(x - 9, topo - 12, larguraDaColuna + 18, 14);   // capitel
        contexto.fillRect(x - 5, base - 16, larguraDaColuna + 10, 16);   // base

        // Fenda luminosa e aresta iluminada
        contexto.fillStyle = "rgba(" + cor.brilho + ",0.5)";
        contexto.fillRect(centro - 1, topo + 16, 2, altura * (0.4 + sortear() * 0.3));
        contexto.fillStyle = "rgba(" + cor.brilho + ",0.16)";
        contexto.fillRect(x, topo, 2, altura);

        x += 250 + sortear() * 230;
    }

    return canvas;
}

// O chão é desenhado num canvas com MARGEM acima da superfície, para os
// cristais poderem crescer para cima sem serem cortados.
const MARGEM_ACIMA_DO_CHAO = 44;

function desenharChao(cenario) {
    const largura = larguraDaCamada(cenario, 1);
    const alturaDoBloco = cenario.alturaDaTela - cenario.alturaDoChao;
    const superficie = MARGEM_ACIMA_DO_CHAO;
    const { canvas, contexto } = criarTelaFora(largura, superficie + alturaDoBloco + 20);
    const sortear = criarSorteio(99173 + cenario.tema.sementeExtra);
    const tema = cenario.tema;

    // Cristais que ficam ATRÁS do bloco de rocha
    desenharCristais(contexto, largura, superficie, sortear, 132, 0.55, tema);

    // Bloco de rocha
    const corpo = contexto.createLinearGradient(0, superficie, 0, superficie + alturaDoBloco);
    corpo.addColorStop(0, tema.chaoTopo);
    corpo.addColorStop(0.45, tema.chaoMeio);
    corpo.addColorStop(1, tema.chaoBase);
    contexto.fillStyle = corpo;
    contexto.fillRect(0, superficie, largura, alturaDoBloco + 20);

    // Estratos horizontais
    for (let i = 1; i <= 3; i++) {
        const y = superficie + (alturaDoBloco * i) / 3.6;
        contexto.fillStyle = "rgba(0,0,0,0.22)";
        contexto.fillRect(0, y, largura, 3);
        contexto.fillStyle = "rgba(255,255,255,0.03)";
        contexto.fillRect(0, y + 3, largura, 2);
    }

    // Fendas verticais
    for (let x = 0; x < largura; x += 46) {
        const desvio = sortear() * 8 - 4;
        contexto.fillStyle = sortear() > 0.5 ? "rgba(255,255,255,0.028)" : "rgba(0,0,0,0.16)";
        contexto.fillRect(x + desvio, superficie, 44, alturaDoBloco);

        contexto.strokeStyle = "rgba(0,0,0,0.32)";
        contexto.lineWidth = 1;
        contexto.beginPath();
        contexto.moveTo(x + desvio, superficie);
        contexto.lineTo(x + desvio + sortear() * 6 - 3, superficie + alturaDoBloco + 20);
        contexto.stroke();
    }

    // Pedrinhas soltas
    for (let x = 0; x < largura; x += 34) {
        const raio = 1.4 + sortear() * 2.6;
        contexto.fillStyle = "rgba(0,0,0,0.28)";
        contexto.beginPath();
        contexto.ellipse(
            x + sortear() * 30,
            superficie + 8 + sortear() * (alturaDoBloco - 12),
            raio, raio * 0.6, 0, 0, Math.PI * 2
        );
        contexto.fill();
    }

    // Lábio iluminado logo abaixo da superfície
    const labio = contexto.createLinearGradient(0, superficie, 0, superficie + 10);
    labio.addColorStop(0, "rgba(" + tema.labio + ",0.42)");
    labio.addColorStop(1, "rgba(" + tema.labio + ",0)");
    contexto.fillStyle = labio;
    contexto.fillRect(0, superficie, largura, 10);

    // Cristais da frente, menores e mais brilhantes
    desenharCristais(contexto, largura, superficie, sortear, 104, 1, tema);

    canvas.margemAcima = superficie;
    return canvas;
}

function desenharCristais(contexto, largura, superficie, sortear, espacamento, brilho, tema) {
    const cristais = tema.cristal;

    let x = 12;
    while (x < largura) {
        const px = x + sortear() * (espacamento * 0.55);
        x += espacamento * (0.55 + sortear() * 0.95);
        const altura = (9 + sortear() * 24) * (0.7 + brilho * 0.4);
        const meia = 2.5 + sortear() * 4.5;
        const topo = superficie - altura;

        const halo = contexto.createRadialGradient(px, superficie - altura * 0.4, 1, px, superficie - altura * 0.4, altura * 1.8);
        halo.addColorStop(0, "rgba(" + cristais.halo + "," + (0.26 * brilho) + ")");
        halo.addColorStop(1, "rgba(" + cristais.halo + ",0)");
        contexto.fillStyle = halo;
        contexto.fillRect(px - altura * 1.8, topo - altura, altura * 3.6, altura * 3);

        const cristal = contexto.createLinearGradient(px, topo, px, superficie + 4);
        cristal.addColorStop(0, brilho > 0.8 ? cristais.pontaClara : cristais.pontaEscura);
        cristal.addColorStop(1, cristais.base);
        contexto.fillStyle = cristal;
        contexto.beginPath();
        contexto.moveTo(px, topo);
        contexto.lineTo(px - meia, superficie + 4);
        contexto.lineTo(px + meia, superficie + 4);
        contexto.closePath();
        contexto.fill();

        contexto.fillStyle = "rgba(255,255,255," + (0.30 * brilho) + ")";
        contexto.beginPath();
        contexto.moveTo(px, topo);
        contexto.lineTo(px - meia * 0.35, superficie + 4);
        contexto.lineTo(px, superficie + 4);
        contexto.closePath();
        contexto.fill();
    }
}

// ---------- Elementos animados ----------

function prepararEstrelasBrilhantes(cenario) {
    const sortear = criarSorteio(5150 + cenario.tema.sementeExtra);
    cenario.estrelasBrilhantes = [];

    const larguraTotal = cenario.larguraDoNivel * CAMADAS.estrelasMeio + cenario.larguraDaTela;
    const quantidade = Math.max(14, Math.round(34 * larguraTotal / 2184));   // 34 era para o nível de 3600px

    for (let i = 0; i < quantidade; i++) {
        cenario.estrelasBrilhantes.push({
            x: sortear() * (cenario.larguraDoNivel * CAMADAS.estrelasMeio + cenario.larguraDaTela),
            y: sortear() * (cenario.alturaDoChao - 40),
            tamanho: 1 + sortear() * 1.8,
            fase: sortear() * Math.PI * 2,
            velocidade: 0.6 + sortear() * 1.6,
        });
    }
}

function prepararPoeira(cenario) {
    const sortear = criarSorteio(8821 + cenario.tema.sementeExtra);
    cenario.poeira = [];

    for (let i = 0; i < 40; i++) {
        cenario.poeira.push({
            x: sortear() * cenario.larguraDaTela * 2,
            y: sortear() * cenario.alturaDaTela,
            tamanho: 0.8 + sortear() * 2.2,
            opacidade: 0.06 + sortear() * 0.16,
            deriva: 4 + sortear() * 14,
            fase: sortear() * Math.PI * 2,
        });
    }
}

function atualizarCenarioDaFase(cenario, tempoDecorrido) {
    cenario.tempo += tempoDecorrido;
}

// ---------- Desenho por frame ----------

function desenharFatiaDaCamada(contexto, cenario, camada, fator, posicaoDaCamera) {
    if (!camada) return;

    const deslocamento = Math.round(posicaoDaCamera * fator);
    const maximo = Math.max(0, camada.width - cenario.larguraDaTela);
    const x = Math.min(maximo, Math.max(0, deslocamento));

    contexto.drawImage(
        camada,
        x, 0, cenario.larguraDaTela, Math.min(camada.height, cenario.alturaDaTela),
        0, 0, cenario.larguraDaTela, Math.min(camada.height, cenario.alturaDaTela)
    );
}

function desenharFundoDaFase(contexto, cenario, posicaoDaCamera) {
    desenharCeu(contexto, cenario);

    desenharFatiaDaCamada(contexto, cenario, cenario.camadas.nebulosa, CAMADAS.nebulosa, posicaoDaCamera);
    desenharFatiaDaCamada(contexto, cenario, cenario.camadas.estrelasLonge, CAMADAS.estrelasLonge, posicaoDaCamera);
    desenharEstrelasPiscando(contexto, cenario, posicaoDaCamera);
    desenharFatiaDaCamada(contexto, cenario, cenario.camadas.planetas, CAMADAS.planetas, posicaoDaCamera);
    desenharFatiaDaCamada(contexto, cenario, cenario.camadas.estrelasMeio, CAMADAS.estrelasMeio, posicaoDaCamera);
    desenharFatiaDaCamada(contexto, cenario, cenario.camadas.relevoLonge, CAMADAS.relevoLonge, posicaoDaCamera);
    desenharFatiaDaCamada(contexto, cenario, cenario.camadas.colunas, CAMADAS.colunas, posicaoDaCamera);
    desenharFatiaDaCamada(contexto, cenario, cenario.camadas.relevoPerto, CAMADAS.relevoPerto, posicaoDaCamera);

    desenharChaoDaFase(contexto, cenario, posicaoDaCamera);
}

function desenharCeu(contexto, cenario) {
    const ceu = contexto.createLinearGradient(0, 0, 0, cenario.alturaDaTela);
    ceu.addColorStop(0, cenario.tema.ceuTopo);
    ceu.addColorStop(0.55, cenario.tema.ceuMeio);
    ceu.addColorStop(1, cenario.tema.ceuBaixo);

    contexto.fillStyle = ceu;
    contexto.fillRect(0, 0, cenario.larguraDaTela, cenario.alturaDaTela);
}

function desenharEstrelasPiscando(contexto, cenario, posicaoDaCamera) {
    const segundos = cenario.tempo / 1000;

    cenario.estrelasBrilhantes.forEach((estrela) => {
        const x = estrela.x - posicaoDaCamera * CAMADAS.estrelasMeio;
        if (x < -6 || x > cenario.larguraDaTela + 6) return;

        const pulso = 0.35 + 0.65 * Math.abs(Math.sin(segundos * estrela.velocidade + estrela.fase));
        const raio = estrela.tamanho * (0.75 + pulso * 0.5);

        const brilho = contexto.createRadialGradient(x, estrela.y, 0, x, estrela.y, raio * 4);
        const cores = cenario.tema.estrelaPiscando;
        brilho.addColorStop(0, "rgba(" + cores.centro + "," + (0.85 * pulso) + ")");
        brilho.addColorStop(0.3, "rgba(" + cores.meio + "," + (0.30 * pulso) + ")");
        brilho.addColorStop(1, "rgba(" + cores.borda + ",0)");

        contexto.fillStyle = brilho;
        contexto.beginPath();
        contexto.arc(x, estrela.y, raio * 4, 0, Math.PI * 2);
        contexto.fill();
    });
}

function desenharChaoDaFase(contexto, cenario, posicaoDaCamera) {
    const camada = cenario.camadas.chao;

    if (camada) {
        const margem = camada.margemAcima || 0;
        const topo = cenario.alturaDoChao - margem;
        const x = Math.min(Math.max(0, Math.round(posicaoDaCamera)), Math.max(0, camada.width - cenario.larguraDaTela));
        contexto.drawImage(
            camada,
            x, 0, cenario.larguraDaTela, camada.height,
            0, topo, cenario.larguraDaTela, camada.height
        );
    }

    desenharLinhaDeEnergia(contexto, cenario, cenario.alturaDoChao, cenario.larguraDaTela, 0);
}

// A linha brilhante do chão, usada também na borda de cima das plataformas.
function desenharLinhaDeEnergia(contexto, cenario, y, largura, deslocamentoX) {
    const pulso = 0.6 + 0.4 * Math.sin(cenario.tempo / 420);

    const halo = contexto.createLinearGradient(0, y - 16, 0, y + 4);
    halo.addColorStop(0, "rgba(" + cenario.tema.linhaDoChaoRgb + ",0)");
    halo.addColorStop(1, "rgba(" + cenario.tema.linhaDoChaoRgb + "," + (0.22 * pulso) + ")");
    contexto.fillStyle = halo;
    contexto.fillRect(deslocamentoX, y - 16, largura, 20);

    contexto.strokeStyle = cenario.tema.linhaDoChao;
    contexto.globalAlpha = 0.55 + 0.35 * pulso;
    contexto.lineWidth = 2;
    contexto.beginPath();
    contexto.moveTo(deslocamentoX, y);
    contexto.lineTo(deslocamentoX + largura, y);
    contexto.stroke();
    contexto.globalAlpha = 1;
}

// Poeira que passa na frente de tudo, dando sensação de profundidade.
function desenharPoeiraDaFrente(contexto, cenario, posicaoDaCamera) {
    const segundos = cenario.tempo / 1000;
    const larguraDoCiclo = cenario.larguraDaTela * 2;

    contexto.fillStyle = cenario.tema.poeira;

    cenario.poeira.forEach((grao) => {
        let x = grao.x - posicaoDaCamera * CAMADAS.poeiraDaFrente;
        x = ((x % larguraDoCiclo) + larguraDoCiclo) % larguraDoCiclo - cenario.larguraDaTela * 0.5;
        if (x < -10 || x > cenario.larguraDaTela + 10) return;

        const y = grao.y + Math.sin(segundos * 0.7 + grao.fase) * grao.deriva;

        contexto.globalAlpha = grao.opacidade;
        contexto.beginPath();
        contexto.arc(x, y, grao.tamanho, 0, Math.PI * 2);
        contexto.fill();
    });

    contexto.globalAlpha = 1;
}

// Vinheta: escurece os cantos e puxa o olho para o centro da ação.
function desenharVinheta(contexto, cenario) {
    const meiaLargura = cenario.larguraDaTela / 2;
    const meiaAltura = cenario.alturaDaTela / 2;

    const vinheta = contexto.createRadialGradient(
        meiaLargura, meiaAltura, cenario.alturaDaTela * 0.35,
        meiaLargura, meiaAltura, cenario.larguraDaTela * 0.72
    );
    vinheta.addColorStop(0, "rgba(0,0,0,0)");
    vinheta.addColorStop(1, "rgba(0,0,0,0.62)");

    contexto.fillStyle = vinheta;
    contexto.fillRect(0, 0, cenario.larguraDaTela, cenario.alturaDaTela);
}
