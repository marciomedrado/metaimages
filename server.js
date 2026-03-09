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
    outputPath: path.join(__dirname, 'output'),
    currentPrompts: []
};

let browserContext = null;
let activePage = null;
let globalKnownSrcs = new Set();
let currentPromptsList = [];

function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    currentStatus.logs.push(`[${time}] ${msg}`);
    console.log(`[${time}] ${msg}`);
}

async function processSinglePrompt(page, prompt, i, outputDir, minDelay = 0, maxDelay = 0) {
    currentStatus.current = i + 1;
    addLog(`Processando prompt (${i + 1}/${currentStatus.total}): "${prompt.substring(0, 30)}..."`);

    try {
        await page.waitForTimeout(2000);

        // Localizador robusto
        let inputElement = page.getByRole('textbox').last();
        let isVisible = await inputElement.isVisible().catch(() => false);
        if (!isVisible) inputElement = page.locator('div[contenteditable="true"]').last();
        isVisible = await inputElement.isVisible().catch(() => false);
        if (!isVisible) inputElement = page.locator('textarea[placeholder*="Ask Meta AI"]').last();
        isVisible = await inputElement.isVisible().catch(() => false);

        if (!isVisible) {
            addLog(`[!] Campo de entrada não encontrado para o prompt ${i + 1}.`);
            return false;
        }

        // Captura URLs atuais antes de enviar o prompt para detectar o que é NOVO
        const existingSrcs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img')).map(img => img.src).filter(s => s);
        });
        const beforeSet = new Set(existingSrcs);

        const generateCommand = `imagine ${prompt}`;
        await inputElement.fill(generateCommand);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');

        addLog('Gerando imagens (aguardando deteção de novos arquivos)...');

        let waitTime = 0;
        const maxWaitTime = 90000;
        const interval = 2000;
        let newImagesFound = [];
        let detectedAt = null;

        while (waitTime < maxWaitTime) {
            await page.waitForTimeout(interval);
            waitTime += interval;

            const currentData = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('img')).map(img => ({
                    src: img.src,
                    width: img.width,
                    height: img.height,
                    naturalWidth: img.naturalWidth
                }));
            });

            newImagesFound = currentData.filter(img => {
                const isLarge = (img.naturalWidth > 100) || (img.width > 100);
                return isLarge && img.src && !beforeSet.has(img.src);
            });

            if (newImagesFound.length >= 4) {
                addLog(`Sucesso: 4 novas imagens detectadas!`);
                await page.waitForTimeout(4000); // Wait for highres
                break;
            } else if (newImagesFound.length > 0) {
                if (!detectedAt) detectedAt = waitTime;
                if (waitTime - detectedAt > 20000) {
                    addLog(`[!] Tempo esgotado esperando as 4 imagens. Salvando as ${newImagesFound.length} que apareceram.`);
                    break;
                }
            }
        }

        if (newImagesFound.length === 0) {
            addLog(`[!] Nenhuma nova imagem detectada para o prompt ${i + 1}.`);
            return false;
        }

        // Download e Save
        const imagesToSave = newImagesFound.slice(0, 4);
        const pad = (num) => num.toString().padStart(2, '0');
        const letters = ['a', 'b', 'c', 'd'];

        for (let j = 0; j < imagesToSave.length; j++) {
            const fileName = `${pad(i + 1)}${letters[j]}.png`;
            const fullPath = path.join(outputDir, fileName);
            const imgSrc = imagesToSave[j].src;

            // Se ja existir, deleta para substituir
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

            try {
                if (imgSrc && imgSrc.startsWith('http')) {
                    const response = await page.request.get(imgSrc);
                    fs.writeFileSync(fullPath, await response.body());
                } else {
                    const imgEl = await page.locator(`img[src="${imgSrc}"]`).first();
                    await imgEl.screenshot({ path: fullPath });
                }
                addLog(`-> Imagem salva: ${fileName}`);
            } catch (e) {
                addLog(`[!] Erro ao salvar ${fileName}: ${e.message}`);
            }
            globalKnownSrcs.add(imgSrc);
        }

        return true;
    } catch (err) {
        addLog(`Erro no processamento do prompt ${i + 1}: ${err.message}`);
        return false;
    }
}

async function runAutomation(prompts, mode, customOutputPath, minDelay = 10, maxDelay = 30) {
    currentStatus.outputPath = customOutputPath || path.join(__dirname, 'output');
    currentStatus.isRunning = true;
    currentStatus.finished = false;
    currentStatus.current = 0;
    currentStatus.total = prompts.length;
    currentPromptsList = prompts;
    currentStatus.currentPrompts = prompts;
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

    addLog('Iniciando o navegador...');

    try {
        const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
        browserContext = context;
        const page = await context.newPage();
        activePage = page;

        addLog('Navegando ate o site do Meta AI...');
        await page.goto('https://www.meta.ai/', { waitUntil: 'domcontentloaded' });

        currentStatus.waitingForApproval = true;
        addLog('--- AGUARDANDO AUTORIZACAO ---');
        addLog('Clique em "ESTOU PRONTO" apos estar logado.');

        while (currentStatus.waitingForApproval) {
            await new Promise(r => setTimeout(r, 1000));
        }

        const outputDir = currentStatus.outputPath;
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        for (let i = 0; i < prompts.length; i++) {
            if (!currentStatus.isRunning) break;

            await processSinglePrompt(page, prompts[i], i, outputDir);

            if (i < prompts.length - 1) {
                const sleepTime = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + parseInt(minDelay);
                addLog(`Aguardando ${sleepTime}s...`);
                await page.waitForTimeout(sleepTime * 1000);
            }
        }

        addLog('Processo concluido!');
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

app.get('/api/approved-images', (req, res) => {
    const dir = path.join(currentStatus.outputPath, 'Aprovados');
    if (!fs.existsSync(dir)) return res.json({ images: [] });
    const files = fs.readdirSync(dir).filter(f => f.match(/\.(png|jpg|jpeg|webp)$/i));
    res.json({ images: files });
});

app.get('/api/open-folder', (req, res) => {
    const dir = currentStatus.outputPath;
    exec(`explorer "${dir}"`);
    res.json({ success: true });
});

app.get('/api/current-prompts', (req, res) => {
    res.json({ prompts: currentPromptsList });
});

app.post('/api/generate-single', async (req, res) => {
    const { index } = req.body;
    if (!activePage) return res.status(400).json({ error: 'Navegador não está ativo.' });

    const prompt = currentPromptsList[index];
    if (!prompt) return res.status(400).json({ error: 'Prompt não encontrado.' });

    // Executa em "background" (async)
    processSinglePrompt(activePage, prompt, index, currentStatus.outputPath);

    res.json({ message: 'Dando início à geração individual...' });
});

app.post('/api/approve-image', (req, res) => {
    const { index, letter } = req.body;
    const pad = (num) => num.toString().padStart(2, '0');
    const promptNum = pad(index + 1);

    const outputDir = currentStatus.outputPath;
    const aprovadosDir = path.join(outputDir, 'Aprovados');

    if (!fs.existsSync(aprovadosDir)) {
        fs.mkdirSync(aprovadosDir, { recursive: true });
    }

    // Source file
    const srcFileName = `${promptNum}${letter}.png`;
    const srcPath = path.join(outputDir, srcFileName);

    if (!fs.existsSync(srcPath)) {
        return res.status(404).json({ error: 'Imagem original não encontrada. Gere as imagens primeiro.' });
    }

    // Find and remove existing approved image for this prompt index
    const files = fs.readdirSync(aprovadosDir);
    files.forEach(file => {
        if (file.startsWith(promptNum)) {
            fs.unlinkSync(path.join(aprovadosDir, file));
        }
    });

    // Copy new selection
    const destPath = path.join(aprovadosDir, srcFileName);
    fs.copyFileSync(srcPath, destPath);

    addLog(`Imagem ${srcFileName} aprovada e salva em /Aprovados`);
    res.json({ success: true, approvedFile: srcFileName });
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
