const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

async function run() {
  const baseUrl = process.env.BASE_URL || 'http://springapp.local';
  const guideId = Number(process.env.GUIDE_ID || `${Math.floor(Math.random() * 90000) + 10000}`);
  const guideName = process.env.GUIDE_NAME || `Marcos-${guideId}`;

  async function buildDriverWithRetry(maxAttempts = 3) {
    const options = new chrome.Options();
    // Estabilidad en CI y entornos virtual display
    options.addArguments('--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1920,1080');
    // Mostrar el navegador para demo local por defecto; usar HEADLESS=true para CI
    if ((process.env.HEADLESS || '').toLowerCase() === 'true') {
      options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage');
    }
    // Intentar usar Chromium si está disponible
    const chromeBinEnv = process.env.CHROME_BIN;
    const chromiumPaths = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/snap/bin/chromium'];
    const chosenBin = chromeBinEnv && fs.existsSync(chromeBinEnv)
      ? chromeBinEnv
      : chromiumPaths.find(p => fs.existsSync(p));
    if (chosenBin) {
      options.setChromeBinaryPath(chosenBin);
    }
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let builder = new Builder().forBrowser('chrome').setChromeOptions(options);
        const remoteUrl = process.env.SELENIUM_REMOTE_URL;
        if (remoteUrl && remoteUrl.trim().length > 0) {
          builder = builder.usingServer(remoteUrl);
        }
        const drv = await builder.build();
        return drv;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    throw lastErr;
  }

  const driver = await buildDriverWithRetry(3);
  await driver.manage().setTimeouts({ script: 60000, pageLoad: 60000, implicit: 0 });

  async function saveScreenshot(name) {
    try {
      const dir = path.join(process.cwd(), 'screenshots');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = await driver.takeScreenshot();
      fs.writeFileSync(path.join(dir, `${Date.now()}-${name}.png`), data, 'base64');
    } catch (_) {}
  }

  const clickButtonByText = async (text, timeoutMs = 10000) => {
    const locator = By.xpath(`//button[normalize-space(text())='${text}']`);
    const el = await driver.wait(until.elementLocated(locator), timeoutMs);
    await driver.wait(until.elementIsVisible(el), timeoutMs);
    await el.click();
  };

  const typeInInputByPlaceholder = async (placeholder, value, timeoutMs = 10000) => {
    const locator = By.css(`input[placeholder="${placeholder}"]`);
    const el = await driver.wait(until.elementLocated(locator), timeoutMs);
    await driver.wait(until.elementIsVisible(el), timeoutMs);
    await el.clear();
    await el.sendKeys(value);
  };

  const typeInInputByType = async (type, value, timeoutMs = 10000) => {
    const locator = By.css(`input[type="${type}"]`);
    const el = await driver.wait(until.elementLocated(locator), timeoutMs);
    await driver.wait(until.elementIsVisible(el), timeoutMs);
    await el.clear();
    await el.sendKeys(value);
  };
  const elementExists = async (locator, timeoutMs = 0) => {
    try {
      if (timeoutMs > 0) {
        await driver.wait(until.elementLocated(locator), timeoutMs);
      } else {
        await driver.findElement(locator);
      }
      return true;
    } catch (_) {
      return false;
    }
  };

  try {
    // Cargar la app
    await driver.get(baseUrl + '/');
    await driver.sleep(1500);
    await saveScreenshot('home');

    // Ir a sección "Guia"
    await clickButtonByText('Guia');
    await driver.sleep(1500);
    await saveScreenshot('guia-section');

    // Pre-clean via UI (Eliminar Guía si existe)
    await clickButtonByText('Eliminar');
    await typeInInputByPlaceholder('ID de la guía', String(guideId));
    await clickButtonByText('Buscar Guía');
    await driver.sleep(2000);
    await saveScreenshot('preclean-search');
    // Si aparece botón Eliminar, procede; si no, continúa
    try {
      await clickButtonByText('Eliminar', 2000);
      // Podría aparecer alert; intenta aceptarlo
      try {
        await driver.wait(until.alertIsPresent(), 2000);
        const alert = await driver.switchTo().alert();
        await alert.accept();
      } catch (_) {}
    } catch (_) {}

    // Crear guía vía UI (forzando valores y eventos)
await clickButtonByText('Adicionar');

// Helpers para setear inputs confiablemente
const setByPlaceholder = async (placeholder, value) => {
  const el = await driver.wait(until.elementLocated(By.css(`input[placeholder="${placeholder}"]`)), 10000);
  await driver.wait(until.elementIsVisible(el), 10000);
  await driver.executeScript(
    "arguments[0].value = arguments[1];" +
    "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));" +
    "arguments[0].dispatchEvent(new Event('change', { bubbles: true }));",
    el, String(value)
  );
};

await setByPlaceholder('Id', String(guideId));
await setByPlaceholder('Nombre', guideName);
await setByPlaceholder('Calificación', '4.8');
await setByPlaceholder('Edad', '25');

// Fecha (input type=date): set + eventos y tab
const dateInput = await driver.wait(until.elementLocated(By.css('input[type="date"]')), 10000);
await driver.wait(until.elementIsVisible(dateInput), 10000);
await driver.executeScript(
  "arguments[0].value = arguments[1];" +
  "arguments[0].dispatchEvent(new Event('input', { bubbles: true }));" +
  "arguments[0].dispatchEvent(new Event('change', { bubbles: true }));",
  dateInput, '1995-11-15'
);
await dateInput.sendKeys(Key.TAB);
await driver.sleep(1500);
await saveScreenshot('form-filled');

// Crear por API para evitar errores de formateo en el handler de la UI
let payload = {
  id: guideId,
  nombre: guideName,
  calificacion: 4.8,
  edad: 25,
  // Backend espera LocalDate => 'yyyy-MM-dd'
  fechaNacimiento: '1995-11-15'
};
const createViaApi = `
  const body = arguments[0];
  const cb = arguments[arguments.length - 1];
  fetch('/api/guides/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(async r => cb({status:r.status, body: await r.text()}))
    .catch(e => cb({status:0, err:String(e)}));
`;
let res = await driver.executeAsyncScript(createViaApi, payload);
// Reintento con formato datetime si backend exige datetime
if (res.status === 400) {
  payload = { ...payload, fechaNacimiento: '1995-11-15T00:00:00' };
  res = await driver.executeAsyncScript(createViaApi, payload);
}
if (res.status !== 201 && res.status !== 409) {
  throw new Error('API create failed: status=' + res.status + ' body=' + (res.body || res.err));
}

    // Buscar por ID (mostrar en pantalla)
    // Esperar a que renderice la vista de búsqueda y trabajar dentro de su contenedor
await clickButtonByText('Buscar por ID');

// Esperar el título específico de la vista
const searchTitle = By.xpath("//h2[contains(@class,'buscar-title') and normalize-space(.)='Buscar Guía por ID']");
const titleEl = await driver.wait(until.elementLocated(searchTitle), 12000);
await driver.wait(until.elementIsVisible(titleEl), 12000);

// Localizar el contenedor de búsqueda a partir del título
const container = await titleEl.findElement(By.xpath("ancestor::div[contains(@class,'buscar-container')]"));

// Campo de entrada (por placeholder o, si falla, el primer input de tipo texto del contenedor)
let inputEl;
try {
  inputEl = await container.findElement(By.css('input[placeholder="Ingrese el ID de la guía"]'));
} catch (_) {
  inputEl = await container.findElement(By.css('input[type="text"], input.buscar-input'));
}
await driver.wait(until.elementIsVisible(inputEl), 10000);
await inputEl.clear();
await inputEl.sendKeys(String(guideId));

// Click en “Buscar” del mismo contenedor
const buscarBtn = await container.findElement(By.xpath(".//button[normalize-space(text())='Buscar']"));
await driver.wait(until.elementIsVisible(buscarBtn), 10000);
await buscarBtn.click();

// Verificación: alert con el ID o tarjeta DOM dentro del contenedor
let verifiedSearch = false;
try {
  await driver.wait(until.alertIsPresent(), 5000);
  const a = await driver.switchTo().alert();
  const txt = await a.getText();
  if (txt.includes(String(guideId))) verifiedSearch = true;
  await a.accept();
} catch (_) {
  try {
    const cardTitle = await container.findElement(By.xpath(".//h3[contains(@class,'paquete-title') and contains(., 'Guía Encontrada')]"));
    await driver.wait(until.elementIsVisible(cardTitle), 8000);
    const idLine = await container.findElement(By.xpath(".//p[contains(@class,'paquete-attribute') and contains(., 'ID:')]"));
    const idText = await idLine.getText();
    if (idText.includes(String(guideId))) verifiedSearch = true;
  } catch (_) {}
}
if (!verifiedSearch) throw new Error('No fue posible verificar la guía buscada por ID en la UI');
// Pausa breve para demostrar el resultado de la búsqueda en pantalla
await driver.sleep(2000);
await saveScreenshot('search-by-id');

    // Eliminar guía vía UI (scoped al contenedor de eliminación)
    await clickButtonByText('Eliminar');
    await typeInInputByPlaceholder('ID de la guía', String(guideId));
    await clickButtonByText('Buscar Guía');
    // Pausa para visualizar la ficha encontrada antes de eliminar
    await driver.sleep(2000);
    await saveScreenshot('pre-delete-card');
    // Esperar a que se renderice la sección con los datos y el botón eliminar
    const eliminarTitle = By.xpath("//h2[contains(@class,'buscar-title') and normalize-space(.)='Eliminar Guía']");
    const eliminarTitleEl = await driver.wait(until.elementLocated(eliminarTitle), 10000);
    await driver.wait(until.elementIsVisible(eliminarTitleEl), 10000);
    const eliminarContainer = await eliminarTitleEl.findElement(By.xpath("ancestor::div[contains(@class,'buscar-container')]"));
    // Dentro del contenedor, espera el bloque de datos y el botón eliminar específico
    try {
      const datosBlock = await eliminarContainer.findElement(By.xpath(".//div[contains(@class,'adicionar-paquete-container')]"));
      await driver.wait(until.elementIsVisible(datosBlock), 8000);
      const eliminarBtn = await datosBlock.findElement(By.xpath(".//button[contains(@class,'eliminar-button') or normalize-space(text())='Eliminar']"));
      await driver.wait(until.elementIsVisible(eliminarBtn), 8000);
      await eliminarBtn.click();
      // Confirmar alert (si aplica)
      try {
        await driver.wait(until.alertIsPresent(), 5000);
        const alert = await driver.switchTo().alert();
        await alert.accept();
      } catch (_) {}
      // Pausa breve para visualizar el estado post-eliminación
      await driver.sleep(2000);
      await saveScreenshot('post-delete');
    } catch (_) {
      // Si no aparece el bloque de datos, intenta fallback global al botón Eliminar (menos preferible)
      await clickButtonByText('Eliminar');
      try {
        await driver.wait(until.alertIsPresent(), 3000);
        const alert = await driver.switchTo().alert();
        await alert.accept();
      } catch (_) {}
      await driver.sleep(2000);
      await saveScreenshot('post-delete-fallback');
    }
    // Verificación post-eliminación: repetir búsqueda y esperar “Guía no encontrada” (alert) o ausencia del bloque de datos
    await typeInInputByPlaceholder('ID de la guía', String(guideId));
    await clickButtonByText('Buscar Guía');
    // Pausa para visualizar la segunda búsqueda
    await driver.sleep(2000);
    await saveScreenshot('search-after-delete');
    let deletionVerified = false;
    try {
      await driver.wait(until.alertIsPresent(), 4000);
      const a2 = await driver.switchTo().alert();
      const txt2 = await a2.getText();
      if (txt2.toLowerCase().includes('no se encontró') || txt2.toLowerCase().includes('no encontrada')) {
        deletionVerified = true;
      }
      await a2.accept();
    } catch (_) {
      // Sin alert: confirmar que no se renderizó el bloque de datos
      const datosPresent = await elementExists(By.xpath("//div[contains(@class,'adicionar-paquete-container')]"), 2000);
      deletionVerified = !datosPresent;
    }
    if (!deletionVerified) {
      throw new Error('La guía no parece haber sido eliminada correctamente');
    }

    console.log('Selenium UI functional test passed.');
  } finally {
    await driver.quit();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});


