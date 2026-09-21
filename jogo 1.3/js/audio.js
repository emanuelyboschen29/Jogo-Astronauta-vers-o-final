// ======================================================
// audio.js — Efeitos sonoros gerados na hora (WebAudio).
//
// Sem arquivos de áudio: tudo é sintetizado. Isso evita carregar
// assets, evita problema de licença e não pesa no download.
//
// Navegador só deixa tocar som depois de um gesto do usuário, então
// o contexto só é criado na primeira tecla apertada.
// ======================================================

const AUDIO = {
    ligado: true,
    volume: 0.28,
    contexto: null,
    saida: null,
};

function garantirAudio() {
    if (!AUDIO.ligado) return null;
    if (AUDIO.contexto) return AUDIO.contexto;

    try {
        const Fabrica = window.AudioContext || window.webkitAudioContext;
        if (!Fabrica) { AUDIO.ligado = false; return null; }

        AUDIO.contexto = new Fabrica();
        AUDIO.saida = AUDIO.contexto.createGain();
        AUDIO.saida.gain.value = AUDIO.volume;
        AUDIO.saida.connect(AUDIO.contexto.destination);
    } catch (erro) {
        AUDIO.ligado = false;
        return null;
    }

    return AUDIO.contexto;
}

function alternarSom() {
    AUDIO.ligado = !AUDIO.ligado;
    if (AUDIO.saida) AUDIO.saida.gain.value = AUDIO.ligado ? AUDIO.volume : 0;
    return AUDIO.ligado;
}

// Um tom com envelope. É o tijolo de todos os sons daqui.
function tocarTom({ frequencia, frequenciaFinal, duracao, tipo, volume, atraso }) {
    const contexto = garantirAudio();
    if (!contexto) return;

    const inicio = contexto.currentTime + (atraso || 0);
    const oscilador = contexto.createOscillator();
    const ganho = contexto.createGain();

    oscilador.type = tipo || "sine";
    oscilador.frequency.setValueAtTime(frequencia, inicio);

    if (frequenciaFinal) {
        oscilador.frequency.exponentialRampToValueAtTime(
            Math.max(1, frequenciaFinal), inicio + duracao
        );
    }

    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(volume || 0.3, inicio + 0.008);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);

    oscilador.connect(ganho);
    ganho.connect(AUDIO.saida);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracao + 0.02);
}

// Ruído branco filtrado: serve pra poeira, impacto e explosão.
function tocarRuido({ duracao, corte, volume, atraso, tipoDeFiltro }) {
    const contexto = garantirAudio();
    if (!contexto) return;

    const inicio = contexto.currentTime + (atraso || 0);
    const amostras = Math.floor(contexto.sampleRate * duracao);
    const buffer = contexto.createBuffer(1, Math.max(1, amostras), contexto.sampleRate);
    const dados = buffer.getChannelData(0);

    for (let i = 0; i < amostras; i++) dados[i] = Math.random() * 2 - 1;

    const fonte = contexto.createBufferSource();
    fonte.buffer = buffer;

    const filtro = contexto.createBiquadFilter();
    filtro.type = tipoDeFiltro || "lowpass";
    filtro.frequency.setValueAtTime(corte || 1200, inicio);

    const ganho = contexto.createGain();
    ganho.gain.setValueAtTime(volume || 0.2, inicio);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);

    fonte.connect(filtro);
    filtro.connect(ganho);
    ganho.connect(AUDIO.saida);
    fonte.start(inicio);
}

// ---------- Sons do jogo ----------

function somDePulo() {
    tocarTom({ frequencia: 300, frequenciaFinal: 720, duracao: 0.16, tipo: "triangle", volume: 0.22 });
    tocarRuido({ duracao: 0.09, corte: 900, volume: 0.07 });
}

function somDeAterrissagem(forca) {
    const peso = Math.min(1, forca / 14);
    tocarTom({ frequencia: 150, frequenciaFinal: 60, duracao: 0.14, tipo: "sine", volume: 0.16 + peso * 0.18 });
    tocarRuido({ duracao: 0.14, corte: 500 + peso * 700, volume: 0.08 + peso * 0.12 });
}

function somDeGolpe() {
    tocarRuido({ duracao: 0.1, corte: 2600, volume: 0.13, tipoDeFiltro: "highpass" });
    tocarTom({ frequencia: 620, frequenciaFinal: 220, duracao: 0.12, tipo: "sawtooth", volume: 0.1 });
}

function somDeAcerto() {
    tocarTom({ frequencia: 880, frequenciaFinal: 320, duracao: 0.1, tipo: "square", volume: 0.16 });
    tocarRuido({ duracao: 0.12, corte: 3200, volume: 0.14, tipoDeFiltro: "highpass" });
}

function somDeInimigoDerrotado() {
    tocarTom({ frequencia: 420, frequenciaFinal: 90, duracao: 0.3, tipo: "sawtooth", volume: 0.16 });
    tocarRuido({ duracao: 0.26, corte: 1500, volume: 0.15 });
    tocarTom({ frequencia: 1200, frequenciaFinal: 1800, duracao: 0.14, tipo: "sine", volume: 0.08, atraso: 0.04 });
}

function somDeDano() {
    tocarTom({ frequencia: 240, frequenciaFinal: 80, duracao: 0.26, tipo: "square", volume: 0.2 });
    tocarRuido({ duracao: 0.18, corte: 800, volume: 0.12 });
}

function somDeSprint() {
    tocarTom({ frequencia: 180, frequenciaFinal: 900, duracao: 0.28, tipo: "sawtooth", volume: 0.12 });
    tocarRuido({ duracao: 0.3, corte: 1800, volume: 0.08, tipoDeFiltro: "bandpass" });
}

// CHEFE: espadada pesada batendo no chão.
function somDeImpactoDoChefe() {
    tocarTom({ frequencia: 95, frequenciaFinal: 40, duracao: 0.32, tipo: "sine", volume: 0.26 });
    tocarRuido({ duracao: 0.28, corte: 650, volume: 0.22 });
}

// CHEFE: explosão maior, mais grave que a de um inimigo comum.
function somDeChefeDerrotado() {
    tocarRuido({ duracao: 0.5, corte: 1200, volume: 0.22 });
    [220, 165, 110, 55].forEach((nota, i) => {
        tocarTom({ frequencia: nota, duracao: 0.5, tipo: "sawtooth", volume: 0.2, atraso: i * 0.12 });
    });
}

// PORTAL: o astronauta é sugado pelo portal (varredura subindo).
function somDePortal() {
    tocarTom({ frequencia: 180, frequenciaFinal: 1400, duracao: 0.7, tipo: "sine", volume: 0.2 });
    tocarTom({ frequencia: 360, frequenciaFinal: 2100, duracao: 0.7, tipo: "triangle", volume: 0.1, atraso: 0.05 });
    tocarRuido({ duracao: 0.6, corte: 2400, volume: 0.09, tipoDeFiltro: "bandpass" });
}

// PORTAL: liga sozinho quando o chefe da fase cai.
function somDePortalAberto() {
    [392, 523, 659].forEach((nota, i) => {
        tocarTom({ frequencia: nota, duracao: 0.5, tipo: "sine", volume: 0.16, atraso: i * 0.14 });
    });
    tocarRuido({ duracao: 0.4, corte: 1800, volume: 0.06, tipoDeFiltro: "bandpass", atraso: 0.1 });
}

function somDeVitoria() {
    [523, 659, 784, 1047].forEach((nota, i) => {
        tocarTom({ frequencia: nota, duracao: 0.34, tipo: "triangle", volume: 0.2, atraso: i * 0.11 });
    });
}

function somDeDerrota() {
    [392, 330, 262, 196].forEach((nota, i) => {
        tocarTom({ frequencia: nota, duracao: 0.4, tipo: "triangle", volume: 0.2, atraso: i * 0.16 });
    });
}
