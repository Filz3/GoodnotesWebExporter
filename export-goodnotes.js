//This script was created by Filz
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://web.goodnotes.com/home";
const DOWNLOAD_ROOT = "./Exports_GoodNotes";
const USER_DATA_DIR = './gn_session_data'; 
const METADATA_FILE = 'metadata.json'; // File to save metadata of all notebooks and progress

// --- TIMEOUTS ---
const TIMEOUT_GENERAL = 90000000; // Really high to ensure large notebooks are also exported within this time (might need to be increased depending on notebook size)
const TIMEOUT_LOGIN = 180000;      // So high because Goodnotes Web sometimes needs long to load (same for the next 2 timeout values)
const TIMEOUT_LONG = 120000;
const TIMEOUT_SHORT = 5000;

// --- SELECTORS ---
const DOCUMENT_SELECTOR = "[id^='libraryDocumentNotebookId-'], [id^='libraryDocumentFolderId-']";
const BACK_BUTTON_ID = "#libraryBreadcrumbsBackButton"; 
const SHARE_BUTTON_ID = '#exportAndShareButton'; // Share Button in notebook-View
const EXPORT_PDF_ID = '#exportAsPdf'; // PDF Export Button in Popover


// General Launch-Options
const commonLaunchOptions = {
    headless: false,
    args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox', 
        '--disable-setuid-sandbox',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
};


// --- Helpfunctions ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDir(directory) {
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
}

async function getTitle(element) {
    const titleEl = await element.$("p[title]");
    if (titleEl) {
        return await titleEl.getAttribute("title");
    }
    return null; 
}

function loadMetadata() {
    if (fs.existsSync(METADATA_FILE)) {
        console.log(`💾 Loading metadata from: ${METADATA_FILE}`);
        const data = fs.readFileSync(METADATA_FILE, 'utf-8');
        return JSON.parse(data);
    }
    return [];
}

function saveMetadata(data) {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Inital login process and persistent saving of the session.
 */
async function performLoginAndSaveSession() {
    console.log('----------------------------------------------------');
    console.log('🌐 FIRST START: Please login manually once.');
    console.log(`The session will be saved in "${USER_DATA_DIR}".`);
    console.log('----------------------------------------------------');

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, commonLaunchOptions);
    const page = await context.newPage();
    await page.goto('https://web.goodnotes.com/login'); 
    
    try {
        await page.waitForURL('https://web.goodnotes.com/home', { timeout: TIMEOUT_LOGIN }); 
        console.log('\n✅ Login successful. Session saved.');
        await sleep(2000); 
    } catch (error) {
        console.error('❌ Login-Timeout oder error in navigation.');
        await context.close();
        fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
        return null; 
    }
    
    return { context, page };
}


// --- PHASE 1: METADATA COLLECTION ---

async function collectMetadata(page, folderPath = [], allMetadata = []) {
    const folderPathStr = folderPath.join(" / ") || "ROOT";
    console.log(`\n🔍 Entering folder for metadata collection: ${folderPathStr}`);
    await sleep(1000);

    try {
        await page.waitForSelector(DOCUMENT_SELECTOR, { timeout: TIMEOUT_LONG });
    } catch (e) {
        // May be an empty folder, is OK
    }

    // Detect notebooks
    const notebookElements = await page.$$("[id^='libraryDocumentNotebookId-']");

    for (const el of notebookElements) {
        const title = await getTitle(el);
        if (title && title.trim().length > 0) {
            const entry = {
                path: folderPath,
                title: title,
                exported: false,
            };
            if (!allMetadata.some(item => item.title === entry.title && item.path.join('/') === entry.path.join('/'))) {
                allMetadata.push(entry);
								saveMetadata(allMetadata);
                console.log(`  ✅ Metadata recorded: ${title} in path /${folderPathStr}`);
            }
        }
    }

    // Detect subfolders
    const subfolders = await page.$$(`[id^='libraryDocumentFolderId-']`); 
    const folderNames = [];
    for (const folderEl of subfolders) {
        const name = await getTitle(folderEl);
        if (name && name.trim().length > 0) {
             folderNames.push(name);
        }
    }

    // Recursive navigation through subfodlers
    for (const name of folderNames) { 
        
        console.log(`➡️ Opening Subfolder for metadata collection: ${name}`);

        const currentFolderLocator = page.locator(`[id^='libraryDocumentFolderId-']:has(p[title="${name}"])`);
        
        try {
            await currentFolderLocator.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
        } catch (e) {
            console.warn(`⚠️ Could not find folder "${name}" (Metadata-Pass). Skipping.`);
            continue;
        }

        await currentFolderLocator.click(); 
        //await page.waitForLoadState('networkidle', { timeout: TIMEOUT_LONG }); //commented out because of networkidle issues
				console.log("  ⏳ Waiting 3 seconds for Goodnotes to hopefully load...");
        await sleep(3000);

        // Rekursiver Aufruf
        await collectMetadata(page, [...folderPath, name], allMetadata);

        // ZURÜCK NAVIGIEREN
        console.log(`⬅️ Back to: /${folderPathStr} (Metadata-Pass)`);
        
        try {
						await page.click(BACK_BUTTON_ID); // Clicking back button
						console.log("  ⏳ Waiting 3 seconds for Goodnotes to hopefully load...");
            await sleep(3000);
            //const backClickPromise = page.click(BACK_BUTTON_ID); commented out because of networkidle 3 lines below
            //await Promise.all([
//                backClickPromise,
//                page.waitForLoadState('networkidle', { timeout: TIMEOUT_LONG })
//            ]);
            await sleep(800);
        } catch (error) {
            console.warn(`⚠️ Error when returning: navigation not stable.`);
        }
    }
    return allMetadata;
}


// --- PHASE 2: EXPORT ENGINE ---

async function processExports(page, metadata) {
    if (metadata.length === 0) {
        console.log("ℹ️ No notebooks that are to be exported found.");
        return;
    }

    const total = metadata.length;
    let exportedCount = metadata.filter(item => item.exported).length;

    console.log(`\n⚙️ Starting export routine. ${exportedCount} of ${total} notebooks already exported.`);

    for (let i = 0; i < total; i++) {
        let entry = metadata[i];
        
        if (entry.exported) {
            continue; // Skip this notebook
        }

        const folderPathStr = entry.path.join(" / ") || "ROOT";
        console.log(`\n---> Export [${i + 1}/${total}]: ${entry.title} (Pfad: /${folderPathStr})`);
        
        // 1. Navigate to the correct folder (preparation for click)
        await page.goto(BASE_URL); // Playwright is waiting for 'load' by default
        console.log(`  ⏳ Waiting 10 seconds after navigation to base URL...`);
        await sleep(10000); // fixed waiting time of 10 seconds
        await page.waitForSelector(DOCUMENT_SELECTOR, { timeout: TIMEOUT_LONG });
        
        // Navigation to folder path
        for (const dirName of entry.path) {
            console.log(`  Navigating to fodler: ${dirName}`);
            const folderLocator = page.locator(`[id^='libraryDocumentFolderId-']:has(p[title="${dirName}"])`);
            await folderLocator.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
            await folderLocator.click();
            //await page.waitForLoadState('networkidle', { timeout: TIMEOUT_LONG }); //commented out, because networkidle cause issues. instead a hardcoded sleep of 5 seconds 2 lines below
						console.log("  ⏳ Waiting 5 seconds for Goodnotes to hopefully load...");
            await sleep(5000);
        }
        
        // 2. Open notebook and start export workflow
        try {
            const currentNotebookLocator = page.locator(`[id^='libraryDocumentNotebookId-']:has(p[title="${entry.title}"])`);
            
            await currentNotebookLocator.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
            await currentNotebookLocator.click();
            
           // await page.waitForLoadState('networkidle', { timeout: TIMEOUT_LONG }); //commented out, because networkidle cause issues. instead a hardcoded sleep of 20 seconds some lines below
            
            // Wait 20 seconds, to ensure loading of the notebook and hopefully prevent a bug, where Goodnotes is only exporting parts of the notebook´s content.
            console.log("  ⏳ Waiting 20 seconds for the notebook to finish loading...");
            await sleep(20000); 

            // Click buttongs to export
            const shareButton = page.locator(SHARE_BUTTON_ID);
            await shareButton.waitFor({ state: 'visible', timeout: TIMEOUT_LONG });
            await shareButton.click();
            await sleep(500);

            const exportAsPdfButton = page.locator(EXPORT_PDF_ID);
            await exportAsPdfButton.waitFor({ state: 'visible', timeout: TIMEOUT_SHORT });

            // Start download and wait
            const [download] = await Promise.all([
                page.waitForEvent("download", { timeout: TIMEOUT_GENERAL }),
                exportAsPdfButton.click(),
            ]);

            const targetDir = path.join(DOWNLOAD_ROOT, ...entry.path);
            await ensureDir(targetDir);
            const filePath = path.join(targetDir, `${entry.title}.pdf`);
            await download.saveAs(filePath);

            console.log(`  ✔️ Export successful! Saved as: ${filePath}`);
            
            // 3. Updating and saving metadata
            metadata[i].exported = true;
            saveMetadata(metadata);
            exportedCount++;
            console.log(`  💾 Progress updated. (${exportedCount}/${total})`);

        } catch (e) {
            console.error(`❌ Export error at "${entry.title}": ${e.message}`);
        }
    }

    console.log("\n🎉 All notebooks successfully exported!");
}


/** Starting the main program */
(async () => {
    let context, page;
    
    // --------------------------
    // 1. Load session
    // --------------------------
    
    if (fs.existsSync(USER_DATA_DIR)) {
        console.log(`🔒 Loading saved Session from: ${USER_DATA_DIR}`);
        try {
            context = await chromium.launchPersistentContext(USER_DATA_DIR, commonLaunchOptions);
            page = await context.newPage();
        } catch (e) {
            console.error(`❌ Error loading the session: ${e.message}`);
            fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
            return;
        }
    } else {
        const result = await performLoginAndSaveSession();
        if (!result) {
            console.log('❌ Process aborted.');
            return;
        }
        context = result.context;
        page = result.page;
    }

    //await page.goto(BASE_URL, { waitUntil: "networkidle" }); //commented out, because networkidle cause issues. instead a hardcoded sleep of 10 seconds 3 lines below and navigation to base URL by line below
		await page.goto(BASE_URL); // Playwright is waiting for 'load' by default
		console.log("  ⏳ Waiting 10 seconds for Goodnotes to hopefully load...");
		await sleep(10000);
    try {
        await page.waitForSelector(DOCUMENT_SELECTOR, { timeout: TIMEOUT_LONG });
    } catch (e) {
        console.error("❌ Login/Initialisation failed.");
        await context.close();
        return;
    }
    
    // --------------------------
    // 2. Prepare METADATA / Load
    // --------------------------
    
    let allMetadata = loadMetadata();
    
    // Skip metadata collection if metadata.json exists
    if (!fs.existsSync(METADATA_FILE)) { 
        console.log("\n--- START METADATA COLLECTION ---");
        
        // Start collection
        allMetadata = await collectMetadata(page, [], allMetadata);
        saveMetadata(allMetadata); // Initially save the complete list
        console.log(`\n--- METADATA COLLECTION finished. ${allMetadata.length} entries saved. ---`);
    } else {
        console.log("\n--- METADATA COLLECTION skipped (metadata.json already existing). ---");
    }

    // --------------------------
    // 3. Carry out the export
    // --------------------------

    console.log("\n--- START EXPORT ENGINE ---");
    await processExports(page, allMetadata);

    console.log("\n--- COMPLETE PROCESS FINISHED ---");
    await context.close();
})();
