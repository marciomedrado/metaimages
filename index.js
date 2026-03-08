const { chromium } = require('playwright');
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

    const userDataDir = path.join(__dirname, 'browser_data');
    console.log('\nStarting browser...');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Keep it visible so user can log in if needed
        viewport: null
    });

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
            // Find the chat textarea and type the prompt
            const textAreaSelector = 'textarea[placeholder*="Ask Meta AI"]'; // You may need to adapt this selector
            
            // Wait for text area to exist
            await page.waitForSelector(textAreaSelector, { timeout: 10000 }).catch(() => null);
            
            // Or maybe a different selector, let's try a generic approach for the main input
            const inputLocators = [
                'textarea[placeholder*="Ask Meta AI"]',
                'div[contenteditable="true"]',
                'textarea'
            ];

            let inputElement = null;
            for (const selector of inputLocators) {
                const el = await page.$(selector);
                if (el) {
                    inputElement = el;
                    break;
                }
            }

            if (!inputElement) {
                console.error("Could not find chat input field. The page structure might have changed.");
                console.log("Please select the input field manually, type 'imagine [your prompt]', and press Enter. This script is paused.");
                readline.question('Press ENTER after you generate it to continue to the next prompt, or Ctrl+C to stop...');
                continue;
            }

            // Fill the prompt. We prepend "imagine" to ensure it generates an image if needed
            const generateCommand = `imagine ${prompt}`;
            await inputElement.fill(generateCommand);
            await page.keyboard.press('Enter');

            console.log('Waiting for image generation (20 seconds)...');
            // Wait for generation
            await page.waitForTimeout(20000); 

            // Find images generated
            // Meta AI usually generates 4 images.
            console.log('Looking for generated image...');
            const images = await page.$$('img');
            
            // We can try to download all recent images or the largest one
            // We just grab screenshots of the page as a fallback or locate the actual generated image.
            // Since Meta AI DOM is complex, let's screenshot the whole page to not lose it, or look for specific styles.
            
            const timestamp = Date.now();
            await page.screenshot({ path: path.join(outputDir, `result_${i+1}_${timestamp}.png`), fullPage: true });
            console.log(`Saved screenshot for prompt ${i+1}`);

            // Optional: wait a bit before the next prompt
            await page.waitForTimeout(3000);

        } catch (error) {
            console.error(`Error processing prompt "${prompt}":`, error.message);
        }
    }

    console.log('\nAll prompts processed!');
    await context.close();
})();
