const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function run() {
  const baseUrl = process.env.BASE_URL || 'http://springapp.local';
  const guideId = Number(process.env.GUIDE_ID || `${Math.floor(Math.random() * 90000) + 10000}`);
  const guideName = process.env.GUIDE_NAME || 'Marcos';

  async function buildDriverWithRetry(maxAttempts = 3) {
    const options = new chrome.Options()
      .addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage');
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const drv = await new Builder()
          .usingServer('http://localhost:4444/wd/hub')
          .forBrowser('chrome')
          .setChromeOptions(options)
          .build();
        return drv;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    throw lastErr;
  }

  const driver = await buildDriverWithRetry(3);

  const execFetch = async (method, path, body) => {
    const script = `
      const cb = arguments[arguments.length - 1];
      const method = arguments[0];
      const url = arguments[1];
      const body = arguments[2];
      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })
      .then(async r => {
        const text = await r.text();
        cb({ status: r.status, body: text });
      })
      .catch(e => cb({ status: 0, error: String(e) }));
    `;
    return await driver.executeAsyncScript(script, method, `${baseUrl}${path}`, body || null);
  };

  try {
    // Cargar la app (para establecer contexto y cookies si aplica)
    await driver.get(baseUrl + '/');
    await driver.sleep(500);

    // Cleanup previo
    const delPre = await execFetch('DELETE', `/api/guides/delete/${guideId}`);
    if (![204, 404].includes(delPre.status)) {
      throw new Error(`Pre-cleanup delete unexpected status: ${delPre.status} body=${delPre.body}`);
    }

    // Crear guía
    const createBody = {
      id: guideId,
      nombre: guideName,
      calificacion: 4.8,
      edad: 25,
      fechaNacimiento: '1995-11-15'
    };
    const createRes = await execFetch('POST', '/api/guides/create', createBody);
    if (createRes.status !== 201) {
      throw new Error(`Create guide failed: status=${createRes.status} body=${createRes.body}`);
    }

    // Buscar por ID
    const getRes = await execFetch('GET', `/api/guides/getById/${guideId}`);
    if (getRes.status !== 200) {
      throw new Error(`Get guide failed: status=${getRes.status} body=${getRes.body}`);
    }

    // Borrar guía
    const delRes = await execFetch('DELETE', `/api/guides/delete/${guideId}`);
    if (delRes.status !== 204) {
      throw new Error(`Delete guide failed: status=${delRes.status} body=${delRes.body}`);
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


