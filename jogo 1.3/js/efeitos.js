// ======================================================
// efeitos.js — Suco do jogo: partículas, tremor, hit stop,
// números de dano e rastro de sprint.
//
// Nada aqui altera regra de jogo. É tudo feedback visual:
// o jogador precisa SENTIR o pulo, o golpe e o dano.
// ======================================================

// Partículas vivem num pool fixo. Sem alocar objeto por frame,
// sem lixo pro coletor, sem engasgo durante a luta.
const LIMITE_DE_PARTICULAS = 420;

const particulas = [];
for (let i = 0; i < LIMITE_DE_PARTICULAS; i++) {
    particulas.push({
        ativa: false,
        x: 0, y: 0, anteriorX: 0, anteriorY: 0,
        velocidadeX: 0, velocidadeY: 0,
        gravidade: 0, arrasto: 0.98,
        tamanho: 2, tamanhoFinal: 0,
        vida: 0, vidaMaxima: 1,
        cor: "#ffffff", forma: "circulo", brilho: false,
        giro: 0, velocidadeDoGiro: 0,
    });
}
let proximaParticula = 0;

const efeitos = {
    tremor: { forca: 0, duracao: 0, tempo: 0, deslocamentoX: 0, deslocamentoY: 0 },
    congelamento: 0,          // hit stop, em milissegundos
    flashDaTela: { forca: 0, cor: "255,255,255" },
    textos: [],
    rastro: [],
};

const LIMITE_DE_TEXTOS = 24;
const LIMITE_DO_RASTRO = 10;

// ---------- Emissão ----------

function pegarParticulaLivre() {
    for (let tentativa = 0; tentativa < LIMITE_DE_PARTICULAS; tentativa++) {
        const particula = particulas[proximaParticula];
        proximaParticula = (proximaParticula + 1) % LIMITE_DE_PARTICULAS;
        if (!particula.ativa) return particula;
    }
    // Pool cheio: recicla a mais antiga em vez de ignorar o efeito.
    return particulas[proximaParticula];
}

function emitirParticula(config) {
    const p = pegarParticulaLivre();

    p.ativa = true;
    p.x = config.x;
    p.y = config.y;
    p.anteriorX = config.x;
    p.anteriorY = config.y;
    p.velocidadeX = config.velocidadeX || 0;
    p.velocidadeY = config.velocidadeY || 0;
    p.gravidade = config.gravidade || 0;
    p.arrasto = config.arrasto === undefined ? 0.98 : config.arrasto;
    p.tamanho = config.tamanho || 2;
    p.tamanhoFinal = config.tamanhoFinal === undefined ? 0 : config.tamanhoFinal;
    p.vidaMaxima = config.vida || 400;
    p.vida = p.vidaMaxima;
    p.cor = config.cor || "#ffffff";
    p.forma = config.forma || "circulo";
    p.brilho = Boolean(config.brilho);
    p.giro = config.giro || 0;
    p.velocidadeDoGiro = config.velocidadeDoGiro || 0;

    return p;
}

function aoAcaso(minimo, maximo) {
    return minimo + Math.random() * (maximo - minimo);
}

// Poeirinha dos pés enquanto corre
function emitirPoeiraDeCorrida(x, y, direcao) {
    emitirParticula({
        x: x + aoAcaso(-6, 6),
        y: y + aoAcaso(-3, 2),
        velocidadeX: -direcao * aoAcaso(0.4, 1.6),
        velocidadeY: aoAcaso(-0.9, -0.2),
        gravidade: 0.015,
        tamanho: aoAcaso(2, 5),
        vida: aoAcaso(260, 460),
        cor: "#b8a6e8",
        arrasto: 0.93,
    });
}

// Explosão de poeira ao aterrissar. A força escala com a queda.
function emitirPoeiraDeAterrissagem(x, y, forca) {
    const quantidade = Math.min(18, 5 + Math.floor(forca * 1.4));

    for (let i = 0; i < quantidade; i++) {
        const lado = i % 2 === 0 ? 1 : -1;
        emitirParticula({
            x: x + aoAcaso(-10, 10),
            y: y - aoAcaso(0, 5),
            velocidadeX: lado * aoAcaso(0.8, 3.4) * (0.5 + forca * 0.1),
            velocidadeY: aoAcaso(-1.6, -0.3),
            gravidade: 0.05,
            tamanho: aoAcaso(3, 7),
            vida: aoAcaso(300, 560),
            cor: i % 3 === 0 ? "#d8ccff" : "#8f7ac4",
            arrasto: 0.9,
        });
    }
}

function emitirPuffDePulo(x, y) {
    for (let i = 0; i < 8; i++) {
        const angulo = Math.PI + aoAcaso(-0.9, 0.9);
        emitirParticula({
            x: x + aoAcaso(-8, 8),
            y,
            velocidadeX: Math.cos(angulo) * aoAcaso(0.6, 2.2),
            velocidadeY: aoAcaso(0.2, 1.1),
            gravidade: 0.02,
            tamanho: aoAcaso(2.5, 5.5),
            vida: aoAcaso(220, 380),
            cor: "#cdbcff",
            arrasto: 0.92,
        });
    }
}

// Rastro roxo do sprint, no mesmo tom do portal da sprite sheet
function emitirRastroDeSprint(x, y) {
    emitirParticula({
        x: x + aoAcaso(-14, 14),
        y: y + aoAcaso(-30, 6),
        velocidadeX: aoAcaso(-3.4, -1.2),
        velocidadeY: aoAcaso(-0.5, 0.5),
        gravidade: 0,
        tamanho: aoAcaso(1.5, 4),
        tamanhoFinal: 0,
        vida: aoAcaso(200, 400),
        cor: Math.random() > 0.45 ? "#c77bff" : "#8a5cff",
        forma: "risco",
        brilho: true,
        arrasto: 0.97,
    });
}

// Faíscas do golpe acertando
function emitirFaiscasDeImpacto(x, y, direcao) {
    for (let i = 0; i < 14; i++) {
        const angulo = aoAcaso(-1.1, 1.1);
        const forca = aoAcaso(2, 7);
        emitirParticula({
            x, y,
            velocidadeX: Math.cos(angulo) * forca * direcao,
            velocidadeY: Math.sin(angulo) * forca * 0.8,
            gravidade: 0.08,
            tamanho: aoAcaso(1.5, 3.5),
            vida: aoAcaso(180, 340),
            cor: i % 3 === 0 ? "#ffffff" : (i % 3 === 1 ? "#9fe6ff" : "#7dd3fc"),
            forma: "risco",
            brilho: true,
            arrasto: 0.9,
        });
    }

    emitirParticula({
        x, y,
        tamanho: 6, tamanhoFinal: 34,
        vida: 170, cor: "#bfe9ff", forma: "anel", brilho: true,
    });
}

function emitirExplosaoDeInimigo(x, y) {
    for (let i = 0; i < 22; i++) {
        const angulo = aoAcaso(0, Math.PI * 2);
        const forca = aoAcaso(1.2, 5.5);
        emitirParticula({
            x, y,
            velocidadeX: Math.cos(angulo) * forca,
            velocidadeY: Math.sin(angulo) * forca - 1,
            gravidade: 0.11,
            tamanho: aoAcaso(2, 5.5),
            vida: aoAcaso(340, 640),
            cor: i % 4 === 0 ? "#ffd9e0" : (i % 4 === 1 ? "#ff7b93" : "#c92b4a"),
            brilho: i % 4 === 0,
            arrasto: 0.93,
            velocidadeDoGiro: aoAcaso(-0.3, 0.3),
            forma: i % 5 === 0 ? "quadrado" : "circulo",
        });
    }

    emitirParticula({
        x, y,
        tamanho: 8, tamanhoFinal: 52,
        vida: 260, cor: "#ff6b8b", forma: "anel", brilho: true,
    });
}

function emitirSangueDeDano(x, y, direcao) {
    for (let i = 0; i < 12; i++) {
        emitirParticula({
            x, y: y + aoAcaso(-24, 10),
            velocidadeX: direcao * aoAcaso(0.8, 4),
            velocidadeY: aoAcaso(-3, 0.6),
            gravidade: 0.12,
            tamanho: aoAcaso(2, 4.5),
            vida: aoAcaso(260, 460),
            cor: "#ff5d78",
            arrasto: 0.92,
        });
    }
}

// ---------- Tremor, congelamento, flash ----------

function tremerTela(forca, duracao) {
    // Um tremor forte não deve ser cortado por um fraquinho que venha depois.
    if (forca < efeitos.tremor.forca && efeitos.tremor.tempo < efeitos.tremor.duracao) return;

    efeitos.tremor.forca = forca;
    efeitos.tremor.duracao = duracao;
    efeitos.tremor.tempo = 0;
}

// Hit stop: congela o mundo por alguns milissegundos no impacto.
// É o truque mais barato que existe pra um golpe parecer que tem peso.
function congelarQuadro(milissegundos) {
    efeitos.congelamento = Math.max(efeitos.congelamento, milissegundos);
}

function clarearTela(forca, cor) {
    efeitos.flashDaTela.forca = Math.max(efeitos.flashDaTela.forca, forca);
    efeitos.flashDaTela.cor = cor || "255,255,255";
}

function mostrarTextoFlutuante(x, y, texto, cor, tamanho) {
    if (efeitos.textos.length >= LIMITE_DE_TEXTOS) efeitos.textos.shift();

    efeitos.textos.push({
        x, y, texto,
        cor: cor || "#ffffff",
        tamanho: tamanho || 18,
        vida: 750,
        vidaMaxima: 750,
        velocidadeY: -1.15,
        velocidadeX: aoAcaso(-0.35, 0.35),
    });
}

// ---------- Rastro do personagem ----------

function registrarRastro(x, y, animacao, frame, olhandoPara, escala) {
    efeitos.rastro.push({ x, y, animacao, frame, olhandoPara, escala, vida: 1 });
    if (efeitos.rastro.length > LIMITE_DO_RASTRO) efeitos.rastro.shift();
}

function limparRastro() {
    efeitos.rastro.length = 0;
}

// ---------- Atualização ----------

function atualizarEfeitos(tempoDecorrido) {
    const passo = tempoDecorrido / 16.67;

    atualizarParticulas(passo, tempoDecorrido);
    atualizarTremor(tempoDecorrido);
    atualizarTextos(passo, tempoDecorrido);

    efeitos.flashDaTela.forca = Math.max(0, efeitos.flashDaTela.forca - tempoDecorrido / 160);

    for (let i = efeitos.rastro.length - 1; i >= 0; i--) {
        efeitos.rastro[i].vida -= tempoDecorrido / 260;
        if (efeitos.rastro[i].vida <= 0) efeitos.rastro.splice(i, 1);
    }
}

function atualizarParticulas(passo, tempoDecorrido) {
    for (let i = 0; i < LIMITE_DE_PARTICULAS; i++) {
        const p = particulas[i];
        if (!p.ativa) continue;

        p.vida -= tempoDecorrido;
        if (p.vida <= 0) { p.ativa = false; continue; }

        p.anteriorX = p.x;
        p.anteriorY = p.y;

        p.velocidadeY += p.gravidade * passo;
        p.velocidadeX *= Math.pow(p.arrasto, passo);
        p.velocidadeY *= Math.pow(p.arrasto, passo);

        p.x += p.velocidadeX * passo;
        p.y += p.velocidadeY * passo;
        p.giro += p.velocidadeDoGiro * passo;
    }
}

function atualizarTremor(tempoDecorrido) {
    const tremor = efeitos.tremor;

    if (tremor.tempo >= tremor.duracao) {
        tremor.forca = 0;
        tremor.deslocamentoX = 0;
        tremor.deslocamentoY = 0;
        return;
    }

    tremor.tempo += tempoDecorrido;

    const restante = Math.max(0, 1 - tremor.tempo / tremor.duracao);
    const intensidade = tremor.forca * restante * restante;

    tremor.deslocamentoX = (Math.random() * 2 - 1) * intensidade;
    tremor.deslocamentoY = (Math.random() * 2 - 1) * intensidade;
}

function atualizarTextos(passo, tempoDecorrido) {
    for (let i = efeitos.textos.length - 1; i >= 0; i--) {
        const texto = efeitos.textos[i];

        texto.vida -= tempoDecorrido;
        if (texto.vida <= 0) { efeitos.textos.splice(i, 1); continue; }

        texto.y += texto.velocidadeY * passo;
        texto.x += texto.velocidadeX * passo;
        texto.velocidadeY *= Math.pow(0.965, passo);
    }
}

// ---------- Desenho ----------

// O canvas tem resolução maior que a tela lógica em telas de alta densidade,
// então nunca usamos canvas.width direto para posicionar nada.
function larguraLogica(contexto) {
    return typeof LARGURA_DA_TELA !== "undefined" ? LARGURA_DA_TELA : contexto.canvas.width;
}

function alturaLogica(contexto) {
    return typeof ALTURA_DA_TELA !== "undefined" ? ALTURA_DA_TELA : contexto.canvas.height;
}

function desenharParticulas(contexto, posicaoDaCamera) {
    contexto.save();

    for (let i = 0; i < LIMITE_DE_PARTICULAS; i++) {
        const p = particulas[i];
        if (!p.ativa) continue;

        const x = p.x - posicaoDaCamera;
        if (x < -40 || x > larguraLogica(contexto) + 40) continue;

        const progresso = p.vida / p.vidaMaxima;
        const tamanho = p.tamanhoFinal
            ? p.tamanho + (p.tamanhoFinal - p.tamanho) * (1 - progresso)
            : p.tamanho * progresso;

        if (tamanho <= 0.2) continue;

        contexto.globalAlpha = Math.min(1, progresso * 1.4);
        contexto.globalCompositeOperation = p.brilho ? "lighter" : "source-over";
        contexto.fillStyle = p.cor;
        contexto.strokeStyle = p.cor;

        desenharFormaDaParticula(contexto, p, x, tamanho, posicaoDaCamera);
    }

    contexto.restore();
}

function desenharFormaDaParticula(contexto, p, x, tamanho, posicaoDaCamera) {
    if (p.forma === "risco") {
        contexto.lineWidth = tamanho;
        contexto.lineCap = "round";
        contexto.beginPath();
        contexto.moveTo(p.anteriorX - posicaoDaCamera, p.anteriorY);
        contexto.lineTo(x, p.y);
        contexto.stroke();
        return;
    }

    if (p.forma === "anel") {
        contexto.lineWidth = Math.max(1, tamanho * 0.12);
        contexto.beginPath();
        contexto.arc(x, p.y, tamanho, 0, Math.PI * 2);
        contexto.stroke();
        return;
    }

    if (p.forma === "quadrado") {
        contexto.save();
        contexto.translate(x, p.y);
        contexto.rotate(p.giro);
        contexto.fillRect(-tamanho / 2, -tamanho / 2, tamanho, tamanho);
        contexto.restore();
        return;
    }

    contexto.beginPath();
    contexto.arc(x, p.y, tamanho, 0, Math.PI * 2);
    contexto.fill();
}

function desenharTextosFlutuantes(contexto, posicaoDaCamera) {
    contexto.save();
    contexto.textAlign = "center";

    efeitos.textos.forEach((texto) => {
        const progresso = texto.vida / texto.vidaMaxima;
        const x = texto.x - posicaoDaCamera;

        contexto.globalAlpha = Math.min(1, progresso * 1.8);
        contexto.font = "bold " + texto.tamanho + "px system-ui, sans-serif";
        contexto.lineWidth = 4;
        contexto.strokeStyle = "rgba(6,2,18,0.85)";
        contexto.strokeText(texto.texto, x, texto.y);
        contexto.fillStyle = texto.cor;
        contexto.fillText(texto.texto, x, texto.y);
    });

    contexto.restore();
}

function desenharFlashDaTela(contexto) {
    if (efeitos.flashDaTela.forca <= 0.01) return;

    contexto.save();
    contexto.globalCompositeOperation = "lighter";
    contexto.fillStyle = "rgba(" + efeitos.flashDaTela.cor + "," + (efeitos.flashDaTela.forca * 0.4) + ")";
    contexto.fillRect(0, 0, larguraLogica(contexto), alturaLogica(contexto));
    contexto.restore();
}

function limparTodosOsEfeitos() {
    particulas.forEach((p) => { p.ativa = false; });
    efeitos.textos.length = 0;
    efeitos.rastro.length = 0;
    efeitos.tremor.forca = 0;
    efeitos.tremor.tempo = 0;
    efeitos.tremor.duracao = 0;
    efeitos.tremor.deslocamentoX = 0;
    efeitos.tremor.deslocamentoY = 0;
    efeitos.congelamento = 0;
    efeitos.flashDaTela.forca = 0;
}
