# Caixa Limpa · extensão do Chrome

Companheira do app [Caixa Limpa](https://pocahy.github.io/caixa-limpa/): Pomodoro no ícone, captura rápida e o seu dia sem abrir o app.

## O que faz
- **Pomodoro no ícone**: minutos restantes no badge (verde no foco, azul na pausa, laranja quando acaba), notificação do sistema com botões para iniciar a pausa ou pular, mesmo com o app fechado. Sincroniza com o timer do site.
- **Popup** (`Alt+Shift+C`): timer, seletor de tarefa agrupado por cliente · projeto, captura para a caixa de entrada, agenda e cobranças de hoje, foco do dia e botão para marcar próximas ações como "Hoje".
- **Atalho do Pomodoro** (`Alt+Shift+P`): inicia, pausa ou continua.
- **Captura de qualquer lugar**: botão direito em texto, link ou página → "Enviar para o Caixa Limpa"; ou na barra de endereço digite `cl` + espaço + texto. Durante o foco, cada captura conta como interrupção.
- **Bloqueio de sites no foco** (opcional, em Opções): mostra "Você está em foco" nos sites da sua lista enquanto o pomodoro roda.

## Instalar (modo desenvolvedor)
1. Baixe/extraia esta pasta `extension`.
2. Abra `chrome://extensions`, ligue **Modo do desenvolvedor** e clique em **Carregar sem compactação**, escolhendo a pasta.
3. O ID deve ser `bjcjjdfhjaanbfafmhebncfbocdojkhk` (fixo pela chave do manifest).

## Configurar o login (uma vez)
1. Firebase Console › Authentication › Método de login › Google › "Configuração do SDK da Web": copie o **ID do cliente da Web** para `config.js` (`googleClientId`).
2. Google Cloud Console (projeto caixa-limpa) › APIs e serviços › Credenciais › "Web client (auto created by Google Service)" › URIs de redirecionamento autorizados: adicione `https://bjcjjdfhjaanbfafmhebncfbocdojkhk.chromiumapp.org/`
3. Firebase › Authentication › Configurações › Domínios autorizados: adicione `bjcjjdfhjaanbfafmhebncfbocdojkhk.chromiumapp.org`
4. Recarregue a extensão em `chrome://extensions` e clique em "Entrar com Google" no popup.

A extensão fala com o Firestore pela API REST usando o mesmo login; as regras de `firestore.rules` continuam valendo.
