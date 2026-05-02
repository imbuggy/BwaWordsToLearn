import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
  await page.goto('https://imbuggy.github.io/BwaWordsToLearn/', { waitUntil: 'networkidle0' });
  const rootHtml = await page.evaluate(() => document.getElementById('root')?.innerHTML);
  console.log('ROOT HTML DUMP:', rootHtml.substring(0, 300));
  console.log('ROOT HTML LENGTH:', rootHtml ? rootHtml.length : 'null');
  await browser.close();
})();
