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

## Como Usar

Execute o script com o comando:
```bash
node index.js
```

### Funcionalidades
Você verá um menu com duas opções:
1. **Digitar um prompt manualmente**: Ideal para um teste rápido.
2. **Carregar a partir de um arquivo `.txt`**: Ideal para gerar imagens em bulk. Crie um arquivo (por exemplo, `prompts.txt`) com **um prompt por linha** e insira o caminho completo do arquivo.

### Primeira Execução (Login)
Na primeira vez que você rodar o script, ele abrirá um navegador visível. O terminal vai aguardar que você realize o login manualmente no site do Meta AI. 
Quando já estiver logado e na página onde há o chat/input, volte ao terminal e **aperte ENTER**.

- **Sessão Persistente:** Seus cookies e sessão não serão perdidos na próxima execução (salvos na pasta `browser_data`).

### Resultados
O script tenta capturar screenshots do final da tela onde a imagem foi gerada após cerca de 20 segundos de espera, e salva-los na pasta `output/`. Devido à interface dinâmica do Meta AI, capturar toda a conversa garante que o resultado fique registrado, bastando apenas recortar ou ver a imagem gerada.

---
*Para dúvidas mais complexas ou mudanças na página do Meta AI, o seletor da caixa de texto no arquivo `index.js` pode precisar de eventuais atualizações.*
