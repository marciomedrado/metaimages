const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const port = 3600;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(path.join(__dirname, 'output')));

let currentStatus = {
    isRunning: false,
    current: 0,
    total: 0,
    logs: [],
    finished: false,
    waitingForApproval: false,
    outputPath: path.join(__dirname, 'output')
};

let browserContext = null;

function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    currentStatus.logs.push(`[${time}] ${msg}`);
    console.log(`[${time}] ${msg}`);
}

async function runAutomation(prompts, mode, customOutputPath, minDelay = 10, maxDelay = 30) {
    currentStatus.outputPath = customOutputPath || path.join(__dirname, 'output');
    currentStatus.isRunning = true;
    currentStatus.finished = false;
    currentStatus.current = 0;
    currentStatus.total = prompts.length;
    currentStatus.logs = [];
    currentStatus.waitingForApproval = false;

    const userDataDir = mode === 'user'
        ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
        : path.join(__dirname, 'browser_data');

    const launchOptions = {
        headless: false,
        viewport: null,
        channel: mode === 'user' ? 'chrome' : undefined
    };

    addLog('Iniciando o navegador para o processamento em lote...');

    try {
        const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
        browserContext = context;
        const page = await context.newPage();

        addLog('Navegando ate o site do Meta AI...');
        await page.goto('https://www.meta.ai/', { waitUntil: 'domcontentloaded' });

        currentStatus.waitingForApproval = true;
        addLog('--- AGUARDANDO AUTORIZACAO ---');
        addLog('Por favor, verifique se voce esta logado no Meta AI.');
        addLog('Clique em "ESTOU PRONTO" no seu Dashboard para comecar.');

        while (currentStatus.waitingForApproval) {
            await new Promise(r => setTimeout(r, 1000));
        }

        addLog('Autorizado! Iniciando processamento de prompts...');

        const outputDir = currentStatus.outputPath;
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        for (let i = 0; i < prompts.length; i++) {
            const prompt = prompts[i];
            currentStatus.current = i + 1;
            addLog(`Prompt (${i + 1}/${prompts.length}): "${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}"`);

            try {
                // Aguarda elementos
                await page.waitForTimeout(3000);

                // Localizador robusto
                let inputElement = page.getByRole('textbox').last();
                let isVisible = await inputElement.isVisible().catch(() => false);

                if (!isVisible) inputElement = page.locator('div[contenteditable="true"]').last();
                isVisible = await inputElement.isVisible().catch(() => false);

                if (!isVisible) inputElement = page.locator('textarea[placeholder*="Ask Meta AI"]').last();
                isVisible = await inputElement.isVisible().catch(() => false);

                if (!isVisible) {
                    addLog(`[!] Campo de entrada não encontrado para o prompt ${i + 1}. Aguardando 10s para ver se voce digita no site...`);
                    await page.waitForTimeout(10000);
                    continue;
                }

                const generateCommand = `imagine ${prompt}`;
                await inputElement.fill(generateCommand);
                await page.waitForTimeout(500);
                await page.keyboard.press('Enter');

                addLog('Gerando as 4 imagens (aguardando 25 segundos)...');
                await page.waitForTimeout(25000);

                // Download logic
                const imagesEls = await page.locator('img').elementHandles();
                let generated = [];
                for (const img of imagesEls) {
                    const box = await img.boundingBox();
                    if (box && box.width > 120 && box.height > 120) generated.push(img);
                }

                const last4 = generated.slice(-4);
                const pad = (num) => num.toString().padStart(2, '0');
                const letters = ['a', 'b', 'c', 'd'];

                for (let j = 0; j < last4.length; j++) {
                    const fileName = `${pad(i + 1)}${letters[j]}.png`;
                    const fullPath = path.join(outputDir, fileName);
                    try {
                        const src = await last4[j].getAttribute('src');
                        if (src && src.startsWith('http')) {
                            const response = await page.request.get(src);
                            fs.writeFileSync(fullPath, await response.body());
                        } else {
                            await last4[j].screenshot({ path: fullPath });
                        }
                    } catch (e) {
                        try { await last4[j].screenshot({ path: fullPath }); } catch (sq) { }
                    }
                }
                addLog(`Sucesso: ${last4.length} imagens salvas para este prompt.`);

                // Intervalo aleatorio entre prompts (exceto no ultimo)
                if (i < prompts.length - 1) {
                    const sleepTime = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + parseInt(minDelay);
                    addLog(`Aguardando ${sleepTime} segundos antes do proximo prompt...`);
                    await page.waitForTimeout(sleepTime * 1000);
                }

            } catch (err) {
                addLog(`Erro no prompt ${i + 1}: ${err.message}`);
            }
        }

        addLog('Tudo pronto! O navegador ficara aberto para voce conferir.');
        currentStatus.finished = true;

    } catch (error) {
        addLog(`Erro Critico: ${error.message}`);
        currentStatus.isRunning = false;
        currentStatus.finished = true;
    }
}

app.post('/api/start', (req, res) => {
    if (currentStatus.isRunning && !currentStatus.finished) {
        return res.status(400).json({ error: 'Ja existe um processo rodando.' });
    }
    const { prompts, mode, outputPath, minDelay, maxDelay } = req.body;
    runAutomation(prompts, mode, outputPath, minDelay, maxDelay);
    res.json({ message: 'Processo iniciado.' });
});

app.post('/api/approve', (req, res) => {
    currentStatus.waitingForApproval = false;
    res.json({ success: true });
});

app.get('/api/status', (req, res) => {
    res.json({
        isRunning: currentStatus.isRunning,
        current: currentStatus.current,
        total: currentStatus.total,
        logs: currentStatus.logs,
        finished: currentStatus.finished,
        waitingForApproval: currentStatus.waitingForApproval
    });
    // Limpa logs ja enviados para nao duplicar na interface
    currentStatus.logs = [];
});

app.get('/api/images', (req, res) => {
    const dir = currentStatus.outputPath;
    if (!fs.existsSync(dir)) return res.json({ images: [] });
    const files = fs.readdirSync(dir).filter(f => f.match(/\.(png|jpg|jpeg|webp)$/i));
    res.json({ images: files.reverse().slice(0, 50) }); // Mostra as 50 ultimas
});

app.get('/api/open-folder', (req, res) => {
    const dir = currentStatus.outputPath;
    exec(`explorer "${dir}"`);
    res.json({ success: true });
});

// Alias to serve files from wherever the user chose
app.get('/dynamic-output/:filename', (req, res) => {
    const filePath = path.join(currentStatus.outputPath, req.params.filename);
    res.sendFile(filePath);
});

app.listen(port, () => {
    console.log(`\n==========================================`);
    console.log(`   META AI STUDIO RUNNING ON PORT ${port}`);
    console.log(`   Acesse: http://localhost:${port}`);
    console.log(`==========================================\n`);
    addLog(`Servidor iniciado na porta ${port}`);

    // Auto-open browser
    exec(`start http://localhost:${port}`);
});
