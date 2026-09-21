// ======================================================
// chefe.js — Chefe de fase: o Mecha com espada
//
// Um "portão vivo": é o chefe da Fase 2 (Arena do Mecha). Fica na frente
// do portal e bloqueia a passagem até ser derrotado. Tem 4 ataques
// diferentes (ver REPERTORIO_DE_ATAQUES) sorteados por peso, mais uma
// animação de espera em loop (mechaIdle) — cada um usa sua própria
// sprite sheet 5x5, registradas em sprites.js.
//
// ONDE o chefe fica (posicaoX e gatilhoX) é definido por fase, em
// js/fases.js. Uma fase com "chefe: null" não tem chefe nenhum.
//
// Depende de: sprites.js (obterRecorteDoFrame/totalDeFramesDaSprite),
// astronauta.js (jogador, tomarDano, caixaDoJogador), efeitos.js e
// audio.js (feedback). jogo.js chama atualizarChefe/desenharChefe/
// aplicarDanoNoChefe e usa limiteDaBarreiraDoChefe() pra travar o
// avanço até a arena ser vencida — ver comentários "CHEFE:" em jogo.js.
// jogo.js chama criarChefe(config) toda vez que uma fase é carregada.
// ======================================================

const CHEFE_CONFIG = {
    largura: 220,
    altura: 220,

    // Caixa de colisão real, menor que o quadro do sprite.
    margemColisaoX: 55,
    margemColisaoTopo: 20,

    vidaMaxima: 420,

    distanciaDeAtaque: 230,  // distância (centro a centro) pra decidir atacar

    tempoDeRecuperacao: 900, // ms parado depois de um golpe, antes do próximo
    tempoDeRecuperacaoInicial: 700,

    danoDeContato: 10,

    duracaoDoQuadroDeIdle: 90, // ms por quadro do loop parado (respirando)
};

// Folga entre o corpo do chefe e a "parede" invisível que fica atrás dele:
// o jogador consegue chegar bem perto pra lutar, mas não passa por cima
// dele enquanto estiver vivo. A parede some assim que o chefe morre.
const FOLGA_DA_BARREIRA_ATRAS_DO_CHEFE = 40;

// ---------- Repertório de ataques ----------
// sprite            : nome registrado em sprites.js (BANCO_DE_SPRITES)
// quadroInicial      : primeiro quadro da folha usado (pula quadros ruins)
// totalDeQuadros     : quantos quadros tocar a partir do quadroInicial
// quadroDeImpacto    : índice RELATIVO (0 = quadroInicial) onde o dano é
//                      aplicado; null = este ataque nunca causa dano sozinho
// duracaoDoQuadro    : ms por quadro (controla a velocidade do golpe)
// alcanceDoImpacto   : alcance horizontal do golpe, em pixels
// dano               : dano causado no jogador
// peso               : chance relativa de ser sorteado (0 = nunca sorteado
//                      sozinho, só entra via "encadeiaCom")
// pulo/alturaDoPulo  : levanta o chefe do chão durante o ataque (curva
//                      suave, sem física real — é só visual + hitbox)
// encadeiaCom        : ao terminar, inicia esse outro ataque na sequência,
//                      sem voltar pro estado parado
const REPERTORIO_DE_ATAQUES = [
    {
        nome: "padrao",
        sprite: "mechaEspada",
        quadroInicial: 0, totalDeQuadros: 25,
        quadroDeImpacto: 10,
        duracaoDoQuadro: 58,
        alcanceDoImpacto: 210,
        dano: 22,
        peso: 3,
    },
    {
        // Golpe acrobático avançando — mesmo alcance de um golpe comum
        // (a arena já é curta o bastante pra não precisar de um avanço
        // "de verdade" empurrando a posição do chefe).
        nome: "avanco",
        sprite: "mechaAvanco",
        quadroInicial: 0, totalDeQuadros: 25,
        quadroDeImpacto: 16,
        duracaoDoQuadro: 46,
        alcanceDoImpacto: 220,
        dano: 18,
        peso: 2,
    },
    {
        // Só o preparo (espada bem erguida, visão de perfil). Não causa
        // dano sozinho — ao terminar, encadeia com "padraoCarregado".
        nome: "carregado",
        sprite: "mechaAtaque2",
        quadroInicial: 10, totalDeQuadros: 15,
        quadroDeImpacto: null,
        duracaoDoQuadro: 70,
        alcanceDoImpacto: 0,
        dano: 0,
        peso: 1,
        encadeiaCom: "padraoCarregado",
    },
    {
        // O golpe de verdade depois do preparo acima: mesma animação do
        // ataque padrão, mais rápido e mais forte. Nunca é sorteado
        // sozinho (peso 0) — só acontece encadeado por "carregado".
        nome: "padraoCarregado",
        sprite: "mechaEspada",
        quadroInicial: 0, totalDeQuadros: 25,
        quadroDeImpacto: 10,
        duracaoDoQuadro: 50,
        alcanceDoImpacto: 230,
        dano: 38,
        peso: 0,
    },
    {
        nome: "salto",
        sprite: "mechaSalto",
        quadroInicial: 0, totalDeQuadros: 25,
        quadroDeImpacto: 13,
        duracaoDoQuadro: 55,
        alcanceDoImpacto: 260,
        dano: 24,
        peso: 2,
        pulo: true,
        alturaDoPulo: 90,
    },
];

function buscarAtaquePorNome(nome) {
    return REPERTORIO_DE_ATAQUES.find((ataque) => ataque.nome === nome);
}

function escolherProximoAtaque() {
    const candidatos = REPERTORIO_DE_ATAQUES.filter((ataque) => ataque.peso > 0);
    const pesoTotal = candidatos.reduce((soma, ataque) => soma + ataque.peso, 0);
    let sorteio = Math.random() * pesoTotal;

    for (const candidato of candidatos) {
        sorteio -= candidato.peso;
        if (sorteio <= 0) return candidato;
    }
    return candidatos[candidatos.length - 1];
}

// Sobe e desce em arco suave ao longo do ataque — não é física real,
// só um efeito visual (some por completo em ataques sem "pulo").
function calcularOffsetVerticalDoPulo(ataque, indiceRelativo) {
    if (!ataque.pulo) return 0;
    const progresso = indiceRelativo / Math.max(1, ataque.totalDeQuadros - 1);
    return Math.sin(Math.PI * progresso) * ataque.alturaDoPulo;
}

// config = { posicaoX, gatilhoX } vindo de fases.js.
// Sem config (fase sem chefe) devolve um chefe "inexistente": vivo = false,
// então todas as funções abaixo simplesmente não fazem nada.
function criarChefe(config) {
    const existe = Boolean(config);
    const posicaoX = existe ? config.posicaoX : 0;

    return {
        existe,
        posicaoX,
        posicaoY: existe ? POSICAO_DO_CHAO - CHEFE_CONFIG.altura : 0,
        gatilhoX: existe ? config.gatilhoX : 0,   // o jogador precisa passar daqui pra "acordar" o chefe
        barreiraX: posicaoX + CHEFE_CONFIG.largura + FOLGA_DA_BARREIRA_ATRAS_DO_CHEFE,
        vida: CHEFE_CONFIG.vidaMaxima,
        vidaMaxima: CHEFE_CONFIG.vidaMaxima,
        vivo: existe,
        ativo: false,
        estado: "parado",          // "parado" | "atacando"
        ataqueAtual: null,
        indiceRelativo: 0,
        tempoNoQuadro: 0,
        indiceDeIdle: 0,
        tempoNoQuadroDeIdle: 0,
        offsetVertical: 0,
        golpeAplicadoNesteAtaque: false,
        tempoDeRecuperacao: CHEFE_CONFIG.tempoDeRecuperacaoInicial,
        olhandoPara: -1,
        brilhoDeDano: 0,
        empurraoX: 0,
    };
}

// jogo.js troca este chefe a cada carregarFase().
let chefe = criarChefe(null);

// O portal da fase só abre quando não há chefe vivo segurando a passagem.
function chefeBloqueiaOPortal() {
    return chefe.existe && chefe.vivo;
}

// ---------- Caixa de colisão ----------

function caixaDoChefe() {
    return {
        x: chefe.posicaoX + CHEFE_CONFIG.margemColisaoX,
        y: chefe.posicaoY - chefe.offsetVertical + CHEFE_CONFIG.margemColisaoTopo,
        largura: CHEFE_CONFIG.largura - CHEFE_CONFIG.margemColisaoX * 2,
        altura: CHEFE_CONFIG.altura - CHEFE_CONFIG.margemColisaoTopo,
    };
}

// Chamado por jogo.js (limitarJogadorAoNivel). Enquanto o chefe
// estiver vivo, devolve o X máximo que o jogador pode alcançar.
// Depois que ele morre, devolve null (barreira removida).
function limiteDaBarreiraDoChefe() {
    if (!chefe.existe || !chefe.vivo) return null;
    return chefe.barreiraX - jogador.largura;
}

// ---------- Atualização (chamada a cada passo de física) ----------

function atualizarChefe(passo, tempoDecorrido) {
    if (!chefe.vivo) return;

    chefe.brilhoDeDano = Math.max(0, chefe.brilhoDeDano - tempoDecorrido / 120);

    if (Math.abs(chefe.empurraoX) > 0.05) {
        chefe.posicaoX += chefe.empurraoX * passo;
        chefe.empurraoX *= Math.pow(0.82, passo);
    }

    if (chefe.estado === "parado") atualizarAnimacaoIdle(tempoDecorrido);

    verificarDespertarDoChefe();
    if (!chefe.ativo) return;

    virarChefeParaOJogador();

    if (chefe.estado === "atacando") {
        avancarQuadroDoAtaqueDoChefe(tempoDecorrido);
    } else {
        atualizarEsperaDoChefe(tempoDecorrido);
    }

    verificarDanoDeContatoDoChefe();
}

function atualizarAnimacaoIdle(tempoDecorrido) {
    chefe.tempoNoQuadroDeIdle += tempoDecorrido;
    if (chefe.tempoNoQuadroDeIdle < CHEFE_CONFIG.duracaoDoQuadroDeIdle) return;

    chefe.tempoNoQuadroDeIdle = 0;
    const total = totalDeFramesDaSprite("mechaIdle") || 25;
    chefe.indiceDeIdle = (chefe.indiceDeIdle + 1) % total;
}

function verificarDespertarDoChefe() {
    if (chefe.ativo) return;
    if (jogador.posicaoX + jogador.largura < chefe.gatilhoX) return;

    chefe.ativo = true;

    mostrarTextoFlutuante(
        chefe.posicaoX + CHEFE_CONFIG.largura / 2, chefe.posicaoY - 16,
        "MECHA ATIVADO", "#ff5d78", 20
    );
    tremerTela(9, 260);
}

function virarChefeParaOJogador() {
    const centroChefe = chefe.posicaoX + CHEFE_CONFIG.largura / 2;
    const centroJogador = jogador.posicaoX + jogador.largura / 2;
    chefe.olhandoPara = centroJogador < centroChefe ? -1 : 1;
}

function atualizarEsperaDoChefe(tempoDecorrido) {
    if (chefe.tempoDeRecuperacao > 0) {
        chefe.tempoDeRecuperacao -= tempoDecorrido;
        return;
    }

    const centroChefe = chefe.posicaoX + CHEFE_CONFIG.largura / 2;
    const centroJogador = jogador.posicaoX + jogador.largura / 2;
    const distancia = Math.abs(centroJogador - centroChefe);

    if (distancia <= CHEFE_CONFIG.distanciaDeAtaque) iniciarAtaqueDoChefe(escolherProximoAtaque());
}

function iniciarAtaqueDoChefe(ataque) {
    chefe.estado = "atacando";
    chefe.ataqueAtual = ataque;
    chefe.indiceRelativo = 0;
    chefe.tempoNoQuadro = 0;
    chefe.golpeAplicadoNesteAtaque = false;
    chefe.offsetVertical = calcularOffsetVerticalDoPulo(ataque, 0);
}

function avancarQuadroDoAtaqueDoChefe(tempoDecorrido) {
    const ataque = chefe.ataqueAtual;

    chefe.tempoNoQuadro += tempoDecorrido;
    if (chefe.tempoNoQuadro < ataque.duracaoDoQuadro) return;

    chefe.tempoNoQuadro = 0;
    chefe.indiceRelativo++;
    chefe.offsetVertical = calcularOffsetVerticalDoPulo(ataque, chefe.indiceRelativo);

    if (
        ataque.quadroDeImpacto !== null &&
        chefe.indiceRelativo === ataque.quadroDeImpacto &&
        !chefe.golpeAplicadoNesteAtaque
    ) {
        chefe.golpeAplicadoNesteAtaque = true;
        aplicarImpactoDoChefe();
    }

    if (chefe.indiceRelativo < ataque.totalDeQuadros) return;

    if (ataque.encadeiaCom) {
        iniciarAtaqueDoChefe(buscarAtaquePorNome(ataque.encadeiaCom));
        return;
    }

    chefe.estado = "parado";
    chefe.offsetVertical = 0;
    chefe.tempoDeRecuperacao = CHEFE_CONFIG.tempoDeRecuperacao;
}

// A espadada é uma área na frente do chefe, não uma caixa colada nele:
// as sheets mostram a espada varrendo bem além do corpo.
function aplicarImpactoDoChefe() {
    const ataque = chefe.ataqueAtual;
    const centroChefe = chefe.posicaoX + CHEFE_CONFIG.largura / 2;
    const centroJogador = jogador.posicaoX + jogador.largura / 2;
    const distancia = Math.abs(centroJogador - centroChefe);

    const jogadorNaFrente = chefe.olhandoPara === 1
        ? centroJogador > centroChefe
        : centroJogador < centroChefe;

    const pontaDaEspada = centroChefe + chefe.olhandoPara * 70;
    const impactoY = chefe.posicaoY - chefe.offsetVertical + CHEFE_CONFIG.altura - 26;

    emitirFaiscasDeImpacto(pontaDaEspada, impactoY, chefe.olhandoPara);
    tremerTela(ataque.dano > 30 ? 16 : 12, ataque.dano > 30 ? 320 : 260);
    congelarQuadro(60);
    if (typeof somDeImpactoDoChefe === "function") somDeImpactoDoChefe();

    if (jogadorNaFrente && distancia <= ataque.alcanceDoImpacto) {
        tomarDano(ataque.dano, centroChefe);
    }
}

function verificarDanoDeContatoDoChefe() {
    if (performance.now() < jogador.invencivelAte) return;
    if (jogador.estado === "morto") return;

    const caixaChefe = caixaDoChefe();
    const caixaJogador = caixaDoJogador();

    const encostou = retangulosColidem(
        caixaJogador.x, caixaJogador.y, caixaJogador.largura, caixaJogador.altura,
        caixaChefe.x, caixaChefe.y, caixaChefe.largura, caixaChefe.altura
    );

    if (encostou) tomarDano(CHEFE_CONFIG.danoDeContato, chefe.posicaoX + CHEFE_CONFIG.largura / 2);
}

// ---------- Dano recebido (chamado por jogo.js quando o golpe do astronauta acerta) ----------

function aplicarDanoNoChefe() {
    const dano = AJUSTES_DE_JOGO.danoDoGolpe + Math.min(12, jogador.combo * 2);

    chefe.vida -= dano;
    chefe.brilhoDeDano = 1;
    chefe.empurraoX = -chefe.olhandoPara * 4;

    const centroX = chefe.posicaoX + CHEFE_CONFIG.largura / 2;
    const centroY = chefe.posicaoY - chefe.offsetVertical + CHEFE_CONFIG.altura / 2;

    emitirFaiscasDeImpacto(centroX, centroY, -chefe.olhandoPara);
    mostrarTextoFlutuante(centroX, centroY - 36, String(dano), "#9fe6ff", 18);

    if (chefe.vida > 0) return;

    chefe.vida = 0;
    chefe.vivo = false;
    chefe.estado = "parado";

    emitirExplosaoDeInimigo(centroX, centroY);
    emitirExplosaoDeInimigo(centroX - 34, centroY + 24);
    emitirExplosaoDeInimigo(centroX + 34, centroY - 14);
    clarearTela(1, "255,140,170");
    tremerTela(18, 380);
    if (typeof somDeChefeDerrotado === "function") somDeChefeDerrotado();

    mostrarTextoFlutuante(centroX, centroY - 66, "MECHA DERROTADO!", "#ffd97d", 24);
}

// ---------- Desenho ----------

// Qual sprite/quadro mostrar agora: a animação de espera em loop
// enquanto ele não está atacando, ou o ataque em andamento.
function quadroAtualDoChefe() {
    if (chefe.estado === "atacando" && chefe.ataqueAtual) {
        return {
            sprite: chefe.ataqueAtual.sprite,
            indice: chefe.ataqueAtual.quadroInicial + chefe.indiceRelativo,
        };
    }
    return { sprite: "mechaIdle", indice: chefe.indiceDeIdle };
}

function desenharChefe(camaraX) {
    if (!chefe.vivo) return;

    const x = chefe.posicaoX - camaraX;
    if (x < -260 || x > LARGURA_DA_TELA + 260) return;

    const quadro = quadroAtualDoChefe();
    const recorte = obterRecorteDoFrame(quadro.sprite, quadro.indice);
    if (!recorte) return;

    const largura = Math.round(CHEFE_CONFIG.largura * recorte.escalaDeDesenho);
    const altura = Math.round(CHEFE_CONFIG.altura * recorte.escalaDeDesenho);
    const centroX = x + CHEFE_CONFIG.largura / 2;
    const baseY = chefe.posicaoY - chefe.offsetVertical + CHEFE_CONFIG.altura;

    const desenhoX = Math.round(centroX - largura / 2 + recorte.deslocamentoX);
    const desenhoY = Math.round(baseY - altura + recorte.deslocamentoY);

    contextoDoCanvas.save();
    contextoDoCanvas.imageSmoothingEnabled = true;
    contextoDoCanvas.imageSmoothingQuality = "high";

    if (chefe.olhandoPara === -1) {
        contextoDoCanvas.translate(desenhoX + largura, desenhoY);
        contextoDoCanvas.scale(-1, 1);
        contextoDoCanvas.drawImage(
            recorte.fonte,
            recorte.origemX, recorte.origemY, recorte.largura, recorte.altura,
            0, 0, largura, altura
        );
    } else {
        contextoDoCanvas.drawImage(
            recorte.fonte,
            recorte.origemX, recorte.origemY, recorte.largura, recorte.altura,
            desenhoX, desenhoY, largura, altura
        );
    }

    contextoDoCanvas.restore();

    aplicarBrilhoDeDanoNoChefe(centroX, desenhoY + altura / 2, largura * 0.35);
}

function aplicarBrilhoDeDanoNoChefe(centroX, centroY, raio) {
    if (chefe.brilhoDeDano <= 0.01) return;

    contextoDoCanvas.save();
    contextoDoCanvas.globalCompositeOperation = "lighter";
    contextoDoCanvas.globalAlpha = chefe.brilhoDeDano * 0.5;
    contextoDoCanvas.fillStyle = "#ffffff";
    contextoDoCanvas.beginPath();
    contextoDoCanvas.arc(centroX, centroY, raio, 0, Math.PI * 2);
    contextoDoCanvas.fill();
    contextoDoCanvas.restore();
}

// Barra de vida grande no topo da tela, estilo "chefe de fase".
// Some quando ele é derrotado.
function desenharBarraDoChefe() {
    if (!chefe.ativo || !chefe.vivo) return;

    const largura = 420;
    const altura = 16;
    const x = (LARGURA_DA_TELA - largura) / 2;
    const y = 20;

    contextoDoCanvas.save();

    contextoDoCanvas.fillStyle = "rgba(8,2,22,0.75)";
    desenharRetanguloArredondado(x - 6, y - 24, largura + 12, altura + 32, 8);
    contextoDoCanvas.fill();

    contextoDoCanvas.font = "bold 13px system-ui, sans-serif";
    contextoDoCanvas.fillStyle = "rgba(255,255,255,0.85)";
    contextoDoCanvas.textAlign = "center";
    contextoDoCanvas.fillText("MECHA", LARGURA_DA_TELA / 2, y - 7);

    contextoDoCanvas.fillStyle = "rgba(255,255,255,0.08)";
    desenharRetanguloArredondado(x, y, largura, altura, 6);
    contextoDoCanvas.fill();

    const proporcao = Math.max(0, chefe.vida / chefe.vidaMaxima);
    const gradiente = contextoDoCanvas.createLinearGradient(x, y, x + largura, y);
    gradiente.addColorStop(0, "#ff5d78");
    gradiente.addColorStop(1, "#ffb14d");
    contextoDoCanvas.fillStyle = gradiente;
    desenharRetanguloArredondado(x, y, largura * proporcao, altura, 6);
    contextoDoCanvas.fill();

    contextoDoCanvas.strokeStyle = "rgba(255,255,255,0.35)";
    contextoDoCanvas.lineWidth = 1.5;
    desenharRetanguloArredondado(x, y, largura, altura, 6);
    contextoDoCanvas.stroke();

    contextoDoCanvas.restore();
}
