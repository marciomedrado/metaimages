# Meta AI Bulk Image Generator

Este é um script de automação (plugin CLI) que acessa a plataforma do [Meta AI](https://www.meta.ai/) e gera imagens em lote (*bulk*), baseado em um arquivo `.txt` ou inserção manual no terminal.

O script utiliza o **Playwright**, um framework de automação de navegadores, permitindo que a sessão seja mantida (dados de login salvos) e o navegador seja controlado programaticamente.

## Requisitos
- [Node.js](https://nodejs.org/) instalado.
- Acesso à internet e conta suportada pelo Meta AI (Meta, Facebook ou email, se necessário).

## Como Instalar

1. Abra o terminal nesta pasta.
2. Instale as dependências:
   ```bash
   npm install
   ```

## Como Usar (Interface Web)

1. Execute o script com o comando (ou clique em `Iniciar.bat`):
   ```bash
   npm start
   ```

### Funcionalidades do Dashboard:
O robô agora abre uma **interface visual profissional** no seu navegador padrão:
- **Arrastar e Soltar (File Drop):** Basta arrastar seu arquivo `.txt` para a tela e ele carrega todos os prompts automaticamente.
- **Inserção Manual:** Digite ou cole prompts diretamente na área de texto.
- **Modo de Navegador:** Escolha entre usar o robô isolado ou o seu Chrome original (onde você já pode estar logado).
- **Logs em Tempo Real:** Veja exatamente o que o robô está fazendo e em qual prompt ele está.
- **Galeria Integrada:** Visualize as imagens geradas na própria página conforme elas são salvas na pasta `output/`.

---
*Para os amantes de terminal, a versão antiga ainda pode ser acessada via `npm run cli`.*

---
*Para dúvidas mais complexas ou mudanças na página do Meta AI, o seletor da caixa de texto no arquivo `index.js` pode precisar de eventuais atualizações.*
