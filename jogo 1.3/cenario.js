function limitar(valor, minimo, maximo) {
  return valor < minimo ? minimo : valor > maximo ? maximo : valor;
}

function interpolar(a, b, t) {
  return a + (b - a) * t;
}

function criarGeradorAleatorio(semente) {
  let estado = semente >>> 0;
  return function () {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function aleatorioEntre(gerador, minimo, maximo) {
  return minimo + gerador() * (maximo - minimo);
}

function imagemValida(imagem) {
  return !!(imagem && imagem.complete && imagem.naturalWidth > 0);
}

function hexParaRgb(hex) {
  const valor = parseInt(hex.slice(1), 16);
  return {
    r: (valor >> 16) & 255,
    g: (valor >> 8) & 255,
    b: valor & 255,
  };
}

function misturarCoresHex(corA, corB, t) {
  const rgbA = hexParaRgb(corA);
  const rgbB = hexParaRgb(corB);
  const r = Math.round(interpolar(rgbA.r, rgbB.r, t));
  const g = Math.round(interpolar(rgbA.g, rgbB.g, t));
  const b = Math.round(interpolar(rgbA.b, rgbB.b, t));
  return `rgb(${r},${g},${b})`;
}

function hexParaRgba(hex, opacidade) {
  const { r, g, b } = hexParaRgb(hex);
  return `rgba(${r},${g},${b},${limitar(opacidade, 0, 1)})`;
}

export function criarCenario(contexto, larguraTela, alturaTela, dependencias) {
  const imagens = (dependencias && dependencias.imagens) || {};

  let larguraNivel = 4200;
  let semente = 1337;
  let tempo = 0;

  const camera = { x: 0, y: 0 };

  let gerador = criarGeradorAleatorio(semente);

  let estrelasDistantes = [];
  let estrelasProximas = [];
  let planeta = null;
  let plataformas = [];

  const PARALAXE = {
    estrelasDistantes: 0.05,
    estrelasProximas: 0.15,
    planeta: 0.28,
    mundo: 1.0,
  };

  function criarPlataforma(x, y, largura, altura, opcoes) {
    const plataforma = {
      x, y, largura, altura,
      faseBrilho: aleatorioEntre(gerador, 0, Math.PI * 2),
      ...opcoes,
    };
    plataformas.push(plataforma);
    return plataforma;
  }

  function gerarPlataformasDoNivel() {
    plataformas = [];
    const espacamentoMedio = 220;
    let x = 260;
    while (x < larguraNivel - 200) {
      const largura = aleatorioEntre(gerador, 150, 220);
      const altura = 40;
      const y = alturaTela * aleatorioEntre(gerador, 0.55, 0.8);
      criarPlataforma(x, y, largura, altura);
      x += espacamentoMedio + aleatorioEntre(gerador, -60, 90);
    }
  }

  function desenharTexturaPlataforma(imagem, xTela, yTela, largura, altura) {
    const padrao = contexto.createPattern(imagem, 'repeat');
    const escala = altura / imagem.height;
    contexto.save();
    contexto.translate(xTela, yTela);
    contexto.scale(escala, escala);
    contexto.fillStyle = padrao;
    contexto.fillRect(0, 0, largura / escala, altura / escala);
    contexto.restore();
  }

  function desenharPlataforma(plataforma) {
    const xTela = mundoParaTelaX(plataforma.x, PARALAXE.mundo);
    const yTela = plataforma.y;
    if (xTela + plataforma.largura < -50 || xTela > larguraTela + 50) return;

    const imagem = imagens.plataforma;
    contexto.save();
    if (imagemValida(imagem)) {
      desenharTexturaPlataforma(imagem, xTela, yTela, plataforma.largura, plataforma.altura);
    } else {
      const totalSegmentos = Math.max(2, Math.round(plataforma.largura / 32));
      const larguraSegmento = plataforma.largura / totalSegmentos;
      for (let i = 0; i < totalSegmentos; i++) {
        const gradiente = contexto.createLinearGradient(0, yTela, 0, yTela + plataforma.altura);
        gradiente.addColorStop(0, '#6b4a42');
        gradiente.addColorStop(0.5, '#4a322c');
        gradiente.addColorStop(1, '#2a1a17');
        contexto.fillStyle = gradiente;
        contexto.fillRect(xTela + i * larguraSegmento, yTela, larguraSegmento - 1.5, plataforma.altura);
      }
    }
    const brilho = 0.6 + 0.4 * Math.sin(tempo * 1.6 + plataforma.faseBrilho);
    contexto.shadowColor = '#3a6bff';
    contexto.shadowBlur = 6 * brilho;
    contexto.strokeStyle = `rgba(70,110,255,${0.55 + 0.35 * brilho})`;
    contexto.lineWidth = 2;
    contexto.strokeRect(xTela + 1, yTela + 1, plataforma.largura - 2, plataforma.altura - 2);
    contexto.shadowBlur = 0;
    contexto.restore();
  }

  function criarCampoEstrelas(quantidade, largura, altura, opcoes) {
    opcoes = opcoes || {};
    const tamanhoMinimo = opcoes.tamanhoMinimo || 0.6;
    const tamanhoMaximo = opcoes.tamanhoMaximo || 1.8;
    const cores = opcoes.cores || ['#ffffff'];
    const estrelas = [];
    for (let i = 0; i < quantidade; i++) {
      estrelas.push({
        x: aleatorioEntre(gerador, 0, largura),
        y: aleatorioEntre(gerador, 0, altura),
        tamanho: aleatorioEntre(gerador, tamanhoMinimo, tamanhoMaximo),
        opacidade: aleatorioEntre(gerador, 0.4, 1),
        cor: cores[Math.floor(aleatorioEntre(gerador, 0, cores.length))],
        velocidadeCintilar: aleatorioEntre(gerador, 0.3, 1.2),
        faseCintilar: aleatorioEntre(gerador, 0, Math.PI * 2),
      });
    }
    return estrelas;
  }

  function inicializarParalaxe() {
    const areaDistante = larguraNivel * 1.3;
    const areaProxima = larguraNivel * 1.15;
    estrelasDistantes = criarCampoEstrelas(200, areaDistante, alturaTela, {
      tamanhoMinimo: 0.5, tamanhoMaximo: 1.2, cores: ['#ffffff'],
    });
    estrelasProximas = criarCampoEstrelas(40, areaProxima, alturaTela, {
      tamanhoMinimo: 1.4, tamanhoMaximo: 2.6, cores: ['#ffffff', '#7fd8ff', '#b088ff'],
    });
  }

  function desenharCampoEstrelas(camada, fator, larguraArea) {
    for (const estrela of camada) {
      let xTela = estrela.x - camera.x * fator;
      xTela = ((xTela % larguraArea) + larguraArea) % larguraArea;
      if (xTela > larguraTela + 5) xTela -= larguraArea;
      desenharEstrela(estrela, xTela);
      if (xTela + larguraArea < larguraTela + 5) desenharEstrela(estrela, xTela + larguraArea);
    }
  }

  function desenharEstrela(estrela, xTela) {
    if (xTela < -5 || xTela > larguraTela + 5) return;
    const cintilar = 0.5 + 0.5 * Math.sin(tempo * estrela.velocidadeCintilar + estrela.faseCintilar);
    contexto.globalAlpha = estrela.opacidade * (0.65 + 0.35 * cintilar);
    contexto.fillStyle = estrela.cor;
    contexto.beginPath();
    contexto.arc(xTela, estrela.y, estrela.tamanho, 0, Math.PI * 2);
    contexto.fill();
    contexto.globalAlpha = 1;
  }

  function criarPlaneta() {
    return {
      x: larguraNivel * 0.10,
      y: -20,
      raio: 105,
      corBase: '#4f7fae',
      corSecundaria: '#7fb0d8',
      corAnel: '#c99a5c',
      anguloLuz: -0.7,
    };
  }

  function desenharPlaneta() {
    if (!planeta) return;
    const xTela = mundoParaTelaX(planeta.x, PARALAXE.planeta);
    const yTela = planeta.y;
    if (xTela < -planeta.raio * 2 || xTela > larguraTela + planeta.raio * 2) return;

    contexto.save();

    const luzX = xTela - Math.cos(planeta.anguloLuz) * planeta.raio * 0.6;
    const luzY = yTela - Math.sin(planeta.anguloLuz) * planeta.raio * 0.6;
    const gradienteCorpo = contexto.createRadialGradient(luzX, luzY, planeta.raio * 0.1, xTela, yTela, planeta.raio * 1.05);
    gradienteCorpo.addColorStop(0, misturarCoresHex(planeta.corSecundaria, '#ffffff', 0.3));
    gradienteCorpo.addColorStop(0.55, planeta.corBase);
    gradienteCorpo.addColorStop(1, misturarCoresHex(planeta.corBase, '#000000', 0.6));
    contexto.beginPath();
    contexto.fillStyle = gradienteCorpo;
    contexto.arc(xTela, yTela, planeta.raio, 0, Math.PI * 2);
    contexto.fill();

    contexto.save();
    contexto.beginPath();
    contexto.arc(xTela, yTela, planeta.raio, 0, Math.PI * 2);
    contexto.clip();
    const gradienteSombra = contexto.createLinearGradient(
      xTela - Math.cos(planeta.anguloLuz) * planeta.raio, yTela - Math.sin(planeta.anguloLuz) * planeta.raio,
      xTela + Math.cos(planeta.anguloLuz) * planeta.raio, yTela + Math.sin(planeta.anguloLuz) * planeta.raio
    );
    gradienteSombra.addColorStop(0, 'rgba(0,0,0,0)');
    gradienteSombra.addColorStop(1, 'rgba(0,0,0,0.55)');
    contexto.fillStyle = gradienteSombra;
    contexto.fillRect(xTela - planeta.raio, yTela - planeta.raio, planeta.raio * 2, planeta.raio * 2);
    contexto.restore();

    contexto.save();
    contexto.translate(xTela, yTela);
    contexto.rotate(0.32);
    contexto.strokeStyle = hexParaRgba(planeta.corAnel, 0.6);
    contexto.lineWidth = Math.max(3, planeta.raio * 0.07);
    contexto.beginPath();
    contexto.ellipse(0, 0, planeta.raio * 1.75, planeta.raio * 0.4, 0, 0, Math.PI * 2);
    contexto.stroke();
    contexto.restore();

    contexto.beginPath();
    const gradienteAtmosfera = contexto.createRadialGradient(xTela, yTela, planeta.raio * 0.95, xTela, yTela, planeta.raio * 1.15);
    gradienteAtmosfera.addColorStop(0, hexParaRgba(planeta.corSecundaria, 0.3));
    gradienteAtmosfera.addColorStop(1, hexParaRgba(planeta.corSecundaria, 0));
    contexto.fillStyle = gradienteAtmosfera;
    contexto.arc(xTela, yTela, planeta.raio * 1.15, 0, Math.PI * 2);
    contexto.fill();

    contexto.restore();
  }

  function mundoParaTelaX(posicaoMundoX, fator) {
    return posicaoMundoX - camera.x * fator;
  }

  function definirCamera(x, y) {
    const limiteX = Math.max(0, larguraNivel - larguraTela);
    camera.x = limitar(x, 0, limiteX);
    camera.y = limitar(y != null ? y : camera.y, -120, 120);
  }

  function construirMundo() {
    gerador = criarGeradorAleatorio(semente);
    inicializarParalaxe();
    planeta = criarPlaneta();
    gerarPlataformasDoNivel();
  }

  function definirConfiguracaoNivel(configuracao) {
    configuracao = configuracao || {};
    if (typeof configuracao.larguraNivel === 'number') larguraNivel = configuracao.larguraNivel;
    if (typeof configuracao.semente === 'number') semente = configuracao.semente;
    construirMundo();
  }

  function reiniciarCenario() {
    camera.x = 0;
    camera.y = 0;
    tempo = 0;
    construirMundo();
  }

  function atualizar(deltaTempo) {
    tempo += deltaTempo;
  }

  function desenharFundo() {
    const gradiente = contexto.createLinearGradient(0, 0, 0, alturaTela);
    gradiente.addColorStop(0, '#050914');
    gradiente.addColorStop(1, '#02040a');
    contexto.fillStyle = gradiente;
    contexto.fillRect(0, 0, larguraTela, alturaTela);
  }

  function renderizarCenario() {
    desenharFundo();
    desenharCampoEstrelas(estrelasDistantes, PARALAXE.estrelasDistantes, larguraNivel * 1.3);
    desenharPlaneta();
    desenharCampoEstrelas(estrelasProximas, PARALAXE.estrelasProximas, larguraNivel * 1.15);
    for (const plataforma of plataformas) desenharPlataforma(plataforma);
  }

  construirMundo();

  return {
    camera,
    definirCamera,
    definirConfiguracaoNivel,
    reiniciarCenario,
    atualizar,
    renderizarCenario,
    criarPlataforma,
    criarCampoEstrelas,
    inicializarParalaxe,
    desenharCampoEstrelas,
    desenharPlataforma,
  };
}