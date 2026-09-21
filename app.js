// ===================================================
// CONFIGURAÇÃO DA API & PLAYLIST
// ===================================================
const API_BASE_URL = (window.location.origin && !window.location.origin.includes("file://"))
    ? window.location.origin
    : "http://localhost:8000";

const PLAYLIST = [
    { title: "Música 1: Piano Romântico", url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=romantic-piano-112199.mp3" },
    { title: "Música 2: Ed Sheeran - Photograph", url: "https://archive.org/download/edshrn/06%20Ed%20Sheeran%20Photograph.mp3" },
    { title: "Música 3: Violão do Amor", url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a82d02.mp3?filename=romantic-love-song-10586.mp3" }
];

let currentSongIndex = 0;

// Lista local com as 30 fotos oficiais da Paula (Títulos genéricos, elegantes e neutros para família, amigos e momentos especiais)
const FIGURINHAS_PADRAO = [
    { id: 1, nome: "Instantâneo Bonito", file: "WhatsApp Image 2026-08-05 at 19.34.32 (2).jpeg", desc: "Um instante lindo guardado com carinho no coração ✨" },
    { id: 2, nome: "Laços & Afeto", file: "WhatsApp Image 2026-08-05 at 19.34.32.jpeg", desc: "Pessoas queridas que deixam a vida mais leve e alegre ❤️" },
    { id: 3, nome: "Momento Guardado", file: "WhatsApp Image 2026-08-05 at 19.35.02.jpeg", desc: "Um registro especial que sempre traz boas lembranças 📸" },
    { id: 4, nome: "Companhia Querida", file: "WhatsApp Image 2026-08-05 at 19.38.52.jpeg", desc: "A alegria de compartilhar a vida com quem amamos 🌟" },
    { id: 5, nome: "Gente Especial", file: "WhatsApp Image 2026-08-05 at 19.38.53 (1).jpeg", desc: "Momentos cheios de significado, carinho e consideração 💖" },
    { id: 6, nome: "Luz & Alegria", file: "WhatsApp Image 2026-08-05 at 19.38.53 (2).jpeg", desc: "A presença marcante de quem transmite paz e boas energias ☀️" },
    { id: 7, nome: "Abraço Querido", file: "WhatsApp Image 2026-08-05 at 19.38.53 (3).jpeg", desc: "Onde o respeito, a amizade e o carinho se encontram 🤗" },
    { id: 8, nome: "Vínculos Fortes", file: "WhatsApp Image 2026-08-05 at 19.38.53 (4).jpeg", desc: "Pessoas especiais que tornam a vida muito mais rica e bonita 💖" },
    { id: 9, nome: "Boas Recordações", file: "WhatsApp Image 2026-08-05 at 19.38.53.jpeg", desc: "Pequenos instantes que deixam marcas boas no coração ✨" },
    { id: 10, nome: "Presença Marcante", file: "WhatsApp Image 2026-08-05 at 19.38.54.jpeg", desc: "Encontros inesquecíveis com pessoas inestimáveis 🌟" },
    { id: 11, nome: "Dia De Festa", file: "WhatsApp Image 2026-08-05 at 19.38.55 (1).jpeg", desc: "Celebrando a vida e construindo histórias inesquecíveis 🚗" },
    { id: 12, nome: "Dias De Sol", file: "WhatsApp Image 2026-08-05 at 19.38.55 (2).jpeg", desc: "Aproveitando os bons momentos na melhor companhia 🏖️" },
    { id: 13, nome: "Reunião Familiar", file: "WhatsApp Image 2026-08-05 at 19.38.55.jpeg", desc: "Encontros queridos que ficam eternizados na memória ☕" },
    { id: 14, nome: "Novos Caminhos", file: "WhatsApp Image 2026-08-05 at 19.38.57 (1).jpeg", desc: "Colecionando experiências e sorrisos pelo caminho 🗺️" },
    { id: 15, nome: "Gratidão Pela Vida", file: "WhatsApp Image 2026-08-05 at 19.38.57 (2).jpeg", desc: "Agradecendo por cada presença importante na nossa história 🌅" },
    { id: 16, nome: "Tardes De Paz", file: "WhatsApp Image 2026-08-05 at 19.38.57.jpeg", desc: "Descontraindo e aproveitando a felicidade de estar junto 🛋️" },
    { id: 17, nome: "União & Festa", file: "WhatsApp Image 2026-08-05 at 19.38.58 (1).jpeg", desc: "Festa, convivência e motivos de sobra para comemorar 🎈" },
    { id: 18, nome: "Bons Encontros", file: "WhatsApp Image 2026-08-05 at 19.38.58 (2).jpeg", desc: "Conversas sinceras, sorrisos e a leveza da vida 💬" },
    { id: 19, nome: "Alegria De Viver", file: "WhatsApp Image 2026-08-05 at 19.38.58 (3).jpeg", desc: "A felicidade de festejar e abraçar quem amamos ☕" },
    { id: 20, nome: "Harmonia Familiar", file: "WhatsApp Image 2026-08-05 at 19.38.58 (4).jpeg", desc: "Reuniões de família, amigos e afetos verdadeiros 🎶" },
    { id: 21, nome: "Caminhos Da Vida", file: "WhatsApp Image 2026-08-05 at 19.38.58.jpeg", desc: "Pessoas e laços reais que acompanham essa história 🏠" },
    { id: 22, nome: "Vivências Especiais", file: "WhatsApp Image 2026-08-05 at 19.38.59 (1).jpeg", desc: "Lugares, festas e momentos marcantes vividos juntos ✈️" },
    { id: 23, nome: "Lembranças Eternas", file: "WhatsApp Image 2026-08-05 at 19.38.59 (2).jpeg", desc: "Recordações preciosas eternizadas com muito carinho 👵👴" },
    { id: 24, nome: "Sonhos & Conquistas", file: "WhatsApp Image 2026-08-05 at 19.38.59 (3).jpeg", desc: "Celebrando cada passo, cada aprendizado e cada vitória 🌈" },
    { id: 25, nome: "Família & Amigos", file: "WhatsApp Image 2026-08-05 at 19.38.59 (4).jpeg", desc: "Sentimentos puros e laços fortes que nos unem a você 👨‍👩‍👧‍👦" },
    { id: 26, nome: "Cuidado & Apoio", file: "WhatsApp Image 2026-08-05 at 19.38.59.jpeg", desc: "Apoio constante e a certeza de ter com quem contar 🤝" },
    { id: 27, nome: "Achego & Acolhimento", file: "WhatsApp Image 2026-08-05 at 19.39.00 (1).jpeg", desc: "Pessoas que transmitem abrigo, paz e serenidade ⚓" },
    { id: 28, nome: "Amor De Família", file: "WhatsApp Image 2026-08-05 at 19.39.00.jpeg", desc: "O valor imensurável da família, dos amigos e de quem te ama ❤️" },
    { id: 29, nome: "Celebrando A Paula", file: "WhatsApp Image 2026-08-05 at 19.39.00 (1).jpeg", desc: "Homenageando quem torna o nosso mundo mais feliz 🎉" },
    { id: 30, nome: "Laços Para Sempre", file: "WhatsApp Image 2026-08-05 at 19.39.00.jpeg", desc: "Construindo e guardando as memórias mais lindas da vida 💫" }
];

// Preenche figurinhas do backend ou locais com efeito Polaroid e suporte a Modal Zoom
async function preencherFigurinhas() {
    let figurinhas = [];

    try {
        const response = await fetch(`${API_BASE_URL}/figurinhas`);
        if (response.ok) {
            const dados = await response.json();
            if (Array.isArray(dados) && dados.length > 0) {
                // Só aceita itens que venham com imagem_url preenchida
                const validos = dados.filter(d => d.imagem_url && d.imagem_url.trim() !== "");
                if (validos.length > 0) {
                    figurinhas = validos;
                }
            }
        }
    } catch (erro) {
        console.warn("⚠️ Backend offline ou sem resposta, carregando figurinhas locais:", erro.message);
    }

    // Fallback para lista local se backend não trouxer dados válidos
    if (!figurinhas || figurinhas.length === 0) {
        figurinhas = FIGURINHAS_PADRAO.map(f => ({
            id: f.id,
            nome: f.nome,
            descricao: f.desc,
            imagem_url: `./Figurinhas/${encodeURIComponent(f.file)}`
        }));
    }

    const porId = new Map(figurinhas.map(f => [f.id, f]));

    // Garantir que todos os 30 slots (1 a 30) estejam 100% preenchidos
    for (let i = 1; i <= 30; i++) {
        if (!porId.has(i)) {
            const padrao = FIGURINHAS_PADRAO[(i - 1) % FIGURINHAS_PADRAO.length];
            porId.set(i, {
                id: i,
                nome: padrao.nome,
                descricao: padrao.desc,
                imagem_url: `./Figurinhas/${encodeURIComponent(padrao.file)}`
            });
        }
    }

    const slots = document.querySelectorAll(".sticker-slot");

    for (const slot of slots) {
        const slotNumeroEl = slot.querySelector(".slot-number");
        if (!slotNumeroEl) continue;

        const id = parseInt(slotNumeroEl.textContent.replace("#", ""), 10);
        if (!porId.has(id)) continue;

        const figurinha = porId.get(id);
        let imgUrl = figurinha.imagem_url;
        if (!imgUrl || imgUrl.trim() === "") {
            const padrao = FIGURINHAS_PADRAO[(id - 1) % FIGURINHAS_PADRAO.length];
            imgUrl = `./Figurinhas/${encodeURIComponent(padrao.file)}`;
        } else if (!imgUrl.startsWith("http") && !imgUrl.startsWith("./")) {
            imgUrl = `${API_BASE_URL}${imgUrl}`;
        }

        // Atualiza o título do slot para corresponder exatamente ao título sereno da foto
        const slotNameEl = slot.querySelector(".slot-name");
        if (slotNameEl) {
            slotNameEl.textContent = figurinha.nome;
        }

        // Remove imagens antigas se existirem
        const imgAntiga = slot.querySelector("img.sticker-img");
        if (imgAntiga) imgAntiga.remove();

        const img = document.createElement("img");
        img.src = imgUrl;
        img.alt = figurinha.nome;
        img.className = "sticker-img";

        // Tratamento de erro infalível para carregar a foto de qualquer caminho possível
        img.onerror = () => {
            const retryCount = parseInt(img.dataset.retried || "0", 10);
            if (retryCount >= 4) return;
            img.dataset.retried = (retryCount + 1).toString();

            const padrao = FIGURINHAS_PADRAO[(id - 1) % FIGURINHAS_PADRAO.length];
            const fileEncoded = encodeURIComponent(padrao.file);

            if (retryCount === 1) {
                img.src = `./Figurinhas/${fileEncoded}`;
            } else if (retryCount === 2) {
                img.src = `./figurinhas/${fileEncoded}`;
            } else if (retryCount === 3) {
                img.src = `./${fileEncoded}`;
            }
        };

        // Rotação aleatória estilo Polaroid (-1.5deg a +1.5deg)
        slot.style.setProperty("--random-rotate", (Math.random() * 3 - 1.5).toFixed(2));

        img.onload = () => {
            slot.classList.add("slot-preenchido");
        };
        slot.insertBefore(img, slot.firstChild);

        // Clique na foto para abrir Modal de Zoom (com bloqueio total de propagação no PageFlip)
        ["click", "pointerdown", "touchstart"].forEach(evtName => {
            slot.addEventListener(evtName, (e) => {
                e.stopPropagation();
                if (evtName === "click") {
                    e.preventDefault();
                    abrirModalFoto(imgUrl, figurinha.nome, figurinha.descricao || "Momento inesquecível da nossa história ❤️");
                }
            }, { passive: false });
        });
    }

    // Preencher a Foto de Destaque no Hero (Página 8) com a foto de destaque da Paula (#19)
    const heroSlot = document.getElementById("hero-photo-placeholder");
    const targetHeroId = porId.has(19) ? 19 : (porId.has(1) ? 1 : (porId.size > 0 ? Array.from(porId.keys())[0] : null));
    if (heroSlot && targetHeroId) {
        const figHero = porId.get(targetHeroId);
        let heroUrl = figHero.imagem_url;
        if (!heroUrl || heroUrl.trim() === "") {
            heroUrl = `./Figurinhas/${encodeURIComponent("WhatsApp Image 2026-08-05 at 19.38.58 (3).jpeg")}`;
        } else if (!heroUrl.startsWith("http") && !heroUrl.startsWith("./")) {
            heroUrl = `${API_BASE_URL}${heroUrl}`;
        }

        // Esconde os elementos de texto placeholder antigos
        const textEl = heroSlot.querySelector(".photo-text");
        if (textEl) textEl.style.display = "none";
        const heartEl = heroSlot.querySelector(".heart-icon");
        if (heartEl) heartEl.style.display = "none";

        // Remove imagens antigas do heroSlot se existirem
        const imgHeroAntiga = heroSlot.querySelector("img.sticker-img");
        if (imgHeroAntiga) imgHeroAntiga.remove();

        // Cria a tag <img> real para a foto ficar visível permanentemente na moldura Polaroid da Página 8
        const imgHero = document.createElement("img");
        imgHero.src = heroUrl;
        imgHero.alt = "Paula ❤️";
        imgHero.className = "sticker-img";
        imgHero.style.width = "100%";
        imgHero.style.height = "calc(100% - 28px)";
        imgHero.style.objectFit = "contain";
        imgHero.style.display = "block";
        imgHero.style.borderRadius = "4px";

        heroSlot.insertBefore(imgHero, heroSlot.firstChild);

        imgHero.onerror = () => {
            imgHero.src = `./Figurinhas/${encodeURIComponent("WhatsApp Image 2026-08-05 at 19.38.58 (3).jpeg")}`;
        };

        ["click", "pointerdown", "touchstart"].forEach(evtName => {
            heroSlot.addEventListener(evtName, (e) => {
                e.stopPropagation();
                if (evtName === "click") {
                    e.preventDefault();
                    abrirModalFoto(heroUrl, "Paula ❤️", "Feliz Aniversário! ❤️✨");
                }
            }, { passive: false });
        });
    }
}

// ---------------------------------------------------
// FUNÇÕES AUXILIARES DE INTERFACE
// ---------------------------------------------------

let isModalHistoryPushed = false;

// Modal Lightbox de Zoom das Fotos
function abrirModalFoto(imgUrl, titulo, descricao) {
    const modal = document.getElementById("photo-modal");
    const modalImg = document.getElementById("modal-img");
    const modalTitle = document.getElementById("modal-title");
    const modalDesc = document.getElementById("modal-desc");

    if (!modal || !modalImg) return;

    modalImg.src = imgUrl;
    if (modalTitle) modalTitle.textContent = titulo || "Foto Especial • Paula ❤️";
    if (modalDesc) modalDesc.textContent = descricao || "";

    modal.classList.remove("hidden");

    // Adiciona entrada no histórico para o botão "Voltar" do smartphone fechar o modal em vez de sair do site
    if (!isModalHistoryPushed) {
        history.pushState({ modalOpen: true }, "");
        isModalHistoryPushed = true;
    }
}

function fecharModalFoto(isFromPopState = false) {
    const modal = document.getElementById("photo-modal");
    if (modal && !modal.classList.contains("hidden")) {
        modal.classList.add("hidden");
        if (isModalHistoryPushed && !isFromPopState) {
            isModalHistoryPushed = false;
            try { history.back(); } catch (err) {}
        } else {
            isModalHistoryPushed = false;
        }
    }
}

// Escuta o botão Voltar do celular (Android/iOS)
window.addEventListener("popstate", () => {
    const modal = document.getElementById("photo-modal");
    if (modal && !modal.classList.contains("hidden")) {
        fecharModalFoto(true);
    }
});

// Disparar Pétalas de Rosa caindo
function soltarPetalasDeRosa() {
    const emojis = ["🌹", "🌸", "💖", "🌷", "✨"];
    for (let i = 0; i < 22; i++) {
        setTimeout(() => {
            const petal = document.createElement("div");
            petal.className = "rose-petal";
            petal.innerHTML = emojis[Math.floor(Math.random() * emojis.length)];

            const size = Math.random() * 14 + 18 + "px";
            const left = Math.random() * 92 + "vw";
            const duration = Math.random() * 4 + 4 + "s";
            const rotate = Math.random() * 360 - 180 + "deg";
            const drift = (Math.random() * 100 - 50) + "px";

            petal.style.setProperty("--size", size);
            petal.style.left = left;
            petal.style.setProperty("--duration", duration);
            petal.style.setProperty("--rotate", rotate);
            petal.style.setProperty("--drift", drift);

            document.body.appendChild(petal);

            setTimeout(() => petal.remove(), 7000);
        }, i * 140);
    }
}

// Disparar Confetes de Corações e Pétalas de Rosa
function dispararConfetes() {
    soltarPetalasDeRosa();
    if (typeof confetti === "function") {
        confetti({
            particleCount: 65,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#ff4d6d', '#b81d45', '#ffd700', '#ffffff', '#ff758f', '#e63946']
        });
        setTimeout(() => {
            confetti({
                particleCount: 35,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#ff4d6d', '#ff758f', '#ffffff']
            });
            confetti({
                particleCount: 35,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#ff4d6d', '#ff758f', '#ffffff']
            });
        }, 250);
    }
}

// ---------------------------------------------------
// INICIALIZAÇÃO PRINCIPAL DA APLICAÇÃO
// ---------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    const bookElement = document.getElementById("book");
    const btnPrev = document.getElementById("btn-prev");
    const btnNext = document.getElementById("btn-next");
    const soundToggle = document.getElementById("sound-toggle");
    const nextSongBtn = document.getElementById("next-song-btn");
    const songToast = document.getElementById("song-toast");
    const songToastTitle = document.getElementById("song-toast-title");

    const iconOn = soundToggle ? soundToggle.querySelector(".sound-icon-on") : null;
    const iconOff = soundToggle ? soundToggle.querySelector(".sound-icon-off") : null;

    let isMuted = false;
    let pageFlip = null;

    // 1. Áudio de Fundo (Ed Sheeran - Photograph)
    const bgAudio = document.getElementById("bg-audio") || new Audio("https://archive.org/download/edshrn/06%20Ed%20Sheeran%20Photograph.mp3");
    bgAudio.loop = true;
    bgAudio.volume = 0.4;

    function tentarTocarMusica() {
        if (!isMuted && bgAudio.paused) {
            bgAudio.play().catch(() => {});
        }
    }

    // Desbloqueia a política de áudio no primeiro toque/clique
    ["click", "touchstart", "pointerdown"].forEach(evt => {
        window.addEventListener(evt, tentarTocarMusica, { once: true });
    });

    if (soundToggle) {
        soundToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            isMuted = !isMuted;
            if (isMuted) {
                if (iconOn) iconOn.classList.add("hidden");
                if (iconOff) iconOff.classList.remove("hidden");
                bgAudio.pause();
            } else {
                if (iconOn) iconOn.classList.remove("hidden");
                if (iconOff) iconOff.classList.add("hidden");
                bgAudio.play().catch(() => {});
            }
        });
    }

    // 2. Som de papel virando (Web Audio API)
    function playPaperTurnSound() {
        if (isMuted) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const audioCtx = new AudioContext();
            const duration = 0.4;
            const bufferSize = audioCtx.sampleRate * duration;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);

            for (let i = 0; i < bufferSize; i++) {
                const progress = i / bufferSize;
                const noise = Math.random() * 2 - 1;
                const envelope = progress < 0.3 ? progress / 0.3 : (1 - progress) / 0.7;
                data[i] = noise * envelope * 0.08;
            }

            const noiseNode = audioCtx.createBufferSource();
            noiseNode.buffer = buffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(1200, audioCtx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + duration);

            noiseNode.connect(filter);
            filter.connect(audioCtx.destination);
            noiseNode.start();
        } catch (e) {}
    }

    // 3. Inicialização do PageFlip
    if (bookElement) {
        bookElement.style.display = "block";
    }

    try {
        if (typeof St !== "undefined" && St.PageFlip && bookElement) {
            pageFlip = new St.PageFlip(bookElement, {
                width: 550,
                height: 800,
                size: "stretch",
                minWidth: 280,
                maxWidth: 1000,
                minHeight: 380,
                maxHeight: 1350,
                drawShadow: true,
                maxShadowOpacity: 0.4,
                showCover: true,
                mobileScrollSupport: true,
                useMouseEvents: false, // CLIQUE NA PÁGINA NÃO VIRA MAIS A PÁGINA NEM FECHA O ÁLBUM! Virar é feito exclusivamente pelas setas ou teclas.
                showPageCorners: true,
                flippingTime: 700
            });

            pageFlip.loadFromHTML(document.querySelectorAll(".page"));

            pageFlip.on("changeState", (e) => {
                if (e.data === "flipping") {
                    playPaperTurnSound();
                }
            });

            pageFlip.on("flip", (e) => {
                const pageIndex = e.data;
                atualizarBotoesNavegacao(pageIndex);
                // Dispara pétalas e confetes nas páginas da história e dedicatória (Pág. 7 / 8)
                if (pageIndex >= 6) {
                    dispararConfetes();
                }
            });
        }
    } catch (error) {
        console.error("Erro ao inicializar PageFlip:", error);
    }

    function atualizarBotoesNavegacao(pageIndex) {
        if (!pageFlip) return;
        const index = pageIndex !== undefined ? pageIndex : pageFlip.getCurrentPageIndex();
        const total = pageFlip.getPageCount();

        if (btnPrev) {
            if (index <= 0) {
                btnPrev.classList.add("hidden");
            } else {
                btnPrev.classList.remove("hidden");
            }
        }

        if (btnNext) {
            if (index >= total - 1) {
                btnNext.classList.add("hidden");
            } else {
                btnNext.classList.remove("hidden");
            }
        }
    }

    // Botões de Avançar e Voltar
    if (btnPrev) {
        btnPrev.classList.add("hidden");
        const avancarPrev = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            tentarTocarMusica();
            if (pageFlip) {
                pageFlip.flipPrev();
                setTimeout(() => atualizarBotoesNavegacao(), 150);
            }
        };
        btnPrev.addEventListener("click", avancarPrev);
        btnPrev.addEventListener("touchstart", avancarPrev, { passive: false });
    }

    if (btnNext) {
        const avancarNext = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            tentarTocarMusica();
            if (pageFlip) {
                pageFlip.flipNext();
                setTimeout(() => atualizarBotoesNavegacao(), 150);
            }
        };
        btnNext.addEventListener("click", avancarNext);
        btnNext.addEventListener("touchstart", avancarNext, { passive: false });
    }

    // Teclas de seta no teclado
    document.addEventListener("keydown", (e) => {
        if (!pageFlip) return;
        if (e.key === "ArrowLeft") {
            pageFlip.flipPrev();
            setTimeout(() => atualizarBotoesNavegacao(), 150);
        } else if (e.key === "ArrowRight") {
            pageFlip.flipNext();
            setTimeout(() => atualizarBotoesNavegacao(), 150);
        }
    });

    preencherFigurinhas();

    // 4. Relógio de Tempo de Casados (Data: 17/12/2021)
    const dataInicioNamoro = new Date("2021-12-17T00:00:00");

    function atualizarRelogioAmor() {
        const agora = new Date();
        const diffMs = agora - dataInicioNamoro;
        if (diffMs < 0) return;

        const totalSegundos = Math.floor(diffMs / 1000);
        const anos = Math.floor(totalSegundos / (365.25 * 24 * 3600));
        const dias = Math.floor((totalSegundos % (365.25 * 24 * 3600)) / (24 * 3600));
        const horas = Math.floor((totalSegundos % (24 * 3600)) / 3600);
        const minutos = Math.floor((totalSegundos % 3600) / 60);
        const segundos = totalSegundos % 60;

        const elY = document.getElementById("timer-years");
        const elD = document.getElementById("timer-days");
        const elH = document.getElementById("timer-hours");
        const elM = document.getElementById("timer-minutes");
        const elS = document.getElementById("timer-seconds");

        if (elY) elY.textContent = anos;
        if (elD) elD.textContent = dias;
        if (elH) elH.textContent = horas;
        if (elM) elM.textContent = minutos;
        if (elS) elS.textContent = segundos;
    }

    setInterval(atualizarRelogioAmor, 1000);
    atualizarRelogioAmor();

    // 5. Raspadinha Romântica Secreta com Prevenção de Drag na Página
    const scratchCanvas = document.getElementById("scratch-canvas");
    if (scratchCanvas) {
        const ctx = scratchCanvas.getContext("2d");
        const width = scratchCanvas.width;
        const height = scratchCanvas.height;

        ctx.fillStyle = "#c0c0c0";
        ctx.fillRect(0, 0, width, height);

        ctx.font = "bold 13px Inter, sans-serif";
        ctx.fillStyle = "#555555";
        ctx.textAlign = "center";
        ctx.fillText("✨ Raspe aqui para ver a surpresa! ✨", width / 2, height / 2 + 5);

        let isScratching = false;

        function raspar(e) {
            if (!isScratching) return;
            if (e && e.cancelable) e.preventDefault();
            if (e) e.stopPropagation();

            const rect = scratchCanvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const x = (clientX - rect.left) * (width / rect.width);
            const y = (clientY - rect.top) * (height / rect.height);

            ctx.globalCompositeOperation = "destination-out";
            ctx.beginPath();
            ctx.arc(x, y, 16, 0, Math.PI * 2);
            ctx.fill();
        }

        scratchCanvas.addEventListener("mousedown", (e) => { isScratching = true; raspar(e); });
        scratchCanvas.addEventListener("mousemove", raspar);
        window.addEventListener("mouseup", () => { isScratching = false; });

        scratchCanvas.addEventListener("touchstart", (e) => { 
            isScratching = true; 
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            raspar(e); 
        }, { passive: false });

        scratchCanvas.addEventListener("touchmove", (e) => {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            raspar(e);
        }, { passive: false });

        window.addEventListener("touchend", () => { isScratching = false; });
    }

    // 6. Fechar Modal Lightbox
    const modalCloseBtn = document.getElementById("modal-close");
    const photoModal = document.getElementById("photo-modal");

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener("click", fecharModalFoto);
    }
    if (photoModal) {
        photoModal.addEventListener("click", (e) => {
            if (e.target === photoModal) fecharModalFoto();
        });
    }

    // Foto de Destaque da Pagina 8 (com bloqueio total no PageFlip)
    const heroPhoto = document.getElementById("hero-photo-placeholder");
    if (heroPhoto) {
        const defaultHeroUrl = `./Figurinhas/${encodeURIComponent("WhatsApp Image 2026-08-05 at 19.38.58 (3).jpeg")}`;
        ["click", "pointerdown", "touchstart"].forEach(evtName => {
            heroPhoto.addEventListener(evtName, (e) => {
                e.stopPropagation();
                if (evtName === "click") {
                    e.preventDefault();
                    abrirModalFoto(defaultHeroUrl, "Paula ❤️", "Feliz Aniversário! ❤️✨");
                }
            }, { passive: false });
        });
    }

    // 7. Corações flutuantes no fundo
    function criarCoracao() {
        const heart = document.createElement("div");
        heart.className = "floating-heart";
        heart.innerHTML = "❤️";

        const size = Math.random() * 16 + 10 + "px";
        const left = Math.random() * 100 + "vw";
        const duration = Math.random() * 7 + 6 + "s";
        const rotate = Math.random() * 360 - 180 + "deg";

        heart.style.setProperty("--size", size);
        heart.style.left = left;
        heart.style.setProperty("--duration", duration);
        heart.style.setProperty("--rotate", rotate);

        document.body.appendChild(heart);

        setTimeout(() => {
            heart.remove();
        }, 14000);
    }

    setInterval(criarCoracao, 500);

    // 8. Pull-to-Refresh (Estilo Instagram)
    let ptrStartY = 0;
    let ptrCurrentY = 0;
    let isPtrPulling = false;
    const ptrElement = document.getElementById("pull-to-refresh");
    const ptrIcon = ptrElement ? ptrElement.querySelector(".ptr-icon") : null;
    const ptrText = ptrElement ? ptrElement.querySelector(".ptr-text") : null;

    window.addEventListener("touchstart", (e) => {
        if (e.touches[0].clientY < 180) {
            ptrStartY = e.touches[0].clientY;
            isPtrPulling = true;
        }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (!isPtrPulling || !ptrElement) return;
        ptrCurrentY = e.touches[0].clientY;
        const pullDistance = ptrCurrentY - ptrStartY;

        if (pullDistance > 10) {
            const pullFactor = Math.min(pullDistance * 0.5, 75);
            ptrElement.classList.add("active");
            ptrElement.style.transform = `translate(-50%, ${pullFactor}px)`;

            if (pullDistance > 90) {
                if (ptrText) ptrText.textContent = "Solte para atualizar ❤️";
                if (ptrIcon) ptrIcon.style.transform = "rotate(180deg)";
            } else {
                if (ptrText) ptrText.textContent = "Puxe para atualizar";
                if (ptrIcon) ptrIcon.style.transform = "rotate(0deg)";
            }
        }
    }, { passive: true });

    window.addEventListener("touchend", () => {
        if (!isPtrPulling || !ptrElement) return;
        const pullDistance = ptrCurrentY - ptrStartY;
        isPtrPulling = false;

        if (pullDistance > 90) {
            ptrElement.classList.add("refreshing");
            if (ptrText) ptrText.textContent = "Atualizando... ✨";
            ptrElement.style.transform = `translate(-50%, 75px)`;
            setTimeout(() => {
                window.location.reload(true);
            }, 450);
        } else {
            ptrElement.style.transform = `translate(-50%, 0px)`;
            setTimeout(() => {
                ptrElement.classList.remove("active");
            }, 200);
        }
        ptrStartY = 0;
        ptrCurrentY = 0;
    });
});

