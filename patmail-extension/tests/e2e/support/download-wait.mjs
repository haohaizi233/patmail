// Observe immediately, even when an earlier startup assertion fails before the
// caller reaches await. Keep the original promise so its rejection still fails
// the test when it is the primary failure.
export function observeDownload(page, onFailure, timeout = 400000) {
  const pending = page.waitForEvent('download', { timeout })
  void pending.catch(onFailure)
  return pending
}

export async function waitForControllingWorker(page, scriptUrl, timeout = 15000) {
  await page.waitForFunction(expected => navigator.serviceWorker?.controller?.scriptURL === expected, scriptUrl, {
    timeout,
  })
}
