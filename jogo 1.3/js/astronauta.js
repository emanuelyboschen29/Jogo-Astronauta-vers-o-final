// ======================================================
// astronauta.js — Personagem principal
// Movimento, pulo, ataque, sprint, animação, vida e "game feel".
//
// As sprite sheets são carregadas e tratadas em sprites.js.
// A física é aplicada em jogo.js, usando as constantes daqui.
// ======================================================

// ---------- Configurações do personagem ----------
const CONFIGURACOES = {
    tamanhoDoFrame: 256,
    totalDeFrames: 25,

    // --- Corrida ---
    velocidadeDeMovimento: 4.6,
    multiplicadorDeVelocidadeDoSprint: 1.85,
    aceleracaoNoChao: 0.95,        // quanto ganha de velocidade por frame
    atritoNoChao: 1.15,            // quanto perde quando solta a tecla
    aceleracaoNoAr: 0.5,           // controle aéreo: menor que no chão, mas existe
    atritoNoAr: 0.16,

    // --- Pulo ---
    forcaDoPulo: -15.4,
    forcaDoCorteDoPulo: -5.2,      // ao soltar a tecla no meio da subida
    gravidade: 0.78,
    multiplicadorDeQueda: 1.45,    // cair mais rápido do que subir deixa o pulo "seco"
    multiplicadorDeSubidaCurta: 1.7,
    flutuacaoNoApice: 0.72,        // alivia a gravidade no topo do pulo
    velocidadeMaximaDeQueda: 19,
    tempoDeCoyote: 110,            // ms de tolerância após sair da plataforma
    tempoDeBufferDoPulo: 130,      // ms de tolerância ao apertar antes de cair

    // --- Animação ---
    intervaloEntreFrames: 42,
    intervaloEntreFramesDoAtaque: 24,
    intervaloEntreFramesDaCorrida: 30,

    // --- Combate e dano ---
    tempoDeInvencibilidade: 950,
    frameDeAcertoDoAtaque: 10,
    impulsoDoAtaque: 2.6,          // pequeno avanço ao golpear
    empurraoAoTomarDano: 7.5,
    alturaDoEmpurraoAoTomarDano: -6.5,
    tempoSemControleAposDano: 210,
};

// ---------- Animação da sprite sheet de sprint/portal ----------
const animacaoDeSprint = {
    frame: 0,
    timer: 0,
    frameDuration: 60,
    totalDeFrames: 25,

    // Na sheet, os frames 0..10 são a saída do portal e 11..24 são a corrida.
    // 0  = repete os 25 frames (o portal reaparece a cada volta do loop).
    // 11 = mostra o portal só na largada e depois faz loop só da corrida.
    primeiroFrameDoLoop: 11,
};

const ANIMACAO_RESERVA = {
    correndo: "andando",
    atacando: "parado",
    andando: "parado",
    pulando: "parado",
    morto: "parado",
    parado: null,
};

// ---------- Estado do jogador ----------
const jogador = {
    posicaoX: 60,
    posicaoY: 0,
    anteriorX: 60,      // posição do passo de física anterior, para interpolar o desenho
    anteriorY: 0,
    largura: 96,
    altura: 96,

    // Caixa de colisão real, menor que o quadro do sprite.
    // Sem isso o astronauta "encosta" nas coisas com o vazio do frame.
    margemDeColisaoX: 30,
    margemDeColisaoTopo: 26,

    velocidadeX: 0,
    velocidadeY: 0,
    estaNoChao: true,
    olhandoPara: 1,
    direcaoDesejada: 0,

    estado: "parado",
    estadoAnterior: "parado",
    vida: 100,
    vidaMaxima: 100,
    invencivelAte: 0,

    sprintDesejado: false,
    seguraPulo: false,
    tempoDeCoyote: 0,
    tempoDoPedidoDePulo: 0,
    tempoSemControle: 0,   // trava o controle logo após levar dano, pra o empurrão valer
    velocidadeDeQuedaNoImpacto: 0,

    escalaX: 1,          // squash & stretch
    escalaY: 1,

    indiceDoFrame: 0,
    tempoNoFrame: 0,
    golpeAplicadoNesteAtaque: false,
    tempoDePoeira: 0,
    combo: 0,
    tempoDoCombo: 0,
};

// ---------- Caixa de colisão ----------

function caixaDoJogador() {
    return {
        x: jogador.posicaoX + jogador.margemDeColisaoX,
        y: jogador.posicaoY + jogador.margemDeColisaoTopo,
        largura: jogador.largura - jogador.margemDeColisaoX * 2,
        altura: jogador.altura - jogador.margemDeColisaoTopo,
    };
}

// ---------- Sprint ----------

function definirSprintDesejado(estaPressionado) {
    const estavaCorrendo = jogador.sprintDesejado;
    jogador.sprintDesejado = Boolean(estaPressionado);

    const comecouAgora = jogador.sprintDesejado && !estavaCorrendo && jogador.estaNoChao;
    if (comecouAgora && typeof somDeSprint === "function") somDeSprint();
}

function podeCorrerAgora() {
    return (
        jogador.sprintDesejado &&
        jogador.estaNoChao &&
        jogador.estado !== "atacando" &&
        jogador.estado !== "morto"
    );
}

function velocidadeMaximaAtual() {
    const multiplicador = podeCorrerAgora() ? CONFIGURACOES.multiplicadorDeVelocidadeDoSprint : 1;
    return CONFIGURACOES.velocidadeDeMovimento * multiplicador;
}

// ---------- Intenção de movimento ----------
// Estas funções só dizem "quero ir pra lá". Quem converte isso em
// velocidade é a física, com aceleração — é o que tira o movimento
// robótico de ligar/desligar.

function ficarParado() {
    if (jogador.estado === "morto") return;
    jogador.direcaoDesejada = 0;
}

function moverParaDireita() {
    if (jogador.estado === "morto") return;

    jogador.direcaoDesejada = 1;
    if (jogador.estado !== "atacando") jogador.olhandoPara = 1;
}

function moverParaEsquerda() {
    if (jogador.estado === "morto") return;

    jogador.direcaoDesejada = -1;
    if (jogador.estado !== "atacando") jogador.olhandoPara = -1;
}

// ---------- Pulo ----------

function pular() {
    if (jogador.estado === "morto") return;

    jogador.seguraPulo = true;
    jogador.tempoDoPedidoDePulo = CONFIGURACOES.tempoDeBufferDoPulo;
}

function soltarPulo() {
    jogador.seguraPulo = false;

    const aindaSubindo = jogador.velocidadeY < CONFIGURACOES.forcaDoCorteDoPulo;
    if (aindaSubindo) jogador.velocidadeY = CONFIGURACOES.forcaDoCorteDoPulo;
}

// Executa o pulo se houver pedido guardado E chão (ou coyote time).
function tentarExecutarPuloPendente() {
    if (jogador.tempoDoPedidoDePulo <= 0) return false;
    if (jogador.estado === "morto") return false;

    const temApoio = jogador.estaNoChao || jogador.tempoDeCoyote > 0;
    if (!temApoio) return false;

    jogador.velocidadeY = CONFIGURACOES.forcaDoPulo;
    jogador.estaNoChao = false;
    jogador.tempoDeCoyote = 0;
    jogador.tempoDoPedidoDePulo = 0;

    if (jogador.estado !== "atacando") jogador.estado = "pulando";

    esticarPersonagem(0.8, 1.22);

    if (typeof emitirPuffDePulo === "function") {
        emitirPuffDePulo(jogador.posicaoX + jogador.largura / 2, jogador.posicaoY + jogador.altura);
    }
    if (typeof somDePulo === "function") somDePulo();

    return true;
}

// Chamado pela física quando o astronauta encosta no chão/plataforma.
function aoAterrissar(velocidadeDeQueda) {
    jogador.estaNoChao = true;
    jogador.velocidadeY = 0;
    jogador.velocidadeDeQuedaNoImpacto = velocidadeDeQueda;

    const forca = Math.min(1, velocidadeDeQueda / 16);
    esticarPersonagem(1 + forca * 0.3, 1 - forca * 0.26);

    if (velocidadeDeQueda > 5) {
        if (typeof emitirPoeiraDeAterrissagem === "function") {
            emitirPoeiraDeAterrissagem(
                jogador.posicaoX + jogador.largura / 2,
                jogador.posicaoY + jogador.altura,
                velocidadeDeQueda
            );
        }
        if (typeof tremerTela === "function" && velocidadeDeQueda > 11) {
            tremerTela(velocidadeDeQueda * 0.22, 140);
        }
        if (typeof somDeAterrissagem === "function") somDeAterrissagem(velocidadeDeQueda);
    }

    if (jogador.estado === "pulando") {
        jogador.estado = estadoDeMovimentoNoChao();
    }
}

function estadoDeMovimentoNoChao() {
    if (Math.abs(jogador.velocidadeX) < 0.35 && jogador.direcaoDesejada === 0) return "parado";
    return podeCorrerAgora() ? "correndo" : "andando";
}

function esticarPersonagem(escalaX, escalaY) {
    jogador.escalaX = escalaX;
    jogador.escalaY = escalaY;
}

// ---------- Ataque ----------

function atacar() {
    const podeAtacar = jogador.estado !== "atacando" && jogador.estado !== "morto";
    if (!podeAtacar) return;

    jogador.estado = "atacando";
    jogador.indiceDoFrame = 0;
    jogador.tempoNoFrame = 0;
    jogador.golpeAplicadoNesteAtaque = false;

    // Avanço curto no golpe: dá peso e ajuda a alcançar o inimigo.
    jogador.velocidadeX += jogador.olhandoPara * CONFIGURACOES.impulsoDoAtaque;

    if (typeof somDeGolpe === "function") somDeGolpe();
}

// ---------- Dano ----------

function tomarDano(quantidadeDeDano, origemX) {
    const momentoAtual = performance.now();

    if (momentoAtual < jogador.invencivelAte) return false;
    if (jogador.estado === "morto") return false;

    jogador.vida = Math.max(0, jogador.vida - quantidadeDeDano);
    jogador.invencivelAte = momentoAtual + CONFIGURACOES.tempoDeInvencibilidade;
    jogador.combo = 0;

    const centro = jogador.posicaoX + jogador.largura / 2;
    const direcao = origemX === undefined ? -jogador.olhandoPara : (centro < origemX ? -1 : 1);

    jogador.velocidadeX = direcao * CONFIGURACOES.empurraoAoTomarDano;
    jogador.tempoSemControle = CONFIGURACOES.tempoSemControleAposDano;
    jogador.velocidadeY = Math.min(jogador.velocidadeY, CONFIGURACOES.alturaDoEmpurraoAoTomarDano);
    jogador.estaNoChao = false;

    if (typeof emitirSangueDeDano === "function") emitirSangueDeDano(centro, jogador.posicaoY + 40, direcao);
    if (typeof tremerTela === "function") tremerTela(9, 260);
    if (typeof congelarQuadro === "function") congelarQuadro(70);
    if (typeof clarearTela === "function") clarearTela(0.8, "255,90,120");
    if (typeof mostrarTextoFlutuante === "function") {
        mostrarTextoFlutuante(centro, jogador.posicaoY + 22, "-" + quantidadeDeDano, "#ff7b93", 20);
    }
    if (typeof somDeDano === "function") somDeDano();

    if (jogador.vida <= 0) {
        jogador.estado = "morto";
        jogador.velocidadeX = 0;
        jogador.indiceDoFrame = 0;
        if (typeof somDeDerrota === "function") somDeDerrota();
    }

    return true;
}

function registrarAcertoNoInimigo() {
    jogador.combo++;
    jogador.tempoDoCombo = 1600;
}

// ---------- Temporizadores ----------
// Rodam a cada passo de física: coyote time, buffer de pulo,
// volta do squash e expiração do combo.

function atualizarTemporizadoresDoJogador(tempoDecorrido) {
    if (jogador.estaNoChao) {
        jogador.tempoDeCoyote = CONFIGURACOES.tempoDeCoyote;
    } else {
        jogador.tempoDeCoyote = Math.max(0, jogador.tempoDeCoyote - tempoDecorrido);
    }

    jogador.tempoDoPedidoDePulo = Math.max(0, jogador.tempoDoPedidoDePulo - tempoDecorrido);
    jogador.tempoSemControle = Math.max(0, jogador.tempoSemControle - tempoDecorrido);

    const volta = Math.min(1, tempoDecorrido / 90);
    jogador.escalaX += (1 - jogador.escalaX) * volta;
    jogador.escalaY += (1 - jogador.escalaY) * volta;

    if (jogador.tempoDoCombo > 0) {
        jogador.tempoDoCombo -= tempoDecorrido;
        if (jogador.tempoDoCombo <= 0) jogador.combo = 0;
    }

    atualizarPoeiraDeCorrida(tempoDecorrido);
}

function atualizarPoeiraDeCorrida(tempoDecorrido) {
    const correndoNoChao = jogador.estaNoChao && Math.abs(jogador.velocidadeX) > 2.2;

    if (!correndoNoChao) { jogador.tempoDePoeira = 0; return; }

    jogador.tempoDePoeira += tempoDecorrido;
    const intervalo = jogador.estado === "correndo" ? 55 : 95;
    if (jogador.tempoDePoeira < intervalo) return;

    jogador.tempoDePoeira = 0;

    if (typeof emitirPoeiraDeCorrida === "function") {
        emitirPoeiraDeCorrida(
            jogador.posicaoX + jogador.largura / 2,
            jogador.posicaoY + jogador.altura - 2,
            Math.sign(jogador.velocidadeX)
        );
    }
}

// ---------- Animação ----------

function atualizarAnimacaoDoJogador(tempoDecorrido) {
    reiniciarAnimacaoSeEntrouOuSaiuDoSprint();

    if (jogador.estado === "correndo") {
        avancarAnimacaoDeSprint(tempoDecorrido);
        return;
    }

    jogador.tempoNoFrame += tempoDecorrido;

    const intervalo = jogador.estado === "atacando"
        ? CONFIGURACOES.intervaloEntreFramesDoAtaque
        : (jogador.estado === "andando"
            ? CONFIGURACOES.intervaloEntreFramesDaCorrida
            : CONFIGURACOES.intervaloEntreFrames);

    if (jogador.tempoNoFrame < intervalo) return;

    jogador.tempoNoFrame = 0;
    jogador.indiceDoFrame++;

    if (jogador.estado === "morto") {
        jogador.indiceDoFrame = Math.min(jogador.indiceDoFrame, CONFIGURACOES.totalDeFrames - 1);
        return;
    }

    if (jogador.estado === "atacando") {
        aplicarGolpeSeNecessario();
        finalizarAtaqueSeAcabou();
        return;
    }

    if (jogador.indiceDoFrame >= CONFIGURACOES.totalDeFrames) {
        jogador.indiceDoFrame = 0;
    }
}

function avancarAnimacaoDeSprint(tempoDecorrido) {
    animacaoDeSprint.timer += tempoDecorrido;

    if (animacaoDeSprint.timer >= animacaoDeSprint.frameDuration) {
        animacaoDeSprint.timer -= animacaoDeSprint.frameDuration;
        animacaoDeSprint.frame++;

        if (animacaoDeSprint.frame >= animacaoDeSprint.totalDeFrames) {
            animacaoDeSprint.frame = animacaoDeSprint.primeiroFrameDoLoop;
        }
    }

    jogador.indiceDoFrame = animacaoDeSprint.frame;

    if (typeof emitirRastroDeSprint === "function" && Math.random() < 0.55) {
        emitirRastroDeSprint(
            jogador.posicaoX + jogador.largura / 2 - jogador.olhandoPara * 10,
            jogador.posicaoY + jogador.altura - 34
        );
    }
}

function reiniciarAnimacaoSeEntrouOuSaiuDoSprint() {
    if (jogador.estado === jogador.estadoAnterior) return;

    const entrouNoSprint = jogador.estado === "correndo";
    const saiuDoSprint = jogador.estadoAnterior === "correndo";

    if (entrouNoSprint || saiuDoSprint) {
        animacaoDeSprint.frame = 0;
        animacaoDeSprint.timer = 0;
        jogador.indiceDoFrame = 0;
        jogador.tempoNoFrame = 0;
        if (saiuDoSprint && typeof limparRastro === "function") limparRastro();
    }

    jogador.estadoAnterior = jogador.estado;
}

function aplicarGolpeSeNecessario() {
    const momentoDoGolpe = jogador.indiceDoFrame === CONFIGURACOES.frameDeAcertoDoAtaque;
    if (!momentoDoGolpe || jogador.golpeAplicadoNesteAtaque) return;

    jogador.golpeAplicadoNesteAtaque = true;

    if (typeof aplicarGolpeEmInimigos === "function") aplicarGolpeEmInimigos();
}

function finalizarAtaqueSeAcabou() {
    if (jogador.indiceDoFrame < CONFIGURACOES.totalDeFrames) return;

    jogador.indiceDoFrame = 0;
    jogador.estado = jogador.estaNoChao ? estadoDeMovimentoNoChao() : "pulando";
}

// Define o estado de animação a partir do que está acontecendo de fato.
function atualizarEstadoDoJogador() {
    if (jogador.estado === "morto" || jogador.estado === "atacando") return;

    if (!jogador.estaNoChao) { jogador.estado = "pulando"; return; }

    jogador.estado = estadoDeMovimentoNoChao();
}

// ---------- Desenho ----------

function desenharJogador(contextoDoCanvas, posicaoDaCamera, alfaDeInterpolacao) {
    const animacao = escolherAnimacaoDisponivel(jogador.estado);
    if (!animacao) return;

    const recorte = obterRecorteDoFrame(animacao, jogador.indiceDoFrame);
    if (!recorte) return;

    const alfa = alfaDeInterpolacao === undefined ? 1 : alfaDeInterpolacao;
    const x = jogador.anteriorX + (jogador.posicaoX - jogador.anteriorX) * alfa;
    const y = jogador.anteriorY + (jogador.posicaoY - jogador.anteriorY) * alfa;

    desenharRastroDoSprint(contextoDoCanvas, posicaoDaCamera);
    desenharSombraDoJogador(contextoDoCanvas, x - posicaoDaCamera, y);

    const medidas = calcularMedidasDeDesenho(recorte, x - posicaoDaCamera, y);

    contextoDoCanvas.save();
    contextoDoCanvas.imageSmoothingEnabled = true;
    contextoDoCanvas.imageSmoothingQuality = "high";

    if (devePiscarPorInvencibilidade()) contextoDoCanvas.globalAlpha = 0.4;
    if (recorte.usarMisturaAditiva) contextoDoCanvas.globalCompositeOperation = "lighter";

    desenharQuadroDoJogador(contextoDoCanvas, recorte, medidas);

    contextoDoCanvas.restore();
}

// Fantasminhas atrás do astronauta durante o sprint.
function desenharRastroDoSprint(contextoDoCanvas, posicaoDaCamera) {
    if (typeof efeitos === "undefined" || !efeitos.rastro.length) return;

    contextoDoCanvas.save();
    contextoDoCanvas.globalCompositeOperation = "lighter";

    efeitos.rastro.forEach((fantasma) => {
        const recorte = obterRecorteDoFrame(fantasma.animacao, fantasma.frame);
        if (!recorte) return;

        const medidas = calcularMedidasDeDesenho(
            recorte, fantasma.x - posicaoDaCamera, fantasma.y, 1, 1
        );

        contextoDoCanvas.globalAlpha = fantasma.vida * 0.26;

        const olhando = jogador.olhandoPara;
        jogador.olhandoPara = fantasma.olhandoPara;
        desenharQuadroDoJogador(contextoDoCanvas, recorte, medidas);
        jogador.olhandoPara = olhando;
    });

    contextoDoCanvas.restore();
}

// Sombra elíptica: some e encolhe conforme o astronauta sobe.
function desenharSombraDoJogador(contextoDoCanvas, x, y) {
    if (typeof POSICAO_DO_CHAO === "undefined") return;

    const apoio = typeof jogador.alturaDoApoio === "number" ? jogador.alturaDoApoio : POSICAO_DO_CHAO;
    const distancia = Math.max(0, apoio - (y + jogador.altura));
    const proximidade = Math.max(0, 1 - distancia / 190);

    if (proximidade <= 0.02) return;

    contextoDoCanvas.save();
    contextoDoCanvas.globalAlpha = 0.34 * proximidade;
    contextoDoCanvas.fillStyle = "#05010f";
    contextoDoCanvas.beginPath();
    contextoDoCanvas.ellipse(
        x + jogador.largura / 2, apoio - 2,
        22 * (0.55 + proximidade * 0.45), 5.5 * (0.5 + proximidade * 0.5),
        0, 0, Math.PI * 2
    );
    contextoDoCanvas.fill();
    contextoDoCanvas.restore();
}

function desenharQuadroDoJogador(contextoDoCanvas, recorte, medidas) {
    if (jogador.olhandoPara === -1) {
        contextoDoCanvas.save();
        contextoDoCanvas.translate(medidas.x + medidas.largura, medidas.y);
        contextoDoCanvas.scale(-1, 1);
        contextoDoCanvas.drawImage(
            recorte.fonte,
            recorte.origemX, recorte.origemY, recorte.largura, recorte.altura,
            0, 0, medidas.largura, medidas.altura
        );
        contextoDoCanvas.restore();
        return;
    }

    contextoDoCanvas.drawImage(
        recorte.fonte,
        recorte.origemX, recorte.origemY, recorte.largura, recorte.altura,
        medidas.x, medidas.y, medidas.largura, medidas.altura
    );
}

function escolherAnimacaoDisponivel(estado) {
    if (typeof aSpriteEstaPronta !== "function") return null;

    let nome = estado;
    for (let tentativa = 0; tentativa < 5 && nome; tentativa++) {
        if (aSpriteEstaPronta(nome)) return nome;
        nome = ANIMACAO_RESERVA[nome];
    }
    return null;
}

// Ancorado no CENTRO horizontal e nos PÉS: trocar de animação,
// de escala ou dar squash nunca desloca o personagem.
function calcularMedidasDeDesenho(recorte, telaX, telaY, forcarEscalaX, forcarEscalaY) {
    const escalaX = forcarEscalaX === undefined ? jogador.escalaX : forcarEscalaX;
    const escalaY = forcarEscalaY === undefined ? jogador.escalaY : forcarEscalaY;

    const largura = Math.round(jogador.largura * recorte.escalaDeDesenho * escalaX);
    const altura = Math.round(jogador.altura * recorte.escalaDeDesenho * escalaY);

    const centroX = telaX + jogador.largura / 2;
    const baseY = telaY + jogador.altura;

    return {
        largura,
        altura,
        x: Math.round(centroX - largura / 2 + recorte.deslocamentoX),
        y: Math.round(baseY - altura + recorte.deslocamentoY),
    };
}

function devePiscarPorInvencibilidade() {
    const momentoAtual = performance.now();
    const estaInvencivel = momentoAtual < jogador.invencivelAte;
    return estaInvencivel && Math.floor(momentoAtual / 70) % 2 === 0;
}
