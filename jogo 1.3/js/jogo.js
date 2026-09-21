// ======================================================
// jogo.js — Motor do jogo
// Loop de passo fixo, física, plataformas, inimigos, câmera, HUD.
//
// Usa: astronauta.js (personagem), sprites.js (imagens),
//      cenario-fase.js (fundo), efeitos.js (partículas), audio.js (som),
//      fases.js (dados das fases), chefe.js (o Mecha).
//
// IMPORTANTE: este precisa ser o ÚLTIMO <script> do HTML. Ele inicia o loop
// do jogo ao terminar de carregar e depende de todos os outros já existirem.
// ======================================================

const telaDoJogo = document.getElementById("gameCanvas");
const contextoDoCanvas = telaDoJogo.getContext("2d");

const LARGURA_DA_TELA = 960;
const ALTURA_DA_TELA = 540;
const POSICAO_DO_CHAO = ALTURA_DA_TELA - 70;

// O comprimento do nível vem da fase atual (js/fases.js). Tudo que depende
// dele (câmera, parallax, barra de progresso) se ajusta sozinho.
let larguraDoNivel = FASES[0].larguraDoNivel;

const AJUSTES_DE_JOGO = {
    // Física roda em passo fixo. O desenho interpola entre dois passos,
    // então a imagem fica lisa em 60, 120 ou 144 Hz sem mudar a jogabilidade.
    passoFixo: 1000 / 120,
    maximoDePassosPorQuadro: 6,

    // Câmera
    zonaMortaDaCamera: 46,       // o astronauta anda isso no centro sem mover a câmera
    suavidadeDaCamera: 0.14,
    anteciparOlhar: 88,          // olha à frente na direção do movimento
    suavidadeDoOlhar: 0.06,

    // Combate
    alcanceDoGolpe: 62,
    danoDoGolpe: 18,
    danoDeContato: 10,
    empurraoNoInimigo: 7.5,
};

const AJUSTES_DAS_FASES = {
    duracaoDoCartao: 2600,          // ms que o cartão "FASE N" fica na tela
    duracaoDaEntradaNoPortal: 900,  // ms do astronauta sendo sugado pelo portal
};

const AJUSTES_DO_PORTAL = {
    largura: 96,
    altura: 170,
    raioDeEntrada: 30,              // distância (centro a centro) pra "entrar" no portal
};

// ---------- Escala de tela (nitidez em telas de alta densidade) ----------

function ajustarResolucaoDaTela() {
    const densidade = Math.min(3, window.devicePixelRatio || 1);

    telaDoJogo.width = Math.round(LARGURA_DA_TELA * densidade);
    telaDoJogo.height = Math.round(ALTURA_DA_TELA * densidade);
    telaDoJogo.style.width = "100%";
    telaDoJogo.style.height = "auto";

    return densidade;
}

let densidadeDaTela = ajustarResolucaoDaTela();

if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("resize", () => { densidadeDaTela = ajustarResolucaoDaTela(); });
}

// ---------- Estado global ----------

const camera = { x: 0, olhar: 0 };

let posicaoDaCamera = 0;
let momentoDoUltimoFrame = 0;
let acumuladorDeTempo = 0;
let jogoEncerrado = false;      // true = física parada (portal, telas de fim, etc.)
let abatidos = 0;               // aliens derrotados NA FASE ATUAL
let abatidosAcumulados = 0;     // aliens das fases já concluídas
let melhorCombo = 0;
let vidaExibida = 100;

// Fluxo do jogo:
//   "jogando" → (toca no portal) "entrandoNoPortal" → "entreFases" (fim da Fase 1)
//                                                   → "vitoria"    (fim da última fase)
//   vida chegando a 0, em qualquer momento → "derrota"
let fluxo = "jogando";
let tempoNoFluxo = 0;

// Fase atual (tudo abaixo é preenchido por carregarFase()).
let indiceDaFase = 0;
let faseAtual = FASES[0];
let cenarioDaFase = null;
let portal = null;

const cartaoDaFase = { tempo: 0 };   // ms restantes do cartão "FASE N"

// ---------- Plataformas ----------
// Regra de plataforma "de um lado só": o astronauta atravessa por baixo
// e pousa por cima. Seta pra baixo desce de propósito.

function criarPlataformas(fase) {
    return fase.plataformas.map(([x, y, largura]) => ({ x, y, largura, altura: 28 }));
}

let plataformas = [];

function encontrarApoioAbaixo(x, largura, y) {
    let apoio = POSICAO_DO_CHAO;

    plataformas.forEach((plataforma) => {
        const dentro = x + largura > plataforma.x && x < plataforma.x + plataforma.largura;
        if (dentro && plataforma.y >= y && plataforma.y < apoio) apoio = plataforma.y;
    });

    return apoio;
}

// ---------- Inimigos ----------

function criarInimigos(fase) {
    const receitas = fase.inimigos;

    return receitas.map((receita, indice) => {
        const flutuante = receita.tipo === "flutuante";
        const tamanho = flutuante ? 40 : 44;
        const base = receita.emPlataforma !== undefined ? receita.emPlataforma : POSICAO_DO_CHAO;

        return {
            tipo: receita.tipo,
            posicaoX: receita.x,
            posicaoY: flutuante ? receita.altura : base - tamanho,
            baseY: flutuante ? receita.altura : base - tamanho,
            largura: tamanho,
            altura: tamanho,
            vida: flutuante ? 36 : 45,
            vidaMaxima: flutuante ? 36 : 45,
            vivo: true,
            limiteEsquerdo: receita.x - receita.alcance,
            limiteDireito: receita.x + receita.alcance,
            direcao: indice % 2 === 0 ? 1 : -1,
            velocidade: flutuante ? 1.35 : 1.05 + (indice % 3) * 0.22,
            tempoDeAnimacao: Math.random() * Math.PI * 2,
            brilhoDeDano: 0,
            empurraoX: 0,
            olharX: 0,
            olharY: 0,
        };
    });
}

let inimigos = [];

// ---------- Colisão ----------

function retangulosColidem(aX, aY, aLargura, aAltura, bX, bY, bLargura, bAltura) {
    return aX < bX + bLargura && aX + aLargura > bX && aY < bY + bAltura && aY + aAltura > bY;
}

function aplicarGolpeEmInimigos() {
    const caixa = caixaDoJogador();
    const golpeX = jogador.olhandoPara === 1
        ? caixa.x + caixa.largura
        : caixa.x - AJUSTES_DE_JOGO.alcanceDoGolpe;

    let acertouAlguem = false;

    inimigos.forEach((inimigo) => {
        if (!inimigo.vivo) return;

        const acertou = retangulosColidem(
            golpeX, caixa.y - 10, AJUSTES_DE_JOGO.alcanceDoGolpe, caixa.altura + 20,
            inimigo.posicaoX, inimigo.posicaoY, inimigo.largura, inimigo.altura
        );
        if (!acertou) return;

        acertouAlguem = true;
        aplicarDanoNoInimigo(inimigo);
    });

    // CHEFE: mesmo golpe, mesma caixa — só testa contra ele também.
    if (chefe.vivo) {
        const caixaChefe = caixaDoChefe();
        const acertouChefe = retangulosColidem(
            golpeX, caixa.y - 10, AJUSTES_DE_JOGO.alcanceDoGolpe, caixa.altura + 20,
            caixaChefe.x, caixaChefe.y, caixaChefe.largura, caixaChefe.altura
        );

        if (acertouChefe) {
            acertouAlguem = true;
            aplicarDanoNoChefe();
        }
    }

    if (acertouAlguem) {
        registrarAcertoNoInimigo();
        melhorCombo = Math.max(melhorCombo, jogador.combo);
        congelarQuadro(85);
        tremerTela(7, 180);
        somDeAcerto();
    } else {
        tremerTela(2, 90);
    }
}

function aplicarDanoNoInimigo(inimigo) {
    const dano = AJUSTES_DE_JOGO.danoDoGolpe + Math.min(12, jogador.combo * 2);

    inimigo.vida -= dano;
    inimigo.brilhoDeDano = 1;
    inimigo.empurraoX = jogador.olhandoPara * AJUSTES_DE_JOGO.empurraoNoInimigo;

    const centroX = inimigo.posicaoX + inimigo.largura / 2;
    const centroY = inimigo.posicaoY + inimigo.altura / 2;

    emitirFaiscasDeImpacto(centroX, centroY, jogador.olhandoPara);
    mostrarTextoFlutuante(centroX, centroY - 16, String(dano), "#9fe6ff", 17);

    if (inimigo.vida > 0) return;

    inimigo.vivo = false;
    abatidos++;

    emitirExplosaoDeInimigo(centroX, centroY);
    clarearTela(0.7, "255,140,170");
    tremerTela(11, 240);
    somDeInimigoDerrotado();

    if (jogador.combo >= 2) {
        mostrarTextoFlutuante(centroX, centroY - 42, jogador.combo + "x COMBO!", "#ffd97d", 20);
    }
}

// ---------- Entrada do teclado ----------

const teclasPressionadas = {};

const TECLAS_DE_PULO = ["ArrowUp", " ", "w", "W"];
const TECLAS_DE_ATAQUE = ["x", "X", "z", "Z", "j", "J"];

document.addEventListener("keydown", (evento) => {
    if (teclasPressionadas[evento.key]) return;   // ignora auto-repeat do teclado
    teclasPressionadas[evento.key] = true;

    if (TECLAS_DE_PULO.includes(evento.key)) { pular(); evento.preventDefault(); }
    if (TECLAS_DE_ATAQUE.includes(evento.key)) atacar();
    if (evento.key === "m" || evento.key === "M") alternarSom();
    if (evento.key === "r" || evento.key === "R") aoApertarReiniciar();

    // Enter aciona o botão principal da tela que estiver aberta.
    if (evento.key === "Enter") {
        const botao = document.querySelector(".tela-overlay:not(.escondida) [data-principal]");
        if (botao) { botao.click(); evento.preventDefault(); }
    }
});

// Alt+Tab com uma tecla apertada não deve deixar o astronauta andando sozinho.
window.addEventListener("blur", () => {
    Object.keys(teclasPressionadas).forEach((tecla) => { teclasPressionadas[tecla] = false; });
});

document.addEventListener("keyup", (evento) => {
    teclasPressionadas[evento.key] = false;

    if (TECLAS_DE_PULO.includes(evento.key)) soltarPulo();
});

function processarEntradaDoJogador() {
    if (jogador.estado === "morto") { jogador.direcaoDesejada = 0; return; }

    definirSprintDesejado(teclasPressionadas["Shift"] === true);

    const direita = teclasPressionadas["ArrowRight"] || teclasPressionadas["d"] || teclasPressionadas["D"];
    const esquerda = teclasPressionadas["ArrowLeft"] || teclasPressionadas["a"] || teclasPressionadas["A"];

    if (direita && !esquerda) moverParaDireita();
    else if (esquerda && !direita) moverParaEsquerda();
    else ficarParado();
}

function querDescerDaPlataforma() {
    return teclasPressionadas["ArrowDown"] === true || teclasPressionadas["s"] === true;
}

// ---------- Física ----------

function passoDeFisica(tempoDecorrido) {
    const passo = tempoDecorrido / 16.6667;

    jogador.anteriorX = jogador.posicaoX;
    jogador.anteriorY = jogador.posicaoY;

    processarEntradaDoJogador();
    atualizarTemporizadoresDoJogador(tempoDecorrido);
    tentarExecutarPuloPendente();

    moverJogadorNaHorizontal(passo);
    moverJogadorNaVertical(passo, tempoDecorrido);

    atualizarEstadoDoJogador();
    atualizarAnimacaoDoJogador(tempoDecorrido);
    registrarRastroSeCorrendo();

    atualizarInimigos(passo, tempoDecorrido);
    atualizarChefe(passo, tempoDecorrido); // CHEFE
    atualizarCamera(passo);

    jogador.alturaDoApoio = encontrarApoioAbaixo(
        jogador.posicaoX + jogador.margemDeColisaoX,
        jogador.largura - jogador.margemDeColisaoX * 2,
        jogador.posicaoY + jogador.altura
    );
}

function moverJogadorNaHorizontal(passo) {
    // Logo depois de levar dano o controle fica travado, senão o jogador
    // cancela o empurrão só de segurar a seta e o golpe não tem consequência.
    if (jogador.tempoSemControle > 0) {
        jogador.velocidadeX *= Math.pow(0.94, passo);
        jogador.posicaoX += jogador.velocidadeX * passo;
        limitarJogadorAoNivel();
        return;
    }

    const alvo = jogador.direcaoDesejada * velocidadeMaximaAtual();
    const querMover = jogador.direcaoDesejada !== 0;

    let taxa;
    if (jogador.estaNoChao) {
        taxa = querMover ? CONFIGURACOES.aceleracaoNoChao : CONFIGURACOES.atritoNoChao;
    } else {
        taxa = querMover ? CONFIGURACOES.aceleracaoNoAr : CONFIGURACOES.atritoNoAr;
    }

    // Atacando no chão o astronauta freia: o golpe prende os pés.
    if (jogador.estado === "atacando" && jogador.estaNoChao) taxa = CONFIGURACOES.atritoNoChao * 0.8;

    jogador.velocidadeX = aproximar(jogador.velocidadeX, alvo, taxa * passo);
    jogador.posicaoX += jogador.velocidadeX * passo;
    limitarJogadorAoNivel();
}

function limitarJogadorAoNivel() {
    const limite = larguraDoNivel - jogador.largura;
    if (jogador.posicaoX < 0) { jogador.posicaoX = 0; jogador.velocidadeX = 0; }
    if (jogador.posicaoX > limite) { jogador.posicaoX = limite; jogador.velocidadeX = 0; }

    // CHEFE: enquanto ele estiver vivo, uma parede invisível impede
    // seguir além da arena — some assim que ele é derrotado.
    const barreira = limiteDaBarreiraDoChefe();
    if (barreira !== null && jogador.posicaoX > barreira) {
        jogador.posicaoX = barreira;
        if (jogador.velocidadeX > 0) jogador.velocidadeX = 0;
    }
}

function aproximar(valor, alvo, passoMaximo) {
    if (valor < alvo) return Math.min(alvo, valor + passoMaximo);
    if (valor > alvo) return Math.max(alvo, valor - passoMaximo);
    return alvo;
}

function moverJogadorNaVertical(passo, tempoDecorrido) {
    const baseAnterior = jogador.posicaoY + jogador.altura;

    jogador.velocidadeY += gravidadeAtual() * passo;
    jogador.velocidadeY = Math.min(jogador.velocidadeY, CONFIGURACOES.velocidadeMaximaDeQueda);
    jogador.posicaoY += jogador.velocidadeY * passo;

    const baseAtual = jogador.posicaoY + jogador.altura;
    const estavaNoChao = jogador.estaNoChao;
    jogador.estaNoChao = false;

    const apoio = procurarApoioAtravessado(baseAnterior, baseAtual);

    if (apoio !== null) {
        jogador.posicaoY = apoio - jogador.altura;
        if (!estavaNoChao) aoAterrissar(jogador.velocidadeY);
        else { jogador.estaNoChao = true; jogador.velocidadeY = 0; }
        return;
    }

    // Bateu a cabeça no topo da tela
    if (jogador.posicaoY < -40) {
        jogador.posicaoY = -40;
        jogador.velocidadeY = 0;
    }
}

// Procura o apoio mais alto que o pé do jogador cruzou neste passo.
function procurarApoioAtravessado(baseAnterior, baseAtual) {
    if (jogador.velocidadeY < 0) return null;

    let melhor = null;

    if (baseAtual >= POSICAO_DO_CHAO) melhor = POSICAO_DO_CHAO;

    if (!querDescerDaPlataforma()) {
        const caixa = caixaDoJogador();
        const esquerda = jogador.posicaoX + jogador.margemDeColisaoX;
        const largura = jogador.largura - jogador.margemDeColisaoX * 2;

        plataformas.forEach((plataforma) => {
            const dentro = esquerda + largura > plataforma.x && esquerda < plataforma.x + plataforma.largura;
            if (!dentro) return;

            const cruzou = baseAnterior <= plataforma.y + 1 && baseAtual >= plataforma.y;
            if (!cruzou) return;

            if (melhor === null || plataforma.y < melhor) melhor = plataforma.y;
        });
    }

    return melhor;
}

function gravidadeAtual() {
    const base = CONFIGURACOES.gravidade;

    if (jogador.velocidadeY > 0.5) return base * CONFIGURACOES.multiplicadorDeQueda;
    if (Math.abs(jogador.velocidadeY) <= 0.5) return base * CONFIGURACOES.flutuacaoNoApice;
    if (!jogador.seguraPulo) return base * CONFIGURACOES.multiplicadorDeSubidaCurta;

    return base;
}

function registrarRastroSeCorrendo() {
    if (jogador.estado !== "correndo") return;
    if (Math.abs(jogador.velocidadeX) < 4) return;

    registrarRastro(
        jogador.posicaoX, jogador.posicaoY,
        "correndo", jogador.indiceDoFrame, jogador.olhandoPara, 1
    );
}

// ---------- Inimigos ----------

function atualizarInimigos(passo, tempoDecorrido) {
    const centroDoJogador = jogador.posicaoX + jogador.largura / 2;
    const meioDoJogador = jogador.posicaoY + jogador.altura / 2;

    inimigos.forEach((inimigo) => {
        if (!inimigo.vivo) return;

        inimigo.brilhoDeDano = Math.max(0, inimigo.brilhoDeDano - tempoDecorrido / 120);

        if (Math.abs(inimigo.empurraoX) > 0.05) {
            inimigo.posicaoX += inimigo.empurraoX * passo;
            inimigo.empurraoX *= Math.pow(0.82, passo);
        } else {
            inimigo.posicaoX += inimigo.direcao * inimigo.velocidade * passo;

            if (inimigo.posicaoX < inimigo.limiteEsquerdo) { inimigo.posicaoX = inimigo.limiteEsquerdo; inimigo.direcao = 1; }
            if (inimigo.posicaoX > inimigo.limiteDireito) { inimigo.posicaoX = inimigo.limiteDireito; inimigo.direcao = -1; }
        }

        inimigo.tempoDeAnimacao += 0.055 * passo;

        if (inimigo.tipo === "flutuante") {
            inimigo.posicaoY = inimigo.baseY + Math.sin(inimigo.tempoDeAnimacao * 0.8) * 22;
        }

        // Os olhos acompanham o astronauta: barato e deixa o bicho "vivo".
        const alvoX = centroDoJogador - (inimigo.posicaoX + inimigo.largura / 2);
        const alvoY = meioDoJogador - (inimigo.posicaoY + inimigo.altura / 2);
        const distancia = Math.max(1, Math.hypot(alvoX, alvoY));
        inimigo.olharX = (alvoX / distancia) * 2.6;
        inimigo.olharY = (alvoY / distancia) * 2.2;

        verificarDanoPorContato(inimigo);
    });
}

function verificarDanoPorContato(inimigo) {
    if (performance.now() < jogador.invencivelAte) return;
    if (jogador.estado === "morto") return;

    const caixa = caixaDoJogador();
    const encostou = retangulosColidem(
        caixa.x, caixa.y, caixa.largura, caixa.altura,
        inimigo.posicaoX, inimigo.posicaoY, inimigo.largura, inimigo.altura
    );

    if (encostou) tomarDano(AJUSTES_DE_JOGO.danoDeContato, inimigo.posicaoX + inimigo.largura / 2);
}

// ---------- Câmera ----------

function atualizarCamera(passo) {
    const centroDoJogador = jogador.posicaoX + jogador.largura / 2;

    // Antecipa o olhar na direção em que o astronauta está indo.
    const olharAlvo = (jogador.velocidadeX / Math.max(1, velocidadeMaximaAtual())) * AJUSTES_DE_JOGO.anteciparOlhar;
    camera.olhar += (olharAlvo - camera.olhar) * Math.min(1, AJUSTES_DE_JOGO.suavidadeDoOlhar * passo);

    const alvo = centroDoJogador + camera.olhar - LARGURA_DA_TELA / 2;
    const distancia = alvo - camera.x;

    // Zona morta: pequenos ajustes não sacodem a tela.
    if (Math.abs(distancia) > AJUSTES_DE_JOGO.zonaMortaDaCamera) {
        const excesso = distancia - Math.sign(distancia) * AJUSTES_DE_JOGO.zonaMortaDaCamera;
        camera.x += excesso * Math.min(1, AJUSTES_DE_JOGO.suavidadeDaCamera * passo);
    }

    camera.x = Math.max(0, Math.min(larguraDoNivel - LARGURA_DA_TELA, camera.x));
    posicaoDaCamera = camera.x;
}

// ---------- Desenho ----------

function desenharTudo(alfaDeInterpolacao) {
    const camaraX = posicaoDaCamera + efeitos.tremor.deslocamentoX;
    const tremorY = efeitos.tremor.deslocamentoY;

    contextoDoCanvas.setTransform(densidadeDaTela, 0, 0, densidadeDaTela, 0, 0);
    contextoDoCanvas.clearRect(0, 0, LARGURA_DA_TELA, ALTURA_DA_TELA);

    contextoDoCanvas.save();
    contextoDoCanvas.translate(0, tremorY);

    desenharFundoDaFase(contextoDoCanvas, cenarioDaFase, camaraX);
    desenharPlataformas(camaraX);
    desenharPortal(camaraX);
    desenharInimigos(camaraX);
    desenharChefe(camaraX); // CHEFE
    desenharJogadorComEfeitoDePortal(camaraX, alfaDeInterpolacao);
    desenharParticulas(contextoDoCanvas, camaraX);
    desenharTextosFlutuantes(contextoDoCanvas, camaraX);
    desenharPoeiraDaFrente(contextoDoCanvas, cenarioDaFase, camaraX);

    contextoDoCanvas.restore();

    desenharVinheta(contextoDoCanvas, cenarioDaFase);
    desenharFlashDaTela(contextoDoCanvas);
    desenharPainelDoJogador();
    desenharCartaoDaFase();
}

function desenharPlataformas(camaraX) {
    const imagem = BANCO_DE_SPRITES.plataforma && BANCO_DE_SPRITES.plataforma.imagem;

    plataformas.forEach((plataforma) => {
        const x = plataforma.x - camaraX;
        if (x + plataforma.largura < -40 || x > LARGURA_DA_TELA + 40) return;

        if (imagem && imagem.complete && imagem.naturalWidth) {
            const larguraDoLadrilho = imagem.naturalWidth;
            for (let deslocamento = 0; deslocamento < plataforma.largura; deslocamento += larguraDoLadrilho) {
                const largura = Math.min(larguraDoLadrilho, plataforma.largura - deslocamento);
                contextoDoCanvas.drawImage(
                    imagem, 0, 0, largura, imagem.naturalHeight,
                    Math.round(x + deslocamento), Math.round(plataforma.y),
                    largura, plataforma.altura
                );
            }
        } else {
            desenharPlataformaDesenhada(x, plataforma);
        }

        desenharLinhaDeEnergia(contextoDoCanvas, cenarioDaFase, plataforma.y, plataforma.largura, x);
    });
}

function desenharPlataformaDesenhada(x, plataforma) {
    const corpo = contextoDoCanvas.createLinearGradient(0, plataforma.y, 0, plataforma.y + plataforma.altura);
    corpo.addColorStop(0, "#3a2569");
    corpo.addColorStop(1, "#160c2e");

    contextoDoCanvas.fillStyle = corpo;
    contextoDoCanvas.fillRect(x, plataforma.y, plataforma.largura, plataforma.altura);

    contextoDoCanvas.fillStyle = "rgba(0,0,0,0.35)";
    contextoDoCanvas.fillRect(x, plataforma.y + plataforma.altura - 5, plataforma.largura, 5);
}

function desenharInimigos(camaraX) {
    inimigos.forEach((inimigo) => {
        if (!inimigo.vivo) return;

        const x = inimigo.posicaoX - camaraX;
        if (x < -70 || x > LARGURA_DA_TELA + 70) return;

        if (inimigo.tipo === "flutuante") desenharInimigoFlutuante(inimigo, x);
        else desenharInimigoRastejante(inimigo, x);

        desenharBarraDeVidaDoInimigo(inimigo, x);
    });
}

function desenharInimigoRastejante(inimigo, x) {
    const centroX = x + inimigo.largura / 2;
    const pulso = Math.sin(inimigo.tempoDeAnimacao * 1.6);
    const raio = inimigo.largura / 2;
    const centroY = inimigo.posicaoY + inimigo.altura / 2 + pulso * 1.6;

    contextoDoCanvas.save();

    desenharAuraDoInimigo(centroX, centroY, raio * 2.1, "255,90,120", 0.3);

    // Tentáculos
    contextoDoCanvas.strokeStyle = "#7a1030";
    contextoDoCanvas.lineWidth = 5;
    contextoDoCanvas.lineCap = "round";
    for (let i = 0; i < 4; i++) {
        const base = centroX - raio * 0.62 + (raio * 1.24 * i) / 3;
        const balanco = Math.sin(inimigo.tempoDeAnimacao * 2.2 + i) * 5;

        contextoDoCanvas.beginPath();
        contextoDoCanvas.moveTo(base, centroY + raio * 0.35);
        contextoDoCanvas.quadraticCurveTo(
            base + balanco, centroY + raio * 0.95,
            base + balanco * 1.5, inimigo.posicaoY + inimigo.altura + 3
        );
        contextoDoCanvas.stroke();
    }

    // Corpo
    const corpo = contextoDoCanvas.createRadialGradient(
        centroX - raio * 0.35, centroY - raio * 0.45, raio * 0.15,
        centroX, centroY, raio
    );
    corpo.addColorStop(0, "#ff9fb3");
    corpo.addColorStop(0.45, "#e03a5c");
    corpo.addColorStop(1, "#6d0a22");

    contextoDoCanvas.fillStyle = corpo;
    contextoDoCanvas.beginPath();
    contextoDoCanvas.ellipse(centroX, centroY, raio, raio * (1 - pulso * 0.07), 0, 0, Math.PI * 2);
    contextoDoCanvas.fill();

    // Luz de cima
    contextoDoCanvas.globalAlpha = 0.5;
    contextoDoCanvas.strokeStyle = "#ffd2dc";
    contextoDoCanvas.lineWidth = 2;
    contextoDoCanvas.beginPath();
    contextoDoCanvas.arc(centroX, centroY, raio - 1.5, Math.PI * 1.15, Math.PI * 1.85);
    contextoDoCanvas.stroke();
    contextoDoCanvas.globalAlpha = 1;

    desenharOlhosDoInimigo(inimigo, centroX, centroY - raio * 0.1, raio * 0.3, 2);
    aplicarBrilhoDeDano(inimigo, centroX, centroY, raio);

    contextoDoCanvas.restore();
}

function desenharInimigoFlutuante(inimigo, x) {
    const centroX = x + inimigo.largura / 2;
    const centroY = inimigo.posicaoY + inimigo.altura / 2;
    const raio = inimigo.largura / 2;

    contextoDoCanvas.save();

    desenharAuraDoInimigo(centroX, centroY, raio * 2.4, "160,107,255", 0.35);

    // Anel de energia girando
    contextoDoCanvas.save();
    contextoDoCanvas.translate(centroX, centroY);
    contextoDoCanvas.rotate(inimigo.tempoDeAnimacao * 0.9);
    contextoDoCanvas.scale(1, 0.34);
    contextoDoCanvas.strokeStyle = "rgba(199,123,255,0.85)";
    contextoDoCanvas.lineWidth = 3;
    contextoDoCanvas.beginPath();
    contextoDoCanvas.arc(0, 0, raio * 1.55, 0, Math.PI * 2);
    contextoDoCanvas.stroke();
    contextoDoCanvas.restore();

    const corpo = contextoDoCanvas.createRadialGradient(
        centroX - raio * 0.3, centroY - raio * 0.4, raio * 0.15,
        centroX, centroY, raio
    );
    corpo.addColorStop(0, "#e5d2ff");
    corpo.addColorStop(0.45, "#9b5cf0");
    corpo.addColorStop(1, "#33115e");

    contextoDoCanvas.fillStyle = corpo;
    contextoDoCanvas.beginPath();
    contextoDoCanvas.ellipse(centroX, centroY, raio * 0.92, raio, 0, 0, Math.PI * 2);
    contextoDoCanvas.fill();

    desenharOlhosDoInimigo(inimigo, centroX, centroY - raio * 0.05, raio * 0.36, 1);
    aplicarBrilhoDeDano(inimigo, centroX, centroY, raio);

    contextoDoCanvas.restore();
}

function desenharAuraDoInimigo(centroX, centroY, raio, cor, forca) {
    const aura = contextoDoCanvas.createRadialGradient(centroX, centroY, raio * 0.3, centroX, centroY, raio);
    aura.addColorStop(0, "rgba(" + cor + "," + forca + ")");
    aura.addColorStop(1, "rgba(" + cor + ",0)");

    contextoDoCanvas.fillStyle = aura;
    contextoDoCanvas.beginPath();
    contextoDoCanvas.arc(centroX, centroY, raio, 0, Math.PI * 2);
    contextoDoCanvas.fill();
}

function desenharOlhosDoInimigo(inimigo, centroX, centroY, raio, quantidade) {
    const separacao = quantidade === 2 ? raio * 1.5 : 0;

    for (let i = 0; i < quantidade; i++) {
        const olhoX = centroX + (quantidade === 2 ? (i === 0 ? -separacao : separacao) : 0);

        contextoDoCanvas.fillStyle = "#fdfbff";
        contextoDoCanvas.beginPath();
        contextoDoCanvas.ellipse(olhoX, centroY, raio, raio * 1.12, 0, 0, Math.PI * 2);
        contextoDoCanvas.fill();

        contextoDoCanvas.fillStyle = "#1b0520";
        contextoDoCanvas.beginPath();
        contextoDoCanvas.arc(olhoX + inimigo.olharX, centroY + inimigo.olharY, raio * 0.52, 0, Math.PI * 2);
        contextoDoCanvas.fill();

        contextoDoCanvas.fillStyle = "rgba(255,255,255,0.9)";
        contextoDoCanvas.beginPath();
        contextoDoCanvas.arc(olhoX + inimigo.olharX - raio * 0.2, centroY + inimigo.olharY - raio * 0.25, raio * 0.17, 0, Math.PI * 2);
        contextoDoCanvas.fill();
    }
}

// Clarão branco por cima do inimigo no instante do golpe.
function aplicarBrilhoDeDano(inimigo, centroX, centroY, raio) {
    if (inimigo.brilhoDeDano <= 0.01) return;

    contextoDoCanvas.globalCompositeOperation = "lighter";
    contextoDoCanvas.globalAlpha = inimigo.brilhoDeDano * 0.55;
    contextoDoCanvas.fillStyle = "#ffffff";
    contextoDoCanvas.beginPath();
    contextoDoCanvas.arc(centroX, centroY, raio * 0.96, 0, Math.PI * 2);
    contextoDoCanvas.fill();
    contextoDoCanvas.globalAlpha = 1;
    contextoDoCanvas.globalCompositeOperation = "source-over";
}

function desenharBarraDeVidaDoInimigo(inimigo, x) {
    if (inimigo.vida >= inimigo.vidaMaxima) return;

    const proporcao = Math.max(0, inimigo.vida / inimigo.vidaMaxima);
    const largura = inimigo.largura + 6;
    const y = inimigo.posicaoY - 13;

    contextoDoCanvas.fillStyle = "rgba(8,2,20,0.75)";
    contextoDoCanvas.fillRect(x - 3, y, largura, 5);

    contextoDoCanvas.fillStyle = proporcao > 0.4 ? "#ff5d78" : "#ffb14d";
    contextoDoCanvas.fillRect(x - 3, y, largura * proporcao, 5);

    contextoDoCanvas.strokeStyle = "rgba(255,255,255,0.35)";
    contextoDoCanvas.lineWidth = 1;
    contextoDoCanvas.strokeRect(x - 3.5, y - 0.5, largura + 1, 6);
}

// ---------- HUD ----------

function desenharPainelDoJogador() {
    desenharBarraDeVida();
    desenharContadores();
    desenharBarraDeProgresso();
    desenharAvisoDeComboAtivo();
    desenharBarraDoChefe(); // CHEFE
}

function desenharBarraDeVida() {
    const x = 18;
    const y = 18;
    const largura = 232;
    const altura = 20;

    // A barra "fantasma" desce devagar depois do dano: mostra quanto você perdeu.
    vidaExibida += (jogador.vida - vidaExibida) * 0.08;

    contextoDoCanvas.save();

    contextoDoCanvas.fillStyle = "rgba(8,2,22,0.72)";
    desenharRetanguloArredondado(x - 4, y - 4, largura + 8, altura + 8, 7);
    contextoDoCanvas.fill();

    contextoDoCanvas.fillStyle = "rgba(255,255,255,0.08)";
    desenharRetanguloArredondado(x, y, largura, altura, 5);
    contextoDoCanvas.fill();

    contextoDoCanvas.fillStyle = "rgba(255,110,140,0.45)";
    desenharRetanguloArredondado(x, y, largura * Math.max(0, vidaExibida / jogador.vidaMaxima), altura, 5);
    contextoDoCanvas.fill();

    const proporcao = Math.max(0, jogador.vida / jogador.vidaMaxima);
    const preenchimento = contextoDoCanvas.createLinearGradient(x, y, x + largura, y);
    preenchimento.addColorStop(0, proporcao > 0.3 ? "#3ddc97" : "#ff6b6b");
    preenchimento.addColorStop(1, proporcao > 0.3 ? "#7dd3fc" : "#ffa46b");

    contextoDoCanvas.fillStyle = preenchimento;
    desenharRetanguloArredondado(x, y, largura * proporcao, altura, 5);
    contextoDoCanvas.fill();

    // Divisórias a cada 20 de vida
    contextoDoCanvas.strokeStyle = "rgba(6,2,18,0.55)";
    contextoDoCanvas.lineWidth = 2;
    for (let i = 1; i < 5; i++) {
        const divisoriaX = x + (largura * i) / 5;
        contextoDoCanvas.beginPath();
        contextoDoCanvas.moveTo(divisoriaX, y);
        contextoDoCanvas.lineTo(divisoriaX, y + altura);
        contextoDoCanvas.stroke();
    }

    contextoDoCanvas.strokeStyle = "rgba(255,255,255,0.35)";
    contextoDoCanvas.lineWidth = 1.5;
    desenharRetanguloArredondado(x, y, largura, altura, 5);
    contextoDoCanvas.stroke();

    contextoDoCanvas.font = "bold 12px system-ui, sans-serif";
    contextoDoCanvas.fillStyle = "rgba(255,255,255,0.92)";
    contextoDoCanvas.textAlign = "left";
    contextoDoCanvas.fillText("VIDA  " + Math.ceil(jogador.vida), x + 8, y + 14);

    contextoDoCanvas.restore();
}

function desenharContadores() {
    contextoDoCanvas.save();
    contextoDoCanvas.font = "bold 13px system-ui, sans-serif";
    contextoDoCanvas.textAlign = "left";
    contextoDoCanvas.fillStyle = "rgba(255,255,255,0.75)";
    contextoDoCanvas.fillText("ALIENS  " + abatidos + " / " + inimigos.length, 20, 62);
    contextoDoCanvas.fillText("MELHOR COMBO  " + melhorCombo + "x", 20, 80);

    contextoDoCanvas.font = "bold 11px system-ui, sans-serif";
    contextoDoCanvas.fillStyle = "rgba(159,230,255,0.8)";
    contextoDoCanvas.fillText(
        "FASE " + (indiceDaFase + 1) + "/" + FASES.length + "  ·  " + faseAtual.nome.toUpperCase(),
        20, 100
    );
    contextoDoCanvas.restore();
}

function desenharBarraDeProgresso() {
    const largura = 210;
    const x = LARGURA_DA_TELA - largura - 20;
    const y = 22;
    const altura = 10;
    const progresso = Math.max(0, Math.min(1, jogador.posicaoX / (larguraDoNivel - jogador.largura)));

    contextoDoCanvas.save();

    contextoDoCanvas.fillStyle = "rgba(8,2,22,0.6)";
    desenharRetanguloArredondado(x - 4, y - 4, largura + 8, altura + 8, 6);
    contextoDoCanvas.fill();

    contextoDoCanvas.fillStyle = "rgba(255,255,255,0.1)";
    desenharRetanguloArredondado(x, y, largura, altura, 5);
    contextoDoCanvas.fill();

    const trilha = contextoDoCanvas.createLinearGradient(x, 0, x + largura, 0);
    trilha.addColorStop(0, "#7dd3fc");
    trilha.addColorStop(1, "#c77bff");
    contextoDoCanvas.fillStyle = trilha;
    desenharRetanguloArredondado(x, y, largura * progresso, altura, 5);
    contextoDoCanvas.fill();

    // Marcador do astronauta na trilha
    contextoDoCanvas.fillStyle = "#ffffff";
    contextoDoCanvas.beginPath();
    contextoDoCanvas.arc(x + largura * progresso, y + altura / 2, 5, 0, Math.PI * 2);
    contextoDoCanvas.fill();

    contextoDoCanvas.font = "bold 11px system-ui, sans-serif";
    contextoDoCanvas.textAlign = "right";
    contextoDoCanvas.fillStyle = portal.aberto ? "rgba(255,255,255,0.6)" : "rgba(255,140,120,0.85)";
    contextoDoCanvas.fillText(portal.aberto ? "PORTAL" : "PORTAL SELADO", x + largura, y + altura + 15);

    contextoDoCanvas.restore();
}

function desenharAvisoDeComboAtivo() {
    if (jogador.combo < 2) return;

    const forca = Math.max(0, jogador.tempoDoCombo / 1600);

    contextoDoCanvas.save();
    contextoDoCanvas.textAlign = "center";
    contextoDoCanvas.globalAlpha = 0.35 + forca * 0.65;
    contextoDoCanvas.font = "bold " + (26 + jogador.combo * 2) + "px system-ui, sans-serif";
    contextoDoCanvas.lineWidth = 5;
    contextoDoCanvas.strokeStyle = "rgba(6,2,18,0.8)";
    contextoDoCanvas.strokeText(jogador.combo + "x", LARGURA_DA_TELA / 2, 66);
    contextoDoCanvas.fillStyle = "#ffd97d";
    contextoDoCanvas.fillText(jogador.combo + "x", LARGURA_DA_TELA / 2, 66);
    contextoDoCanvas.restore();
}

function desenharRetanguloArredondado(x, y, largura, altura, raio) {
    const r = Math.min(raio, largura / 2, altura / 2);

    contextoDoCanvas.beginPath();
    contextoDoCanvas.moveTo(x + r, y);
    contextoDoCanvas.lineTo(x + largura - r, y);
    contextoDoCanvas.quadraticCurveTo(x + largura, y, x + largura, y + r);
    contextoDoCanvas.lineTo(x + largura, y + altura - r);
    contextoDoCanvas.quadraticCurveTo(x + largura, y + altura, x + largura - r, y + altura);
    contextoDoCanvas.lineTo(x + r, y + altura);
    contextoDoCanvas.quadraticCurveTo(x, y + altura, x, y + altura - r);
    contextoDoCanvas.lineTo(x, y + r);
    contextoDoCanvas.quadraticCurveTo(x, y, x + r, y);
    contextoDoCanvas.closePath();
}

// ---------- Cartão de início de fase ----------
// "FASE 1 / 2 — Campo de Aliens", aparece por alguns segundos e some.
// O jogo continua rodando por baixo: o jogador não fica esperando.

function desenharCartaoDaFase() {
    if (cartaoDaFase.tempo <= 0) return;

    const duracao = AJUSTES_DAS_FASES.duracaoDoCartao;
    const decorrido = duracao - cartaoDaFase.tempo;
    const entrada = Math.min(1, decorrido / 350);
    const saida = Math.min(1, cartaoDaFase.tempo / 600);
    const alfa = Math.min(entrada, saida);
    const deslize = (1 - entrada) * -14;
    const centroX = LARGURA_DA_TELA / 2;

    contextoDoCanvas.save();
    contextoDoCanvas.globalAlpha = alfa;
    contextoDoCanvas.textAlign = "center";

    // Faixa escura suave atrás do texto, para ele ler bem em qualquer fundo.
    const faixa = contextoDoCanvas.createLinearGradient(0, 0, LARGURA_DA_TELA, 0);
    faixa.addColorStop(0, "rgba(4,1,12,0)");
    faixa.addColorStop(0.25, "rgba(4,1,12,0.62)");
    faixa.addColorStop(0.75, "rgba(4,1,12,0.62)");
    faixa.addColorStop(1, "rgba(4,1,12,0)");
    contextoDoCanvas.fillStyle = faixa;
    contextoDoCanvas.fillRect(0, 138 + deslize, LARGURA_DA_TELA, 124);

    contextoDoCanvas.font = "bold 15px system-ui, sans-serif";
    contextoDoCanvas.fillStyle = "#9fe6ff";
    contextoDoCanvas.fillText("FASE " + (indiceDaFase + 1) + " / " + FASES.length, centroX, 172 + deslize);

    contextoDoCanvas.font = "bold 44px system-ui, sans-serif";
    contextoDoCanvas.lineWidth = 6;
    contextoDoCanvas.strokeStyle = "rgba(6,2,18,0.85)";
    contextoDoCanvas.strokeText(faseAtual.nome.toUpperCase(), centroX, 218 + deslize);
    contextoDoCanvas.fillStyle = "#ffffff";
    contextoDoCanvas.fillText(faseAtual.nome.toUpperCase(), centroX, 218 + deslize);

    contextoDoCanvas.font = "16px system-ui, sans-serif";
    contextoDoCanvas.fillStyle = "rgba(255,255,255,0.82)";
    contextoDoCanvas.fillText(faseAtual.subtitulo, centroX, 248 + deslize);

    contextoDoCanvas.restore();
}

// ---------- Portal ----------
// Fica no fim de cada fase. Na Fase 1 já nasce aberto. Na fase do chefe
// nasce SELADO e só abre quando o Mecha é derrotado (chefeBloqueiaOPortal).

function criarPortal(fase) {
    const aberto = !fase.chefe;

    return {
        x: fase.portal.x,
        aberto,
        abertura: aberto ? 1 : 0,   // 0 = selado ... 1 = aberto (animação suave)
        tempo: 0,
    };
}

function jogadorEstaNoPortal() {
    if (!portal.aberto) return false;

    const centro = jogador.posicaoX + jogador.largura / 2;
    const pesNoNivelDoPortal = jogador.posicaoY + jogador.altura >= POSICAO_DO_CHAO - AJUSTES_DO_PORTAL.altura;

    return pesNoNivelDoPortal && Math.abs(centro - portal.x) <= AJUSTES_DO_PORTAL.raioDeEntrada;
}

// Chamado a cada quadro (mesmo com a física parada, pra animação não congelar).
function atualizarPortal(tempoDecorrido) {
    portal.tempo += tempoDecorrido;

    if (!portal.aberto && !chefeBloqueiaOPortal()) {
        portal.aberto = true;
        anunciarPortalAberto();
    }

    const alvo = portal.aberto ? 1 : 0;
    portal.abertura += (alvo - portal.abertura) * Math.min(1, tempoDecorrido / 260);
    if (Math.abs(alvo - portal.abertura) < 0.004) portal.abertura = alvo;
}

function anunciarPortalAberto() {
    mostrarTextoFlutuante(portal.x, POSICAO_DO_CHAO - AJUSTES_DO_PORTAL.altura - 26, "PORTAL ABERTO!", "#9fe6ff", 22);
    clarearTela(0.7, "150,190,255");
    tremerTela(4, 220);
    if (typeof somDePortalAberto === "function") somDePortalAberto();
}

function desenharPortal(camaraX) {
    const x = portal.x - camaraX;
    if (x < -170 || x > LARGURA_DA_TELA + 170) return;

    const raioX = AJUSTES_DO_PORTAL.largura / 2;
    const raioY = AJUSTES_DO_PORTAL.altura / 2;
    const centroY = POSICAO_DO_CHAO - raioY - 4;
    const segundos = portal.tempo / 1000;

    contextoDoCanvas.save();

    // Os dois visuais se misturam durante a abertura (selado some, aberto surge).
    if (portal.abertura < 0.999) {
        contextoDoCanvas.globalAlpha = 1 - portal.abertura;
        desenharPortalSelado(x, centroY, raioX, raioY, segundos);
    }
    if (portal.abertura > 0.001) {
        contextoDoCanvas.globalAlpha = portal.abertura;
        desenharPortalAberto(x, centroY, raioX, raioY, segundos);
    }

    contextoDoCanvas.globalAlpha = 1;
    contextoDoCanvas.textAlign = "center";
    contextoDoCanvas.font = "bold 12px system-ui, sans-serif";
    contextoDoCanvas.lineWidth = 4;
    contextoDoCanvas.strokeStyle = "rgba(6,2,18,0.85)";
    contextoDoCanvas.fillStyle = portal.aberto ? "#9fe6ff" : "#ff8f7d";
    const rotulo = portal.aberto ? "PORTAL" : "SELADO";
    contextoDoCanvas.strokeText(rotulo, x, centroY - raioY - 14);
    contextoDoCanvas.fillText(rotulo, x, centroY - raioY - 14);

    contextoDoCanvas.restore();
}

function desenharPortalAberto(x, y, raioX, raioY, segundos) {
    const c = contextoDoCanvas;
    const alfaBase = c.globalAlpha;
    const pulso = 0.75 + 0.25 * Math.sin(segundos * 3);

    // Trabalhamos num espaço "circular" esticado até virar a elipse do portal,
    // assim gradientes e espirais acompanham o formato alto e estreito.
    c.save();
    c.translate(x, y);
    c.scale(raioX / raioY, 1);

    // Brilho no ar em volta
    const brilho = c.createRadialGradient(0, 0, raioY * 0.4, 0, 0, raioY * 2);
    brilho.addColorStop(0, "rgba(150,120,255," + (0.42 * pulso) + ")");
    brilho.addColorStop(1, "rgba(150,120,255,0)");
    c.fillStyle = brilho;
    c.beginPath();
    c.arc(0, 0, raioY * 2, 0, Math.PI * 2);
    c.fill();

    // Interior: um "buraco negro" com a borda roxa
    const interior = c.createRadialGradient(0, 0, 2, 0, 0, raioY);
    interior.addColorStop(0, "#000000");
    interior.addColorStop(0.55, "#12042e");
    interior.addColorStop(1, "#5a2fd0");
    c.fillStyle = interior;
    c.beginPath();
    c.arc(0, 0, raioY, 0, Math.PI * 2);
    c.fill();

    // Espirais girando por dentro
    c.beginPath();
    c.arc(0, 0, raioY, 0, Math.PI * 2);
    c.clip();
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
        c.save();
        c.rotate(segundos * (i % 2 === 0 ? 1.7 : -1.3) + i);
        c.strokeStyle = i % 2 === 0 ? "rgba(159,230,255,0.75)" : "rgba(199,123,255,0.7)";
        c.beginPath();
        c.arc(0, 0, raioY * (0.22 + i * 0.2), 0, Math.PI * 1.15);
        c.stroke();
        c.restore();
    }
    c.restore();

    // Anel externo (três traços, do mais largo e fraco ao mais fino e forte)
    [[15, 0.10], [9, 0.20], [4.5, 0.95]].forEach(([espessura, alfa]) => {
        c.strokeStyle = "rgba(159,230,255," + (alfa * pulso) + ")";
        c.lineWidth = espessura;
        c.beginPath();
        c.ellipse(x, y, raioX, raioY, 0, 0, Math.PI * 2);
        c.stroke();
    });

    // Fagulhas orbitando
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 9; i++) {
        const angulo = segundos * 0.9 + i * 0.7;
        c.globalAlpha = alfaBase * (0.3 + 0.55 * Math.abs(Math.sin(segundos * 2 + i)));
        c.beginPath();
        c.arc(
            x + Math.cos(angulo) * raioX * 1.3,
            y + Math.sin(angulo * 1.4 + i) * raioY * 0.98,
            1.4 + (i % 3) * 0.6, 0, Math.PI * 2
        );
        c.fill();
    }
    c.globalAlpha = alfaBase;
}

function desenharPortalSelado(x, y, raioX, raioY, segundos) {
    const c = contextoDoCanvas;
    const alfaBase = c.globalAlpha;

    // Interior apagado
    c.fillStyle = "#0c0304";
    c.beginPath();
    c.ellipse(x, y, raioX, raioY, 0, 0, Math.PI * 2);
    c.fill();

    // Barras de energia piscando: a "grade" que sela o portal
    c.save();
    c.beginPath();
    c.ellipse(x, y, raioX, raioY, 0, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = "#ff4d3a";
    c.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
        const barraY = y - raioY + (raioY * 2 * (i + 0.5)) / 5;
        c.globalAlpha = alfaBase * (0.45 + 0.35 * Math.sin(segundos * 5 + i * 1.7));
        c.beginPath();
        c.moveTo(x - raioX, barraY);
        c.lineTo(x + raioX, barraY);
        c.stroke();
    }
    c.restore();

    // Anel escuro e avermelhado
    c.globalAlpha = alfaBase * 0.85;
    c.strokeStyle = "#a83a32";
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(x, y, raioX, raioY, 0, 0, Math.PI * 2);
    c.stroke();

    // Cadeado no meio
    c.globalAlpha = alfaBase;
    c.strokeStyle = "#ffb3a8";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x - 9, y + 1);
    c.lineTo(x - 9, y - 6);
    c.arc(x, y - 6, 9, Math.PI, 0);
    c.lineTo(x + 9, y + 1);
    c.stroke();
    c.fillStyle = "#ff7b6b";
    c.fillRect(x - 13, y, 26, 20);
    c.fillStyle = "#3a0a06";
    c.fillRect(x - 2, y + 6, 4, 8);
}

// Enquanto o astronauta é sugado, ele gira e encolhe em direção ao portal.
function desenharJogadorComEfeitoDePortal(camaraX, alfaDeInterpolacao) {
    // Depois da animação o astronauta já atravessou: não desenha mais.
    if (fluxo === "entreFases" || fluxo === "vitoria") return;

    if (fluxo !== "entrandoNoPortal") {
        desenharJogador(contextoDoCanvas, camaraX, alfaDeInterpolacao);
        return;
    }

    const progresso = Math.min(1, tempoNoFluxo / AJUSTES_DAS_FASES.duracaoDaEntradaNoPortal);
    const escala = Math.max(0.02, 1 - progresso * progresso);
    const centroX = portal.x - camaraX;
    const centroY = POSICAO_DO_CHAO - AJUSTES_DO_PORTAL.altura / 2;

    contextoDoCanvas.save();
    contextoDoCanvas.translate(centroX, centroY);
    contextoDoCanvas.rotate(progresso * 5);
    contextoDoCanvas.scale(escala, escala);
    contextoDoCanvas.translate(-centroX, -centroY);
    desenharJogador(contextoDoCanvas, camaraX, alfaDeInterpolacao);
    contextoDoCanvas.restore();
}

// ---------- Fases: carregar, trocar, reiniciar ----------
// Os dados de cada fase ficam em js/fases.js. Tudo o que muda de uma fase
// para a outra (plataformas, aliens, chefe, portal, cenário) é montado aqui.

const cenariosDasFases = [];   // cada cenário é montado uma vez só e reaproveitado

function obterCenarioDaFase(indice) {
    if (!cenariosDasFases[indice]) {
        const fase = FASES[indice];
        cenariosDasFases[indice] = criarCenarioDaFase(
            LARGURA_DA_TELA, ALTURA_DA_TELA, fase.larguraDoNivel, POSICAO_DO_CHAO,
            TEMAS_DE_CENARIO[fase.tema]
        );
    }
    return cenariosDasFases[indice];
}

function posicionarJogadorNoInicio() {
    jogador.posicaoX = 60;
    jogador.posicaoY = POSICAO_DO_CHAO - jogador.altura;
    jogador.anteriorX = jogador.posicaoX;
    jogador.anteriorY = jogador.posicaoY;
    jogador.velocidadeX = 0;
    jogador.velocidadeY = 0;
    jogador.estaNoChao = true;
    jogador.estado = "parado";
    jogador.estadoAnterior = "parado";
    jogador.invencivelAte = 0;
    jogador.olhandoPara = 1;
    jogador.direcaoDesejada = 0;
    jogador.sprintDesejado = false;
    jogador.seguraPulo = false;
    jogador.tempoDeCoyote = 0;
    jogador.tempoDoPedidoDePulo = 0;
    jogador.tempoSemControle = 0;
    jogador.indiceDoFrame = 0;
    jogador.tempoNoFrame = 0;
    jogador.escalaX = 1;
    jogador.escalaY = 1;
    jogador.combo = 0;
    jogador.tempoDoCombo = 0;

    animacaoDeSprint.frame = 0;
    animacaoDeSprint.timer = 0;
}

// vidaCheia = true  → começo do jogo, "tentar de novo", "recomeçar".
// vidaCheia = false → avançando de fase: aplica só a cura da fase (curaAoIniciar).
function carregarFase(indice, { vidaCheia = false } = {}) {
    indiceDaFase = indice;
    faseAtual = FASES[indice];
    larguraDoNivel = faseAtual.larguraDoNivel;

    cenarioDaFase = obterCenarioDaFase(indice);
    plataformas = criarPlataformas(faseAtual);
    inimigos = criarInimigos(faseAtual);
    chefe = criarChefe(faseAtual.chefe); // CHEFE
    portal = criarPortal(faseAtual);
    abatidos = 0;

    posicionarJogadorNoInicio();
    jogador.vida = vidaCheia
        ? jogador.vidaMaxima
        : Math.min(jogador.vidaMaxima, jogador.vida + jogador.vidaMaxima * faseAtual.curaAoIniciar);
    vidaExibida = jogador.vida;

    camera.x = 0;
    camera.olhar = 0;
    posicaoDaCamera = 0;
    acumuladorDeTempo = 0;

    jogoEncerrado = false;
    fluxo = "jogando";
    tempoNoFluxo = 0;
    cartaoDaFase.tempo = AJUSTES_DAS_FASES.duracaoDoCartao;

    limparTodosOsEfeitos();
    esconderTodasAsTelas();
}

// Botão "Ir para a Fase 2" (tela de fase concluída).
function continuarParaProximaFase() {
    if (fluxo !== "entreFases") return;
    carregarFase(indiceDaFase + 1);
}

// "Tentar novamente": recomeça SÓ a fase atual, com vida cheia.
function reiniciarFase() {
    carregarFase(indiceDaFase, { vidaCheia: true });
}

// "Jogar novamente" / "Recomeçar do início": volta à Fase 1 do zero.
function reiniciarJogo() {
    abatidosAcumulados = 0;
    melhorCombo = 0;
    carregarFase(0, { vidaCheia: true });
}

// Tecla R: na vitória recomeça o jogo todo; nos outros casos, só a fase.
function aoApertarReiniciar() {
    if (fluxo === "vitoria") reiniciarJogo();
    else if (fluxo === "jogando" || fluxo === "derrota") reiniciarFase();
}

// ---------- Telas (fase concluída, vitória, derrota) ----------
// Escondemos com a classe "escondida" E com o atributo "hidden". O atributo é
// o cinto de segurança: mesmo que o CSS não carregue, a tela não aparece
// solta embaixo do jogo.

function esconderTodasAsTelas() {
    document.querySelectorAll(".tela-overlay").forEach((elemento) => {
        elemento.classList.add("escondida");
        elemento.hidden = true;
    });
}

function mostrarTela(idDaTela) {
    esconderTodasAsTelas();

    const alvo = document.getElementById(idDaTela);
    if (!alvo) return;

    alvo.classList.remove("escondida");
    alvo.hidden = false;
}

function definirTexto(id, texto) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = texto;
}

function resumoDaFase() {
    return "Aliens derrotados: " + abatidos + " / " + inimigos.length +
        "  ·  Melhor combo: " + melhorCombo + "x  ·  Vida restante: " + Math.ceil(jogador.vida);
}

function prepararTelaDeFaseConcluida() {
    const proxima = FASES[indiceDaFase + 1];
    const numeroDaProxima = indiceDaFase + 2;

    definirTexto("fase-concluida-titulo", "Fase " + (indiceDaFase + 1) + " concluída");
    definirTexto("fase-concluida-descricao", faseAtual.conclusao);
    definirTexto("resumo-fase", resumoDaFase());
    definirTexto(
        "fase-concluida-proxima",
        "Próxima: Fase " + numeroDaProxima + " — " + proxima.nome +
        (proxima.curaAoIniciar > 0 ? "  ·  seu traje será recarregado" : "")
    );
    definirTexto("botao-proxima-fase", "Ir para a Fase " + numeroDaProxima);
}

function atualizarResumoDaVitoria() {
    definirTexto("vitoria-descricao", faseAtual.conclusao);
    definirTexto(
        "resumo-vitoria",
        "Aliens derrotados: " + abatidosAcumulados + " / " + TOTAL_DE_ALIENS_DO_JOGO +
        "  ·  Melhor combo: " + melhorCombo + "x  ·  Vida restante: " + Math.ceil(jogador.vida)
    );
}

function prepararTelaDeDerrota() {
    definirTexto("derrota-fase", "Você caiu na Fase " + (indiceDaFase + 1) + " — " + faseAtual.nome + ".");

    // Na Fase 1, "tentar novamente" e "recomeçar" seriam a mesma coisa.
    const botaoRecomecar = document.getElementById("botao-recomecar");
    if (botaoRecomecar) botaoRecomecar.hidden = indiceDaFase === 0;
}

// ---------- Fluxo do jogo ----------

function verificarFimDeJogo() {
    if (fluxo !== "jogando") return;

    if (jogador.vida <= 0) {
        fluxo = "derrota";
        jogoEncerrado = true;
        prepararTelaDeDerrota();
        mostrarTela("tela-derrota");
        return;
    }

    if (jogadorEstaNoPortal()) iniciarEntradaNoPortal();
}

function iniciarEntradaNoPortal() {
    fluxo = "entrandoNoPortal";
    tempoNoFluxo = 0;
    jogoEncerrado = true;

    jogador.direcaoDesejada = 0;
    jogador.velocidadeX = 0;

    clarearTela(1.2, "170,140,255");
    tremerTela(5, 240);
    if (typeof somDePortal === "function") somDePortal();
}

function finalizarEntradaNoPortal() {
    abatidosAcumulados += abatidos;   // fecha a contagem desta fase

    const eAUltimaFase = indiceDaFase >= FASES.length - 1;

    if (eAUltimaFase) {
        fluxo = "vitoria";
        atualizarResumoDaVitoria();
        mostrarTela("tela-vitoria");
        somDeVitoria();
        return;
    }

    fluxo = "entreFases";
    prepararTelaDeFaseConcluida();
    mostrarTela("tela-fase-concluida");
}

// ---------- Loop principal ----------

let errosNoLoop = 0;

function loopPrincipal(momentoAtual) {
    // Um erro num quadro não pode matar o loop pra sempre (o jogo ficaria
    // congelado até dar F5). Registramos e seguimos pro próximo quadro.
    try {
        executarQuadro(momentoAtual);
    } catch (erro) {
        if (errosNoLoop++ < 5) console.error("jogo.js: erro no quadro:", erro);
    }

    requestAnimationFrame(loopPrincipal);
}

function executarQuadro(momentoAtual) {
    let tempoDecorrido = momentoAtual - momentoDoUltimoFrame;
    momentoDoUltimoFrame = momentoAtual;

    // Aba em segundo plano devolve um delta gigante: limita pra não teleportar.
    if (!isFinite(tempoDecorrido) || tempoDecorrido < 0) tempoDecorrido = AJUSTES_DE_JOGO.passoFixo;
    tempoDecorrido = Math.min(tempoDecorrido, 200);

    // Hit stop: congela o mundo por alguns milissegundos no impacto.
    if (efeitos.congelamento > 0) {
        efeitos.congelamento -= tempoDecorrido;
        tempoDecorrido = 0;
    }

    if (!jogoEncerrado) {
        acumuladorDeTempo += tempoDecorrido;

        let passos = 0;
        while (acumuladorDeTempo >= AJUSTES_DE_JOGO.passoFixo && passos < AJUSTES_DE_JOGO.maximoDePassosPorQuadro) {
            passoDeFisica(AJUSTES_DE_JOGO.passoFixo);
            acumuladorDeTempo -= AJUSTES_DE_JOGO.passoFixo;
            passos++;
        }

        if (passos >= AJUSTES_DE_JOGO.maximoDePassosPorQuadro) acumuladorDeTempo = 0;
    }

    atualizarEfeitos(tempoDecorrido);
    atualizarCenarioDaFase(cenarioDaFase, tempoDecorrido);
    atualizarPortal(tempoDecorrido);
    cartaoDaFase.tempo = Math.max(0, cartaoDaFase.tempo - tempoDecorrido);

    if (fluxo === "entrandoNoPortal") {
        tempoNoFluxo += tempoDecorrido;
        if (tempoNoFluxo >= AJUSTES_DAS_FASES.duracaoDaEntradaNoPortal) finalizarEntradaNoPortal();
    }

    const alfa = jogoEncerrado ? 1 : acumuladorDeTempo / AJUSTES_DE_JOGO.passoFixo;
    desenharTudo(alfa);

    verificarFimDeJogo();
}

// Começa na Fase 1, com vida cheia, e só então liga o loop.
carregarFase(0, { vidaCheia: true });
requestAnimationFrame(loopPrincipal);
