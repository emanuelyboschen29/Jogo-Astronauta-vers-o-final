import { criarCenario } from './cenario.js';

const LARGURA_CANVAS = 1280;
const ALTURA_CANVAS = 720;
const LARGURA_NIVEL = 4200;
const SEMENTE_NIVEL = 20260907;
const VELOCIDADE_CAMERA_DEMO = 140;

const FONTES_DE_IMAGENS = {
  plataforma: './plataforma.png',
};

function carregarImagem(caminho) {
  return new Promise((resolve) => {
    const imagem = new Image();
    imagem.onload = () => resolve(imagem);
    imagem.onerror = () => resolve(imagem);
    imagem.src = caminho;
  });
}

async function carregarTodasImagens(fontes) {
  const entradas = Object.entries(fontes);
  const imagensCarregadas = await Promise.all(entradas.map(([, caminho]) => carregarImagem(caminho)));
  const resultado = {};
  entradas.forEach(([chave], indice) => {
    resultado[chave] = imagensCarregadas[indice];
  });
  return resultado;
}

function criarControladorDemoCamera(larguraNivel, larguraTela) {
  let posicaoX = 0;
  let direcao = 1;
  return function avancar(deltaTempo) {
    posicaoX += direcao * VELOCIDADE_CAMERA_DEMO * deltaTempo;
    const limite = Math.max(0, larguraNivel - larguraTela);
    if (posicaoX >= limite) {
      posicaoX = limite;
      direcao = -1;
    } else if (posicaoX <= 0) {
      posicaoX = 0;
      direcao = 1;
    }
    return posicaoX;
  };
}

async function iniciar() {
  const canvas = document.getElementById('canvasJogo');
  if (!canvas) {
    console.error('main.js: elemento <canvas id="canvasJogo"> não encontrado no index.html.');
    return;
  }
  canvas.width = LARGURA_CANVAS;
  canvas.height = ALTURA_CANVAS;
  const contexto = canvas.getContext('2d');

  const imagens = await carregarTodasImagens(FONTES_DE_IMAGENS);

  const cenario = criarCenario(contexto, LARGURA_CANVAS, ALTURA_CANVAS, { imagens });

  cenario.definirConfiguracaoNivel({ larguraNivel: LARGURA_NIVEL, semente: SEMENTE_NIVEL });
  cenario.reiniciarCenario();
  cenario.definirCamera(0, 0);

  const avancarCameraDemo = criarControladorDemoCamera(LARGURA_NIVEL, LARGURA_CANVAS);

  let ultimoTempo = performance.now();

  function loop(agora) {
    const deltaTempo = Math.min((agora - ultimoTempo) / 1000, 0.05);
    ultimoTempo = agora;

    const posicaoCameraX = avancarCameraDemo(deltaTempo);
    cenario.definirCamera(posicaoCameraX, 0);

    cenario.atualizar(deltaTempo);
    cenario.renderizarCenario();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

iniciar();