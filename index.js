const { chromium, errors } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline-sync');

(async () => {
    console.log('--- Meta AI Bulk Image Generator ---');
    console.log('1. Type a prompt manually');
    console.log('2. Load prompts from a .txt file');

    const choice = readline.question('Choose an option (1 or 2): ');
    let prompts = [];

    if (choice === '1') {
        const prompt = readline.question('Enter your prompt: ');
        if (prompt.trim()) prompts.push(prompt.trim());
    } else if (choice === '2') {
        const filePath = readline.question('Enter the path to your .txt file: ');
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            prompts = fileContent.split('\n').map(p => p.trim()).filter(p => p);
            console.log(`Loaded ${prompts.length} prompts from file.`);
        } else {
            console.error('File not found!');
            process.exit(1);
        }
    } else {
        console.error('Invalid choice.');
        process.exit(1);
    }

    if (prompts.length === 0) {
        console.log('No prompts to process. Exiting.');
        process.exit(0);
    }

    console.log('\n--- Navegador ---');
    console.log('Para usar o Meta AI, e necessario estar logado.');
    console.log('1. Usar o navegador interno do robô (Recomendado)');
    console.log('   -> Voce faz o login apenas 1 vez, e ele fica salvo para as proximas.');
    console.log('2. Usar o SEU Google Chrome padrao (Onde voce ja esta logado)');
    console.log('   -> IMPORTANTE: Para isso funcionar, voce TEM QUE FECHAR TODAS as janelas do seu Chrome original antes de abrir esta opcao, senao vai dar erro.');
    const navChoice = readline.question('Escolha a opcao de navegador (1 ou 2): ');

    let userDataDir;
    let launchOptions = {
        headless: false, // Keep it visible so user can log in if needed
        viewport: null
    };

    if (navChoice === '2') {
        // Usa o Chrome do usuario
        userDataDir = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
        launchOptions.channel = 'chrome'; // Forca o uso do chrome do PC
        console.log('\nCERTIFIQUE-SE DE TER FECHADO TOTALMENTE O CHROME! (Isso inclui no gerenciador de tarefas)');
        readline.question('Aperte ENTER quando o Chrome estiver 100% fechado...');
    } else {
        // Usa diretorio dedicado
        userDataDir = path.join(__dirname, 'browser_data');
    }

    console.log('\nStarting browser...');
    let context;
    try {
        context = await chromium.launchPersistentContext(userDataDir, launchOptions);
    } catch (error) {
        if (error.message.includes('another instance is using the profile') || error.message.includes('EBUSY')) {
            console.error('\n[ERRO CRITICO] O seu Google Chrome ainda esta aberto ou rodando em segundo plano!');
            console.error('Por favor, feche todas as janelas do Google Chrome (e os processos em segundo plano dele) antes de tentar usar a Opcao 2.');
            process.exit(1);
        }
        throw error;
    }

    const page = await context.newPage();
    console.log('Navigating to Meta AI...');
    await page.goto('https://www.meta.ai/', { waitUntil: 'domcontentloaded' });

    console.log('\n*** IMPORTANT ***');
    console.log('If you are not logged in, please log in manually now.');
    console.log('Once you are logged in and on the chat page, press ENTER in this terminal to continue.');
    readline.question('Press ENTER when ready...');

    // create output directory
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        console.log(`\n[${i + 1}/${prompts.length}] Processing prompt: "${prompt}"`);

        try {
            // Aguarda a interface do Meta AI reagir caso a pagina ainda esteja carregando
            await page.waitForTimeout(2000);

            // Busca pelo textbox da entrada usando role (acessibilidade)
            let inputElement = await page.getByRole('textbox').last();
            let isVisible = await inputElement.isVisible().catch(() => false);

            if (!isVisible) {
                // Alternativa 1: div com contenteditable true
                inputElement = await page.locator('div[contenteditable="true"]').last();
                isVisible = await inputElement.isVisible().catch(() => false);
            }
            if (!isVisible) {
                // Alternativa 2: textarea direto 
                inputElement = await page.locator('textarea[placeholder*="Ask Meta AI"], textarea[placeholder*="Message"]').last();
                isVisible = await inputElement.isVisible().catch(() => false);
            }

            if (!isVisible) {
                console.error("\n[!] Nao foi possivel encontrar o campo de texto do Meta AI.");
                console.log("-> Se for a sua PRIMEIRA VEZ acessando essa opcao de login, va a janela do Chrome aberta e FACA SEU LOGIN.");
                console.log("-> Se voce ja estava logado, o site do Meta AI pode ter bloqueado ou modificado a pagina.");
                console.log("\nO script esta pausado. Se quiser prosseguir manualmente:");
                readline.question('Digite no site "imagine ' + prompt + '" e aperte Enter la. Depois APERTE ENTER AQUI no terminal para ir p/ o proximo...');
                continue;
            }

            // Fill the prompt. We prepend "imagine" to ensure it generates an image if needed
            const generateCommand = `imagine ${prompt}`;
            await inputElement.fill(generateCommand);
            await page.waitForTimeout(500);
            await page.keyboard.press('Enter');

            console.log('Waiting for image generation (20 seconds)...');
            // Wait for generation
            await page.waitForTimeout(20000);

            console.log('Procurando pelas imagens geradas...');

            // Pega todos os elementos de imagem na tela
            const images = await page.locator('img').elementHandles();
            let generatedImages = [];

            // Filtra para pegar apenas as imagens maiores (ignorando icones, avatares, etc.)
            for (const img of images) {
                const box = await img.boundingBox();
                if (box && box.width > 100 && box.height > 100) {
                    generatedImages.push(img);
                }
            }

            // Seleciona as ultimas 4 imagens identificadas (assumindo que sao as geradas agora)
            const last4Images = generatedImages.slice(-4);

            if (last4Images.length === 0) {
                console.log('[!] Nenhuma imagem de tamanho adequado encontrada. Fazendo screenshot inteiro da pagina...');
                const timestamp = Date.now();
                const pad = (num) => num.toString().padStart(2, '0');
                await page.screenshot({ path: path.join(outputDir, `fallback_${pad(i + 1)}_${timestamp}.png`), fullPage: true });
            } else {
                const pad = (num) => num.toString().padStart(2, '0');
                const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
                const promptNumStr = pad(i + 1);

                for (let j = 0; j < last4Images.length; j++) {
                    const letter = letters[j] || `${j}`;
                    const fileName = `${promptNumStr}${letter}.png`; // ex: 01a.png

                    try {
                        // Tenta extrair src e baixar diretamente para qualidade maxima
                        const src = await last4Images[j].getAttribute('src');
                        if (src && src.startsWith('http')) {
                            const response = await page.request.get(src);
                            const buffer = await response.body();
                            fs.writeFileSync(path.join(outputDir, fileName), buffer);
                        } else {
                            // Se fallback (ex: imagem em base64 ou protegida), tira screenshot do proprio elemento
                            await last4Images[j].screenshot({ path: path.join(outputDir, fileName) });
                        }
                        console.log(`-> Imagem salva: ${fileName}`);
                    } catch (err) {
                        console.log(`-> (Fallback) Salvando element screenshot para ${fileName}`);
                        await last4Images[j].screenshot({ path: path.join(outputDir, fileName) });
                    }
                }
            }

            // Optional: wait a bit before the next prompt
            await page.waitForTimeout(3000);

        } catch (error) {
            console.error(`Error processing prompt "${prompt}":`, error.message);
        }
    }

    console.log('\n--- Finalizado! ---');
    console.log('Todos os prompts foram processados.');
    console.log('O navegador continuara ABERTO para voce conferir as imagens.');
    console.log('Pressione Ctrl+C neste terminal para encerrar o programa finalizando o navegador.');

    // Mantem o script rodando infinitamente ate o usuario cancelar
    await new Promise(() => { });
})();
