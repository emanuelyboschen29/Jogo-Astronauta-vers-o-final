// ======================================================
// sprites.js — Carregamento e processamento das sprite sheets
//
// Responsabilidades deste arquivo:
//   1. Carregar todas as sprite sheets do astronauta.
//   2. Remover o FUNDO PRETO da sprite sheet de sprint/portal,
//      preservando os detalhes escuros do traje e o roxo do portal.
//   3. Guardar o resultado em um canvas auxiliar (processado 1x, no load).
//   4. Entregar o recorte de cada frame para quem for desenhar.
//
// IMPORTANTE: o processamento usa getImageData(). Isso exige que o jogo
// rode em um servidor local (Live Server, http://...). Abrindo o arquivo
// direto com file:// o navegador bloqueia a leitura de pixels e o código
// cai automaticamente no modo de emergência (mistura aditiva).
// ======================================================

// ---------- Ajustes da remoção de fundo preto ----------
// Mexa aqui se sobrar preto ou se sumir alguma parte do astronauta.
const AJUSTES_DO_FUNDO = {
    // Um pixel só é candidato a fundo se o canal mais forte for <= este valor.
    // Aumente (ex.: 45) se sobrar fundo. Diminua (ex.: 18) se sumir parte do traje.
    limiarDeLuminancia: 30,

    // ...e se ele for praticamente cinza/preto (sem cor).
    // É isto que protege o roxo do portal: roxo escuro tem saturação alta.
    limiarDeSaturacao: 20,

    // Um pixel escuro que tem pixel "sólido" PERTO (dentro do raio abaixo) em
    // pelo menos N das 4 direções é considerado INTERIOR da figura e nunca é
    // apagado. É isto que salva os contornos escuros do traje e o vão entre
    // as pernas sem apagar nada do personagem.
    // 4 = mais agressivo (apaga mais fundo, arrisca comer o traje)
    // 3 = equilíbrio recomendado
    // 2 = mais conservador (preserva o traje, pode sobrar fundo)
    direcoesMinimasParaInterior: 3,

    // ALCANCE da proteção acima, em pixels. Esta é a peça mais importante:
    // sem limite de alcance, um buraco grande de fundo cercado pelo portal e
    // pelo astronauta conta como "interior" e vira um RETÂNGULO PRETO na tela.
    // Com raio pequeno, só vãos estreitos (contorno, frestas do traje) são
    // protegidos. Aumente se sumir detalhe do traje; diminua se sobrar preto.
    raioDeProtecaoDoInterior: 8,

    // Suaviza o anel de anti-aliasing escuro que sobra na silhueta,
    // evitando o "contorno sujo" em volta do astronauta.
    suavizarBordas: true,
    limiarDeSuavizacao: 60,
};

// Nas sheets, os pés do astronauta ficam a 216px de 256 (o resto do quadro é
// espaço vazio). Empurrando o desenho 15px para baixo, o pé encosta exatamente
// no chão e na plataforma. O MESMO valor em todas as animações mantém as poses
// coerentes entre si (o pulo continua com os pés recolhidos).
const DESLOCAMENTO_DOS_PES = 15;

// ---------- Catálogo de sprite sheets ----------
// colunas x linhas descreve o formato da folha.
//   - As sheets antigas são 25 frames em UMA linha  -> colunas: 25, linhas: 1
//   - A sheet de sprint é uma GRADE 5x5             -> colunas: 5,  linhas: 5
//
// removerFundoPreto : só ligue nas folhas que realmente têm fundo preto.
//                     As folhas antigas já vêm com transparência, então ficam false.
// recorteAutomatico : corta a margem vazia. O MESMO retângulo é usado nos 25
//                     frames, então o astronauta nunca muda de tamanho.
// escalaDeDesenho   : tamanho na tela relativo à caixa do jogador (96x96).
//                     Não afeta colisão nem física.
// deslocamentoX/Y   : ajuste fino em pixels, caso o astronauta fique alto/baixo.
const BANCO_DE_SPRITES = {
    parado: {
        caminho: "../img/sprite-parado-spritesheet.png",
        colunas: 25, linhas: 1,
        removerFundoPreto: false, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0, deslocamentoY: DESLOCAMENTO_DOS_PES,
    },
    andando: {
        caminho: "../img/sprite-andando-spritesheet.png",
        colunas: 25, linhas: 1,
        removerFundoPreto: false, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0, deslocamentoY: DESLOCAMENTO_DOS_PES,
    },
    pulando: {
        caminho: "../img/sprite-pulando-spritesheet.png",
        colunas: 25, linhas: 1,
        removerFundoPreto: false, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0, deslocamentoY: DESLOCAMENTO_DOS_PES,
    },
    // >>> ATAQUE COM ESPADA — grade 5x5, fundo preto <<<
    // O frame 10 (linha 3, coluna 1) é o do corte, que é exatamente onde
    // CONFIGURACOES.frameDeAcertoDoAtaque aplica o dano.
    atacando: {
        caminho: "../img/sprite-atacando-spritesheet.png",
        colunas: 5, linhas: 5,
        removerFundoPreto: true,
        recorteAutomatico: false,
        escalaDeDesenho: 1,      // medido: mesma altura do astronauta de "andando"
        deslocamentoX: 3,
        deslocamentoY: DESLOCAMENTO_DOS_PES,
    },

    // >>> SPRINT / PORTAL — grade 5x5, fundo preto <<<
    correndo: {
        caminho: "../img/sprite-sprint-portal-spritesheet.png",
        colunas: 5, linhas: 5,
        removerFundoPreto: true,
        recorteAutomatico: false,
        escalaDeDesenho: 1,      // medido: mesma altura do astronauta de "andando"
        deslocamentoX: 4,        // alinha o centro do corpo com as outras animações
        deslocamentoY: DESLOCAMENTO_DOS_PES,
    },

    // Plataforma: imagem única, sem animação. Entra aqui só para
    // aproveitar o mesmo carregamento das outras.
    plataforma: {
        caminho: "../img/plataforma.png",
        colunas: 1, linhas: 1,
        removerFundoPreto: false, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0, deslocamentoY: 0,
    },

    // >>> MECHA COM ESPADA — ligado: é o chefe de fase (js/chefe.js) <<<
    // Grade 5x5 (25 quadros): golpe completo de espada (erguer, cortar,
    // cravar no chão com faísca, arrastar, recuperar). O chefe usa o
    // quadro 0 como postura parada e a sequência inteira como o ataque.
    mechaEspada: {
        caminho: "../img/sprite-mecha-espada-spritesheet.png",
        colunas: 5, linhas: 5,
        removerFundoPreto: true, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0,
        // Medido no quadro parado (~21px de vazio embaixo, na folha de
        // 256px). Como não há recorte automático, o golpe (que agacha)
        // varia mais — se o pé "flutuar" ou "afundar" durante o golpe,
        // ajuste este valor olhando o jogo rodando.
        deslocamentoY: 18,
    },

    // >>> MECHA — IDLE (novo) <<<
    // 25 quadros, fundo já vem transparente de verdade (sem preto pra
    // remover). Postura parada "respirando", com a espada pulsando —
    // usada em loop enquanto o chefe espera pra atacar.
    mechaIdle: {
        caminho: "../img/sprite-mecha-idle-spritesheet.png",
        colunas: 5, linhas: 5,
        removerFundoPreto: false, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0, deslocamentoY: 32,
    },

    // >>> MECHA — SALTO (novo) <<<
    // 25 quadros: agacha, salta, fica no ar e aterrissa. js/chefe.js
    // soma um "solavanco" vertical calculado por cima disso (a folha em
    // si não move a posição, só a pose).
    mechaSalto: {
        caminho: "../img/sprite-mecha-salto-spritesheet.png",
        colunas: 5, linhas: 5,
        removerFundoPreto: false, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0, deslocamentoY: 28,
    },

    // >>> MECHA — AVANÇO (novo) <<<
    // 25 quadros: golpe acrobático avançando (vários saltos curtos),
    // termina numa guarda parada. Usado como ataque alternativo.
    mechaAvanco: {
        caminho: "../img/sprite-mecha-avanco-spritesheet.png",
        colunas: 5, linhas: 5,
        removerFundoPreto: false, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0, deslocamentoY: 34,
    },

    // >>> MECHA — ATAQUE CARREGADO / "ataque2" (novo) <<<
    // ATENÇÃO: os quadros 0-9 desta folha estão de FRENTE pra câmera,
    // enquanto 10-24 estão de PERFIL (igual ao resto do jogo). Tocar a
    // folha inteira faria o mecha "virar de frente" no meio do golpe,
    // o que quebra visualmente. js/chefe.js usa só os quadros 10-24
    // como a postura de "carregar o golpe" (espada bem erguida), e
    // encadeia com o golpe normal (mechaEspada) pra desferir o dano.
    mechaAtaque2: {
        caminho: "../img/sprite-mecha-ataque2-spritesheet.png",
        colunas: 5, linhas: 5,
        removerFundoPreto: false, recorteAutomatico: false,
        escalaDeDesenho: 1, deslocamentoX: 0, deslocamentoY: 7,
    },
};

// ---------- Estado interno de cada sprite ----------
// Preenchido durante o carregamento. Ninguém de fora precisa mexer nisso.
Object.values(BANCO_DE_SPRITES).forEach((sprite) => {
    sprite.imagem = null;
    sprite.telaProcessada = null;
    sprite.larguraDaCelula = 0;
    sprite.alturaDaCelula = 0;
    sprite.totalDeFrames = sprite.colunas * sprite.linhas;
    sprite.recorte = { x: 0, y: 0, largura: 0, altura: 0 };
    sprite.pronta = false;
    sprite.usarMisturaAditiva = false;
});

// ======================================================
// Carregamento
// ======================================================

function carregarTodasAsSprites() {
    const nomes = Object.keys(BANCO_DE_SPRITES);
    return Promise.all(nomes.map(carregarUmaSprite));
}

function carregarUmaSprite(nome) {
    const sprite = BANCO_DE_SPRITES[nome];

    return new Promise((resolver) => {
        const imagem = new Image();

        imagem.onload = () => {
            sprite.imagem = imagem;
            prepararSprite(nome, sprite);
            resolver(nome);
        };

        imagem.onerror = () => {
            console.warn(
                `sprites.js: não consegui carregar "${sprite.caminho}". ` +
                `A animação "${nome}" vai usar a animação reserva.`
            );
            resolver(nome);
        };

        imagem.src = sprite.caminho;
    });
}

// Faz todo o trabalho pesado UMA única vez, logo depois do load.
function prepararSprite(nome, sprite) {
    sprite.larguraDaCelula = Math.floor(sprite.imagem.naturalWidth / sprite.colunas);
    sprite.alturaDaCelula = Math.floor(sprite.imagem.naturalHeight / sprite.linhas);
    sprite.recorte = {
        x: 0, y: 0,
        largura: sprite.larguraDaCelula,
        altura: sprite.alturaDaCelula,
    };

    avisarSeAGradeNaoFecha(nome, sprite);

    const precisaProcessar = sprite.removerFundoPreto || sprite.recorteAutomatico;
    if (!precisaProcessar) {
        sprite.pronta = true;
        return;
    }

    const tela = criarTelaComAImagem(sprite.imagem);
    let dados;

    try {
        dados = tela.contexto.getImageData(0, 0, tela.canvas.width, tela.canvas.height);
    } catch (erro) {
        ativarModoDeEmergencia(nome, sprite);
        return;
    }

    if (sprite.removerFundoPreto) {
        removerFundoPretoDaFolha(dados, sprite.colunas, sprite.linhas);
    }

    tela.contexto.putImageData(dados, 0, 0);
    sprite.telaProcessada = tela.canvas;

    if (sprite.recorteAutomatico) {
        sprite.recorte = calcularRecorteUniforme(dados, sprite.colunas, sprite.linhas);
    }

    sprite.pronta = true;
}

function avisarSeAGradeNaoFecha(nome, sprite) {
    const larguraBate = sprite.larguraDaCelula * sprite.colunas === sprite.imagem.naturalWidth;
    const alturaBate = sprite.alturaDaCelula * sprite.linhas === sprite.imagem.naturalHeight;

    if (larguraBate && alturaBate) return;

    console.warn(
        `sprites.js: a sheet "${nome}" tem ${sprite.imagem.naturalWidth}x${sprite.imagem.naturalHeight}px, ` +
        `que não divide certinho em ${sprite.colunas}x${sprite.linhas}. ` +
        `Confira "colunas" e "linhas" no BANCO_DE_SPRITES — grade errada é a causa nº1 de frames tortos.`
    );
}

// Quando o navegador bloqueia a leitura de pixels (arquivo aberto via file://),
// desenhamos a sheet original com mistura aditiva: preto puro vira invisível.
// Não é tão bom quanto a remoção real, mas evita o quadrado preto.
function ativarModoDeEmergencia(nome, sprite) {
    sprite.usarMisturaAditiva = true;
    sprite.telaProcessada = null;
    sprite.pronta = true;

    console.warn(
        `sprites.js: o navegador bloqueou a leitura dos pixels de "${nome}" (canvas "tainted"). ` +
        `Abra o jogo por um servidor local (Live Server / http://localhost) para a remoção ` +
        `de fundo funcionar de verdade. Usando mistura aditiva como plano B.`
    );
}

function criarTelaComAImagem(imagem) {
    const canvas = document.createElement("canvas");
    canvas.width = imagem.naturalWidth;
    canvas.height = imagem.naturalHeight;

    const contexto = canvas.getContext("2d", { willReadFrequently: true });
    contexto.drawImage(imagem, 0, 0);

    return { canvas, contexto };
}

// ======================================================
// Remoção do fundo preto
//
// Regra: preto que ENCOSTA na borda do frame é fundo.
// Exceção: preto cercado pela figura é detalhe do traje e fica.
// ======================================================

function removerFundoPretoDaFolha(dados, colunas, linhas) {
    const largura = dados.width;
    const altura = dados.height;
    const pixels = dados.data;
    const totalDePixels = largura * altura;

    const escuro = marcarPixelsEscuros(pixels, totalDePixels);
    const interior = marcarInteriorDaFigura(escuro, largura, altura, colunas, linhas);
    const fundo = espalharApartirDasBordas(escuro, interior, largura, altura, colunas, linhas);

    apagarFundo(pixels, fundo, totalDePixels);

    if (AJUSTES_DO_FUNDO.suavizarBordas) {
        suavizarContorno(pixels, fundo, largura, altura);
    }
}

// Passo 1 — quem é candidato a fundo: escuro E sem cor.
// O roxo do portal, mesmo escuro, tem saturação alta e escapa daqui.
function marcarPixelsEscuros(pixels, totalDePixels) {
    const escuro = new Uint8Array(totalDePixels);
    const limiarDeLuminancia = AJUSTES_DO_FUNDO.limiarDeLuminancia;
    const limiarDeSaturacao = AJUSTES_DO_FUNDO.limiarDeSaturacao;

    for (let indice = 0; indice < totalDePixels; indice++) {
        const base = indice * 4;

        if (pixels[base + 3] === 0) {
            escuro[indice] = 1;
            continue;
        }

        const vermelho = pixels[base];
        const verde = pixels[base + 1];
        const azul = pixels[base + 2];

        let maiorCanal = vermelho > verde ? vermelho : verde;
        if (azul > maiorCanal) maiorCanal = azul;

        let menorCanal = vermelho < verde ? vermelho : verde;
        if (azul < menorCanal) menorCanal = azul;

        const ehEscuro = maiorCanal <= limiarDeLuminancia;
        const ehSemCor = maiorCanal - menorCanal <= limiarDeSaturacao;

        escuro[indice] = ehEscuro && ehSemCor ? 1 : 0;
    }

    return escuro;
}

// Passo 2 — a proteção do personagem.
// Para cada frame, varre nas 4 direções e conta em quantas delas o pixel escuro
// tem um pixel sólido (não-escuro) PERTO — no máximo `raioDeProtecaoDoInterior`
// pixels de distância. Fresta estreita do traje = protegida.
// Buraco largo de fundo = desprotegido, e some no passo 3.
function marcarInteriorDaFigura(escuro, largura, altura, colunas, linhas) {
    const contagem = new Uint8Array(largura * altura);
    const larguraDaCelula = Math.floor(largura / colunas);
    const alturaDaCelula = Math.floor(altura / linhas);
    const raio = AJUSTES_DO_FUNDO.raioDeProtecaoDoInterior;

    for (let linha = 0; linha < linhas; linha++) {
        for (let coluna = 0; coluna < colunas; coluna++) {
            const inicioX = coluna * larguraDaCelula;
            const inicioY = linha * alturaDaCelula;
            const fimX = inicioX + larguraDaCelula;
            const fimY = inicioY + alturaDaCelula;

            contarSolidosNaHorizontal(escuro, contagem, largura, inicioX, inicioY, fimX, fimY, raio);
            contarSolidosNaVertical(escuro, contagem, largura, inicioX, inicioY, fimX, fimY, raio);
        }
    }

    const interior = new Uint8Array(largura * altura);
    const minimo = AJUSTES_DO_FUNDO.direcoesMinimasParaInterior;

    for (let indice = 0; indice < interior.length; indice++) {
        interior[indice] = contagem[indice] >= minimo ? 1 : 0;
    }

    return interior;
}

// distancia = quantos pixels faltam até o último sólido visto naquela direção.
// Enquanto for <= raio, o pixel conta como protegido por aquele lado.
function contarSolidosNaHorizontal(escuro, contagem, largura, inicioX, inicioY, fimX, fimY, raio) {
    const longe = raio + 1;

    for (let y = inicioY; y < fimY; y++) {
        const base = y * largura;

        let distancia = longe;
        for (let x = inicioX; x < fimX; x++) {
            const indice = base + x;
            if (distancia <= raio) contagem[indice]++;
            distancia = escuro[indice] ? (distancia < longe ? distancia + 1 : longe) : 1;
        }

        distancia = longe;
        for (let x = fimX - 1; x >= inicioX; x--) {
            const indice = base + x;
            if (distancia <= raio) contagem[indice]++;
            distancia = escuro[indice] ? (distancia < longe ? distancia + 1 : longe) : 1;
        }
    }
}

function contarSolidosNaVertical(escuro, contagem, largura, inicioX, inicioY, fimX, fimY, raio) {
    const longe = raio + 1;

    for (let x = inicioX; x < fimX; x++) {
        let distancia = longe;
        for (let y = inicioY; y < fimY; y++) {
            const indice = y * largura + x;
            if (distancia <= raio) contagem[indice]++;
            distancia = escuro[indice] ? (distancia < longe ? distancia + 1 : longe) : 1;
        }

        distancia = longe;
        for (let y = fimY - 1; y >= inicioY; y--) {
            const indice = y * largura + x;
            if (distancia <= raio) contagem[indice]++;
            distancia = escuro[indice] ? (distancia < longe ? distancia + 1 : longe) : 1;
        }
    }
}

// Passo 3 — flood fill a partir da borda de CADA frame.
// Só anda por pixel escuro que não esteja protegido como interior.
function espalharApartirDasBordas(escuro, interior, largura, altura, colunas, linhas) {
    const fundo = new Uint8Array(largura * altura);
    const pilha = new Int32Array(largura * altura);
    let topo = 0;

    function empilhar(indice) {
        if (fundo[indice]) return;
        if (!escuro[indice]) return;
        if (interior[indice]) return;

        fundo[indice] = 1;
        pilha[topo++] = indice;
    }

    semearBordasDosFrames(empilhar, largura, altura, colunas, linhas);

    while (topo > 0) {
        const indice = pilha[--topo];
        const x = indice % largura;
        const y = (indice - x) / largura;

        if (x > 0) empilhar(indice - 1);
        if (x < largura - 1) empilhar(indice + 1);
        if (y > 0) empilhar(indice - largura);
        if (y < altura - 1) empilhar(indice + largura);
    }

    return fundo;
}

function semearBordasDosFrames(empilhar, largura, altura, colunas, linhas) {
    const larguraDaCelula = Math.floor(largura / colunas);
    const alturaDaCelula = Math.floor(altura / linhas);

    for (let linha = 0; linha < linhas; linha++) {
        for (let coluna = 0; coluna < colunas; coluna++) {
            const inicioX = coluna * larguraDaCelula;
            const inicioY = linha * alturaDaCelula;
            const fimX = Math.min(inicioX + larguraDaCelula, largura) - 1;
            const fimY = Math.min(inicioY + alturaDaCelula, altura) - 1;

            for (let x = inicioX; x <= fimX; x++) {
                empilhar(inicioY * largura + x);
                empilhar(fimY * largura + x);
            }
            for (let y = inicioY; y <= fimY; y++) {
                empilhar(y * largura + inicioX);
                empilhar(y * largura + fimX);
            }
        }
    }
}

function apagarFundo(pixels, fundo, totalDePixels) {
    for (let indice = 0; indice < totalDePixels; indice++) {
        if (fundo[indice]) pixels[indice * 4 + 3] = 0;
    }
}

// Passo 4 — o anel de pixels que ficou na fronteira com o fundo costuma ser
// anti-aliasing misturado com preto. Deixamos ele semi-transparente e
// clareamos a cor, senão fica um contorno sujo em volta do astronauta.
function suavizarContorno(pixels, fundo, largura, altura) {
    const limite = AJUSTES_DO_FUNDO.limiarDeSuavizacao;

    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
            const indice = y * largura + x;
            if (fundo[indice]) continue;

            const encosta =
                (x > 0 && fundo[indice - 1]) ||
                (x < largura - 1 && fundo[indice + 1]) ||
                (y > 0 && fundo[indice - largura]) ||
                (y < altura - 1 && fundo[indice + largura]);
            if (!encosta) continue;

            const base = indice * 4;
            const vermelho = pixels[base];
            const verde = pixels[base + 1];
            const azul = pixels[base + 2];

            let maiorCanal = vermelho > verde ? vermelho : verde;
            if (azul > maiorCanal) maiorCanal = azul;

            let menorCanal = vermelho < verde ? vermelho : verde;
            if (azul < menorCanal) menorCanal = azul;

            const ehQuaseFundo = maiorCanal < limite && maiorCanal - menorCanal <= 40;
            if (!ehQuaseFundo) continue;

            const novaOpacidade = Math.max(1, Math.round((maiorCanal / limite) * 255));
            const fatorDeClareamento = 255 / novaOpacidade;

            pixels[base] = Math.min(255, Math.round(vermelho * fatorDeClareamento));
            pixels[base + 1] = Math.min(255, Math.round(verde * fatorDeClareamento));
            pixels[base + 2] = Math.min(255, Math.round(azul * fatorDeClareamento));
            pixels[base + 3] = Math.min(pixels[base + 3], novaOpacidade);
        }
    }
}

// ======================================================
// Recorte uniforme
//
// Calcula UM retângulo só, usado igualzinho nos 25 frames.
// Tira a margem vazia sem nunca mudar o tamanho do personagem entre frames.
// ======================================================

function calcularRecorteUniforme(dados, colunas, linhas) {
    const largura = dados.width;
    const altura = dados.height;
    const pixels = dados.data;

    const larguraDaCelula = Math.floor(largura / colunas);
    const alturaDaCelula = Math.floor(altura / linhas);

    let menorX = larguraDaCelula;
    let menorY = alturaDaCelula;
    let maiorX = -1;
    let maiorY = -1;

    for (let y = 0; y < altura; y++) {
        const yLocal = y % alturaDaCelula;

        for (let x = 0; x < largura; x++) {
            if (pixels[(y * largura + x) * 4 + 3] <= 8) continue;

            const xLocal = x % larguraDaCelula;
            if (xLocal < menorX) menorX = xLocal;
            if (xLocal > maiorX) maiorX = xLocal;
            if (yLocal < menorY) menorY = yLocal;
            if (yLocal > maiorY) maiorY = yLocal;
        }
    }

    const nadaEncontrado = maiorX < 0 || maiorY < 0;
    if (nadaEncontrado) {
        return { x: 0, y: 0, largura: larguraDaCelula, altura: alturaDaCelula };
    }

    const margem = 2;
    const x = Math.max(0, menorX - margem);
    const y = Math.max(0, menorY - margem);

    return {
        x,
        y,
        largura: Math.min(larguraDaCelula - x, maiorX - menorX + 1 + margem * 2),
        altura: Math.min(alturaDaCelula - y, maiorY - menorY + 1 + margem * 2),
    };
}

// ======================================================
// Consulta (é o que astronauta.js usa)
// ======================================================

function aSpriteEstaPronta(nome) {
    const sprite = BANCO_DE_SPRITES[nome];
    return Boolean(sprite && sprite.pronta && sprite.imagem);
}

function totalDeFramesDaSprite(nome) {
    const sprite = BANCO_DE_SPRITES[nome];
    return sprite ? sprite.totalDeFrames : 0;
}

// Devolve tudo que o drawImage precisa para um frame específico.
function obterRecorteDoFrame(nome, indiceDoFrame) {
    if (!aSpriteEstaPronta(nome)) return null;

    const sprite = BANCO_DE_SPRITES[nome];
    const total = sprite.totalDeFrames;
    const indiceSeguro = ((indiceDoFrame % total) + total) % total;

    const coluna = indiceSeguro % sprite.colunas;
    const linha = Math.floor(indiceSeguro / sprite.colunas);

    return {
        fonte: sprite.telaProcessada || sprite.imagem,
        origemX: coluna * sprite.larguraDaCelula + sprite.recorte.x,
        origemY: linha * sprite.alturaDaCelula + sprite.recorte.y,
        largura: sprite.recorte.largura,
        altura: sprite.recorte.altura,
        escalaDeDesenho: sprite.escalaDeDesenho,
        deslocamentoX: sprite.deslocamentoX,
        deslocamentoY: sprite.deslocamentoY,
        usarMisturaAditiva: sprite.usarMisturaAditiva,
    };
}

// Dispara o carregamento assim que o arquivo é lido.
carregarTodasAsSprites();
