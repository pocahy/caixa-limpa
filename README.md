# Caixa Limpa

App de produtividade pelo método **GTD** (Getting Things Done) com **Pomodoro** integrado.

- Captura rápida para a caixa de entrada
- Processamento guiado (acionável? menos de 2 min? delegar, agendar, projeto)
- Próximas ações por contexto, tempo e energia
- Projetos, Aguardando, Agendado, Algum dia, Referência
- Foco com Pomodoro (contagem por tarefa, interrupções capturadas, histórico de 7 dias)
- Revisão semanal guiada

Página única (`index.html`), sem build. Os dados ficam salvos no `localStorage` do navegador.

## Sincronização com Firebase

1. Crie um projeto em https://console.firebase.google.com
2. **Authentication** > Começar > Método de login > ative **Google**.
3. **Authentication** > Configurações > **Domínios autorizados** > adicione `pocahy.github.io`.
4. **Firestore Database** > Criar banco de dados (modo de produção, região `southamerica-east1`).
5. **Firestore** > Regras > cole o conteúdo de [`firestore.rules`](firestore.rules) e publique.
6. Configurações do projeto > Seus apps > adicione um app **Web** e copie o objeto `firebaseConfig` para [`firebase-config.js`](firebase-config.js).

Com isso o app mostra "Entrar com Google". Os dados ficam em `users/{uid}/items` e funcionam offline.
Na primeira vez que entrar, o app oferece importar o que estava salvo no navegador.
