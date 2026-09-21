// ======================================================
// fases.js — Definição das fases do jogo (só DADOS, sem lógica)
//
// O jogo tem duas fases, jogadas em sequência:
//
//   Fase 1 — Campo de Aliens : atravessar o campo até o portal.
//   Fase 2 — Arena do Mecha  : enfrentar o Mecha guardião. O portal do
//                              final fica selado até ele ser derrotado.
//
// Quem carrega, troca e reinicia as fases é o jogo.js. Aqui você só
// ajusta o conteúdo: onde ficam plataformas, aliens, chefe e portal.
//
// Campos de cada fase:
//   nome / subtitulo : aparecem no cartão de início da fase e no HUD.
//   conclusao        : texto da tela ao terminar a fase.
//   tema             : cenário visual (ver TEMAS_DE_CENARIO em cenario-fase.js).
//   larguraDoNivel   : comprimento da fase, em pixels.
//   curaAoIniciar    : fração da vida máxima devolvida ao começar a fase
//                      (0 = não cura, 1 = vida cheia). A Fase 1 ignora isso.
//   portal.x         : posição (centro) do portal no fim da fase.
//   plataformas      : [x, y, largura] — y é a altura do TOPO da plataforma.
//   inimigos         : tipo "rastejante" (anda no chão/plataforma) ou
//                      "flutuante" (paira no ar, precisa de "altura").
//                      "alcance" = quanto ele patrulha pra cada lado.
//                      "emPlataforma" = y da plataforma onde ele anda.
//   chefe            : null (fase sem chefe) ou { posicaoX, gatilhoX }.
//                      gatilhoX = a partir de onde o chefe "acorda".
//                      Com chefe, o portal só abre depois que ele cai.
// ======================================================

const FASES = [
    {
        id: "campo",
        nome: "Campo de Aliens",
        subtitulo: "Atravesse o campo e chegue ao portal",
        conclusao: "O astronauta atravessou o campo de aliens e chegou ao portal.",
        tema: "campo",
        larguraDoNivel: 2100,
        curaAoIniciar: 0,
        portal: { x: 1950 },

        plataformas: [
            [430, 380, 159], [620, 300, 159], [900, 360, 318],
            [1250, 300, 159], [1420, 230, 159], [1660, 330, 159],
        ],

        inimigos: [
            { x: 560, tipo: "rastejante", alcance: 90 },
            { x: 900, tipo: "flutuante", altura: 250, alcance: 120 },
            { x: 960, tipo: "rastejante", alcance: 70, emPlataforma: 360 },
            { x: 1320, tipo: "rastejante", alcance: 60, emPlataforma: 300 },
            { x: 1500, tipo: "flutuante", altura: 190, alcance: 150 },
            { x: 1760, tipo: "rastejante", alcance: 110 },
        ],

        chefe: null,
    },

    {
        id: "arena",
        nome: "Arena do Mecha",
        subtitulo: "Derrote o guardião para abrir o portal",
        conclusao: "O astronauta atravessou o campo de aliens e derrotou o Mecha guardião.",
        tema: "arena",
        larguraDoNivel: 2240,
        curaAoIniciar: 1,
        portal: { x: 2150 },

        plataformas: [
            [490, 380, 318], [820, 310, 159], [1000, 240, 159],
            [1240, 330, 318], [1540, 280, 159],
        ],

        inimigos: [
            { x: 560, tipo: "rastejante", alcance: 120, emPlataforma: 380 },
            { x: 840, tipo: "flutuante", altura: 230, alcance: 130 },
            { x: 1060, tipo: "rastejante", alcance: 90 },
            { x: 1320, tipo: "rastejante", alcance: 120, emPlataforma: 330 },
            { x: 1600, tipo: "flutuante", altura: 210, alcance: 110 },
        ],

        // O Mecha fica na frente do portal. A parede invisível (ver chefe.js)
        // fica logo atrás dele e some quando ele é derrotado.
        chefe: { posicaoX: 1840, gatilhoX: 1690 },
    },
];

// Total de aliens comuns em todas as fases (usado no resumo final).
const TOTAL_DE_ALIENS_DO_JOGO = FASES.reduce((soma, fase) => soma + fase.inimigos.length, 0);
