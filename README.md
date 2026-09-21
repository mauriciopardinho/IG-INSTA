# Alura Album - Copa do Mundo Tech (Frontend)

Este é o repositório do frontend do **Alura Album - Copa do Mundo Tech**, um álbum de figurinhas digital e interativo que celebra a história e as mentes brilhantes que moldaram e continuam moldando o mundo da tecnologia.

---

## 🎯 Objetivo do Projeto

O objetivo principal do projeto é oferecer uma experiência interativa e imersiva para colecionar figurinhas virtuais de gigantes da tecnologia. O álbum é dividido em categorias temáticas, como:
* 🤖 **Inteligência Artificial** (Pioneiros e marcos da área)
* 🐍 **Python** (Criadores, mantenedores e ferramentas)
* 🗄️ **Banco de Dados** (Tecnologias e mentes por trás do armazenamento de dados)
* 💻 **Sistemas Operacionais** (Desenvolvedores de Unix, Linux, macOS, etc.)
* 🇧🇷 **Devs do Brasil** (Grandes nomes e educadores da tecnologia nacional)

O frontend consome uma API local para carregar dinamicamente as imagens das figurinhas e preencher os slots correspondentes no álbum, exibindo uma animação realista de folheamento de páginas.

---

## 📂 Arquivos do Projeto

Abaixo estão explicadas as responsabilidades de cada arquivo na pasta [frontend](file:///c:/Users/Augusto/Desktop/Projeto Base/frontend):

### 1. 🌐 [index.html](file:///c:/Users/Augusto/Desktop/Projeto Base/frontend/index.html)
* **Função:** Define o esqueleto e a estrutura semântica da aplicação.
* **Detalhes:** 
  * Cria a estrutura do livro/álbum (`div` com id `book`) e define a capa, as páginas esquerdas e direitas com seus respectivos slots de figurinhas (`sticker-slot`), e a contracapa.
  * Inclui os botões de navegação lateral (Página Anterior/Próxima) e o botão de controle de áudio (Mudo/Som).
  * Importa as fontes do Google Fonts, a biblioteca de terceiros `St.PageFlip` (via CDN) para a animação do livro, a folha de estilo `style.css` e a lógica de comportamento `app.js`.

### 2. 🎨 [style.css](file:///c:/Users/Augusto/Desktop/Projeto Base/frontend/style.css)
* **Função:** Controla toda a estilização, design visual e responsividade da interface.
* **Detalhes:**
  * Define as variáveis globais de cor (`:root`) com tons escuros, azulados e metálicos para dar uma atmosfera futurista e "tech".
  * Aplica estilos responsivos às páginas do álbum, garantindo que o livro se ajuste bem a diferentes tamanhos de tela.
  * Implementa efeitos visuais modernos, incluindo gradientes de fundo, sombras para profundidade das páginas dobradas, animações de transição e um efeito de distorção (*glitch*) na capa.
  * Estiliza as figurinhas coladas (`slot-preenchido`) e suas transições suaves de aparição.

### 3. ⚙️ [app.js](file:///c:/Users/Augusto/Desktop/Projeto Base/frontend/app.js)
* **Função:** Implementa a lógica de comportamento, interatividade e integração com o backend.
* **Detalhes:**
  * **Interação do Livro:** Inicializa e configura a biblioteca `St.PageFlip` ajustando dimensões, sombras e tempos de transição. Implementa regras customizadas para detectar e executar o arraste de páginas evitando disparos acidentais ao clicar em links/botões.
  * **Integração com Backend:** Realiza uma requisição HTTP `GET` assíncrona (`fetch`) para obter a lista de figurinhas ativas no endereço do backend (`http://localhost:8000/figurinhas`).
  * **Preenchimento Dinâmico:** Varre os slots do HTML, extrai os IDs das figurinhas (ex: `#01` -> ID `1`), encontra o registro correspondente vindo do banco/API e insere a imagem da figurinha dinamicamente caso ela exista.
  * **Efeitos de Áudio:** Gerencia a reprodução de efeitos sonoros ao virar as páginas e o controle de ativação/desativação do som (Mudo).

---

## 🛠️ Como Executar

1. **Requisito do Backend:** Certifique-se de que o backend (ex: API em FastAPI) está rodando na porta `8000`:
   ```bash
   # Comando sugerido para rodar o backend
   uvicorn main:app --reload --port 8000
   ```
2. **Servir o Frontend:** Abra o arquivo `index.html` em um navegador. Para melhor funcionamento das requisições assíncronas, utilize uma extensão de servidor local (como *Live Server* no VS Code) ou rode um servidor HTTP simples no terminal dentro da pasta `frontend`:
   ```bash
   python -m http.server 3000
   ```
   Em seguida, acesse `http://localhost:3000` no seu navegador.
